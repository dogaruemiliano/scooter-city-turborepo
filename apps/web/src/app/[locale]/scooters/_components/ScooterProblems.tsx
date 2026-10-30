"use client";

import { useCallback, useState } from "react";
import { v1 } from "@repo/api-shared";
import {
  Badge,
  BottomSheet,
  BottomSheetBody,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components";
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
  const shared = useTranslations("shared");
  const locale = resolveRouteLocale(useLocale());
  const { user } = useSession();
  const loadHold = useCallback(
    () =>
      webApi.fetch(
        `/v1/problems/scooters/${encodeURIComponent(scooterId)}/hold`,
        v1.problems.maintenanceHoldSchema,
        { cache: "no-store" },
      ),
    [scooterId],
  );
  const hold = useRemote(loadHold);
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
        <ScooterProblemList scooterId={scooterId} activeOnly />
        <BottomSheet>
          <BottomSheetTrigger render={<Button variant="outline" />}>
            {t("problems.viewAllScooterProblems")}
          </BottomSheetTrigger>
          <BottomSheetContent className="lg:w-(--container-form-columns)">
            <BottomSheetHeader>
              <BottomSheetTitle>
                {t("problems.allScooterProblems")}
              </BottomSheetTitle>
            </BottomSheetHeader>
            <BottomSheetBody>
              <ScooterProblemList scooterId={scooterId} />
            </BottomSheetBody>
            <BottomSheetFooter>
              <BottomSheetClose render={<Button variant="outline" />}>
                {shared("actions.close")}
              </BottomSheetClose>
            </BottomSheetFooter>
          </BottomSheetContent>
        </BottomSheet>
      </CardContent>
    </Card>
  );
}

function ScooterProblemList({
  scooterId,
  activeOnly = false,
}: {
  scooterId: string;
  activeOnly?: boolean;
}) {
  const t = useTranslations("workspace");
  const [selected, setSelected] = useState<v1.problems.Problem | null>(null);
  const [page, setPage] = useState(1);
  const load = useCallback(async () => {
    const fetchPage = (page: number, status?: "open" | "in_progress") =>
      webApi.fetch(
        `/v1/problems?scooterId=${encodeURIComponent(scooterId)}&page=${page}${status ? `&status=${status}&pageSize=100` : ""}`,
        v1.problems.problemListSchema,
        { cache: "no-store" },
      );
    if (!activeOnly) return fetchPage(page);

    // Filter on the server so historical reports cannot crowd active work out
    // of the first page. The API accepts one status per request.
    const groups = await Promise.all(
      (["open", "in_progress"] as const).map(async (status) => {
        const first = await fetchPage(1, status);
        const items = [...first.items];
        for (let next = 2; (next - 1) * first.pageSize < first.total; next++) {
          items.push(...(await fetchPage(next, status)).items);
        }
        return items;
      }),
    );
    const items = groups
      .flat()
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      );
    return { items, total: items.length, page: 1, pageSize: items.length };
  }, [scooterId, activeOnly, page]);
  const remote = useRemote(load);

  return (
    <>
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
      ) : remote.data && !remote.error ? (
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
                {t(
                  activeOnly
                    ? "problems.noActiveScooterProblems"
                    : "problems.noScooterProblems",
                )}
              </p>
            )}
          </div>
          {!activeOnly &&
          (page > 1 || remote.data.total > remote.data.pageSize) ? (
            <div className="flex gap-3">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((v) => v - 1)}
              >
                {t("previous")}
              </Button>
              <Button
                variant="outline"
                disabled={page * remote.data.pageSize >= remote.data.total}
                onClick={() => setPage((v) => v + 1)}
              >
                {t("next")}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
      <ProblemDetailSheet
        problem={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
