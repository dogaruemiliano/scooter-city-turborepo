"use client";

import { useCallback, useState } from "react";
import { v1 } from "@repo/api-shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@repo/ui/components/button";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { webApi } from "@/lib/api";
import { Feedback, useRemote } from "@/components/WorkspaceForm";
import { ProblemDetailSheet } from "../../problems/_components/ProblemDetailSheet";
import { ProblemListItem } from "../../problems/_components/ProblemListItem";

export function ScooterProblems({ scooterId }: { scooterId: string }) {
  const t = useTranslations("workspace");
  const locale = resolveRouteLocale(useLocale());
  const { user } = useSession();
  const router = useRouter();
  const [selected, setSelected] = useState<v1.problems.Problem | null>(null);
  const [page, setPage] = useState(1);
  const load = useCallback(
    () =>
      webApi.fetch(
        `/v1/problems?scooterId=${encodeURIComponent(scooterId)}&page=${page}`,
        v1.problems.problemListSchema,
        { cache: "no-store" },
      ),
    [scooterId, page],
  );
  const loadHold = useCallback(
    () =>
      webApi.fetch(
        `/v1/problems/scooters/${encodeURIComponent(scooterId)}/hold`,
        v1.problems.maintenanceHoldSchema,
        { cache: "no-store" },
      ),
    [scooterId],
  );
  const remote = useRemote(load);
  const hold = useRemote(loadHold);
  function reload() {
    remote.reload();
    hold.reload();
    router.refresh();
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{t("problems.scooterSection")}</CardTitle>
          {canAccess(user, "problems.create") ? (
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={`${localizePath("/problems/new", locale)}?scooterId=${encodeURIComponent(scooterId)}`}
            >
              {t("problems.add")}
            </Link>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Feedback error={hold.error} />
        {hold.error ? (
          <Button
            className="self-start"
            variant="outline"
            onClick={hold.reload}
          >
            {t("retry")}
          </Button>
        ) : null}
        {hold.data?.onHold ? (
          <div className="flex flex-col gap-3 rounded-lg border border-destructive p-4">
            <Badge variant="destructive" className="self-start">
              {t("problems.maintenanceHold")}
            </Badge>
            <p className="text-sm">
              {t("problems.remainingBlockers", { count: hold.data.count })}
            </p>
            <ul className="flex flex-col gap-2">
              {hold.data.blockers.map((blocker) => (
                <li
                  key={blocker.id}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span className="text-sm font-medium">{blocker.title}</span>
                  <Badge variant="outline">
                    {t(`problems.${blocker.status}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Feedback error={remote.error} />
        {remote.error ? (
          <Button
            className="self-start"
            variant="outline"
            onClick={remote.reload}
          >
            {t("retry")}
          </Button>
        ) : null}
        {remote.loading ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("loading")}
          </p>
        ) : null}
        {remote.data ? (
          <>
            <div className="flex flex-col gap-3">
              {remote.data.items.length ? (
                remote.data.items.map((problem) => (
                  <ProblemListItem
                    key={problem.id}
                    problem={problem}
                    expanded={selected?.id === problem.id}
                    onToggle={() => setSelected(problem)}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("problems.noScooterProblems")}
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                disabled={page === 1 || remote.loading}
                onClick={() => {
                  setPage((v) => v - 1);
                  setSelected(null);
                }}
              >
                {t("previous")}
              </Button>
              <Button
                variant="outline"
                disabled={
                  remote.loading ||
                  page * remote.data.pageSize >= remote.data.total
                }
                onClick={() => {
                  setPage((v) => v + 1);
                  setSelected(null);
                }}
              >
                {t("next")}
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
      <ProblemDetailSheet
        problem={selected}
        onClose={() => setSelected(null)}
        onChanged={(problem) => {
          setSelected(problem);
          reload();
        }}
      />
    </Card>
  );
}
