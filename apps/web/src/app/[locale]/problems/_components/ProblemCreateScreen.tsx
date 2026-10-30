"use client";

import { PageLayout } from "@repo/ui/components/page-layout";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { PageTitleOverride } from "@/components/PageTitleOverride";
import { CreateProblem } from "./ProblemForms";

export function ProblemCreateScreen({
  scooterId,
  todo = false,
}: {
  scooterId?: string;
  todo?: boolean;
}) {
  const t = useTranslations("workspace");
  const locale = resolveRouteLocale(useLocale());
  const router = useRouter();
  const returnPath = localizePath(
    todo
      ? "/todos"
      : scooterId
        ? `/scooters/${encodeURIComponent(scooterId)}`
        : "/problems",
    locale,
  );
  return (
    <PageLayout>
      <PageTitleOverride title={t(todo ? "todos.add" : "problems.add")} />
      <div className="mx-auto flex w-full max-w-(--breakpoint-md) flex-1 flex-col">
        <CreateProblem
          todo={todo}
          stickyActions
          scooterId={scooterId}
          onCancel={() => router.push(returnPath)}
          onSaved={() => {
            router.push(returnPath);
            router.refresh();
          }}
        />
      </div>
    </PageLayout>
  );
}
