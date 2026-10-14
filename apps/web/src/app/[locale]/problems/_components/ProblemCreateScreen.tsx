"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { PageTitleOverride } from "@/components/PageTitleOverride";
import { CreateProblem } from "./ProblemForms";

export function ProblemCreateScreen({ scooterId }: { scooterId?: string }) {
  const t = useTranslations("workspace");
  const locale = resolveRouteLocale(useLocale());
  const router = useRouter();
  const returnPath = localizePath(
    scooterId ? `/scooters/${encodeURIComponent(scooterId)}` : "/problems",
    locale,
  );
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-6 px-4 pt-4 md:px-8 md:pt-8">
      <PageTitleOverride title={t("problems.add")} />
      <div className="flex w-full max-w-(--breakpoint-md) flex-1 flex-col">
        <CreateProblem
          stickyActions
          scooterId={scooterId}
          onCancel={() => router.push(returnPath)}
          onSaved={() => {
            router.push(returnPath);
            router.refresh();
          }}
        />
      </div>
    </main>
  );
}
