"use client";

import { Alert, AlertDescription } from "@repo/ui/components";
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ReadinessIssue } from "./types";

export function ReadinessSection({ issues }: { issues: ReadinessIssue[] }) {
  const t = useTranslations("persons");

  if (issues.length === 0) {
    return null;
  }

  return (
    <section aria-label={t("detail.readiness.title")} className="grid gap-2">
      {issues.map((issue) => (
        <Alert key={issue} variant="warning">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>
            {t(`detail.readiness.issues.${issue}`)}
          </AlertDescription>
        </Alert>
      ))}
    </section>
  );
}
