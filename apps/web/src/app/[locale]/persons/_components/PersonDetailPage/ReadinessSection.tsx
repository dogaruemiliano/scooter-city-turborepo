"use client";

import { BadgeCheckIcon, CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ReadinessIssue } from "./types";

export function ReadinessSection({ issues }: { issues: ReadinessIssue[] }) {
  const t = useTranslations("persons");
  const isReady = issues.length === 0;

  return (
    <section className="grid min-w-0 gap-3 rounded-lg bg-muted p-4 md:grid-cols-3 md:gap-6">
      <div className="flex items-center gap-2">
        {isReady ? (
          <BadgeCheckIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-success"
          />
        ) : (
          <CircleAlertIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-warning"
          />
        )}
        <h2 className="text-base font-semibold md:text-sm">
          {t("detail.readiness.title")}
        </h2>
      </div>
      <div className="md:col-span-2">
        {isReady ? (
          <p className="text-sm text-muted-foreground">
            {t("detail.readiness.readyDescription")}
          </p>
        ) : (
          <ul className="grid gap-2 text-sm text-muted-foreground">
            {issues.map((issue) => (
              <li key={issue} className="flex items-start gap-2">
                <CircleAlertIcon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-warning"
                />
                <span>{t(`detail.readiness.issues.${issue}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
