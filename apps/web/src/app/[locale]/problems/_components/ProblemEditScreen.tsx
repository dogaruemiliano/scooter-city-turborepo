"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { v1 } from "@repo/api-shared";
import { Button, PageLayout } from "@repo/ui/components";
import { PageTitleOverride } from "@/components/PageTitleOverride";
import { Feedback, useRemote } from "@/components/WorkspaceForm";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { webApi } from "@/lib/api";
import { CreateProblem } from "./ProblemForms";

export function ProblemEditScreen({
  id,
  todo: isTodo = false,
}: {
  id: string;
  todo?: boolean;
}) {
  const t = useTranslations("workspace");
  const locale = resolveRouteLocale(useLocale());
  const router = useRouter();
  const load = useCallback(
    () =>
      webApi.fetch(
        `/v1/problems/${encodeURIComponent(id)}`,
        v1.problems.problemSchema,
        { cache: "no-store" },
      ),
    [id],
  );
  const remote = useRemote(load);
  const problem = remote.data;
  const todo = problem ? problem.scooterId === null : isTodo;
  const returnPath = localizePath(
    `${todo ? "/todos" : "/problems"}/${encodeURIComponent(id)}`,
    locale,
  );
  return (
    <PageLayout>
      <PageTitleOverride title={t(todo ? "todos.edit" : "problems.edit")} />
      <div className="mx-auto flex w-full max-w-(--breakpoint-md) flex-1 flex-col">
        <Feedback error={remote.error} />
        {remote.error ? (
          <Button variant="outline" onClick={remote.reload}>
            {t("retry")}
          </Button>
        ) : null}
        {remote.loading ? <p role="status">{t("loading")}</p> : null}
        {problem &&
        !remote.loading &&
        !remote.error &&
        (problem.status === "open" || problem.status === "in_progress") ? (
          <CreateProblem
            key={`${problem.id}:${problem.revision}`}
            todo={todo}
            initialProblem={problem}
            stickyActions
            onReloadLatest={remote.reload}
            onCancel={() => router.push(returnPath)}
            onSaved={() => {
              router.push(returnPath);
              router.refresh();
            }}
          />
        ) : problem && !remote.loading && !remote.error ? (
          <>
            <p role="status">{t("problems.editUnavailable")}</p>
            <Button variant="outline" onClick={() => router.push(returnPath)}>
              {t("cancel")}
            </Button>
          </>
        ) : null}
      </div>
    </PageLayout>
  );
}
