"use client";

import { PageLayout } from "@repo/ui/components/page-layout";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import { Badge, Button, CardAccent } from "@repo/ui/components";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { PageTitleOverride } from "@/components/PageTitleOverride";
import { Feedback, useRemote } from "@/components/WorkspaceForm";
import { webApi } from "@/lib/api";
import { ScooterCover } from "@/components/ScooterCover";
import { ProblemWork } from "./ProblemForms";

const statusColors = {
  open: "text-info",
  in_progress: "text-link",
  resolved: "text-success",
  cancelled: "text-muted-foreground",
} satisfies Record<v1.problems.Problem["status"], string>;

const difficultyColors = {
  easy: "bg-difficulty-easy",
  medium: "bg-difficulty-medium",
  hard: "bg-difficulty-hard",
} satisfies Record<NonNullable<v1.problems.Problem["difficulty"]>, string>;

const priorityColors = {
  low: "text-info",
  normal: "text-link",
  high: "text-warning",
  urgent: "text-destructive",
} satisfies Record<v1.problems.Problem["priority"], string>;

export function ProblemDetailScreen({ id }: { id: string }) {
  const t = useTranslations("workspace");
  const locale = resolveRouteLocale(useLocale());
  const load = useCallback(
    () =>
      webApi.fetch(
        `/v1/problems/${encodeURIComponent(id)}`,
        v1.problems.problemSchema,
        { cache: "no-store" },
      ),
    [id],
  );
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(
    null,
  );
  const remote = useRemote(load);
  const problem = remote.data;
  return (
    <PageLayout>
      <Feedback error={remote.error} />
      {remote.error ? (
        <Button
          variant="outline"
          className="self-start"
          onClick={remote.reload}
        >
          {t("retry")}
        </Button>
      ) : null}
      {remote.loading && !problem ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("loading")}
        </p>
      ) : null}
      {problem ? (
        <div className="mx-auto flex min-w-0 w-full max-w-(--container-form-columns) flex-col gap-8">
          <PageTitleOverride title={problem.title} />
          <div className="flex flex-col gap-3">
            <div
              ref={setActionsTarget}
              data-slot="problem-actions"
              className="hidden justify-end md:flex"
            />
            <dl className="grid grid-cols-2 gap-3">
              {[
                {
                  label: t("status"),
                  value: t(`problems.${problem.status}`),
                  color: statusColors[problem.status],
                },
                {
                  label: t("problems.priority"),
                  value: t(`problems.${problem.priority}`),
                  color: priorityColors[problem.priority],
                },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="flex min-w-0 flex-col gap-1 first:items-start last:items-end"
                >
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </dt>
                  <dd
                    className={`text-sm font-bold uppercase wrap-anywhere ${color}`}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          {problem.blocksUsage &&
          !problem.holdClearedAt &&
          (problem.status === "open" || problem.status === "in_progress") ? (
            <Badge variant="destructive" className="self-start">
              {t("problems.blocksUsage")}
            </Badge>
          ) : null}
          <section className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card p-5 text-card-foreground">
            {problem.difficulty ? (
              <CardAccent className={difficultyColors[problem.difficulty]} />
            ) : null}
            <span className="sr-only">
              {t("problems.difficulty")}:{" "}
              {t(`problems.${problem.difficulty ?? "unassessed"}`)}
            </span>
            <h1 className="text-xl font-semibold wrap-anywhere">
              {problem.title}
            </h1>
            <p className="whitespace-pre-wrap text-sm leading-relaxed wrap-anywhere">
              {problem.description || t("problems.noDescription")}
            </p>
          </section>
          <Link
            className="flex min-h-20 items-center gap-4 rounded-2xl border border-border bg-card p-4 text-card-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={localizePath(
              `/scooters/${encodeURIComponent(problem.scooterId)}`,
              locale,
            )}
          >
            <ScooterCover scooter={problem.scooter} />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-base font-semibold">
                {v1.scooters.scooterDisplayCode(problem.scooter)}
              </span>
              <span className="text-sm text-muted-foreground">
                {problem.scooter.brandName} {problem.scooter.model}
              </span>
            </span>
          </Link>
          <ProblemWork
            actionsTarget={actionsTarget}
            compact
            key={problem.id}
            problem={problem}
            reload={(updated) => {
              if (updated) remote.setData(updated);
              else remote.reload();
            }}
          />
        </div>
      ) : null}
    </PageLayout>
  );
}
