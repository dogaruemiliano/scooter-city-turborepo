"use client";

import { useTranslations } from "next-intl";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
} from "@repo/ui/components";
import { useFormContext, useWatch } from "react-hook-form";
import type { ScooterEditorValues } from "./scooter-editor-schema";

export function ScooterCreateStatus({
  documentCount,
  status,
}: {
  documentCount: number;
  status: string;
}) {
  const t = useTranslations("scooters");
  const { control } = useFormContext<ScooterEditorValues>();
  const registration = useWatch({ control, name: "registrationType" });
  return (
    <aside className="grid min-w-0 content-start gap-4 lg:sticky lg:top-24">
      <Card>
        <CardHeader>
          <CardTitle>{t("creation.registrationSummary")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Badge variant="secondary">
            {registration
              ? t(`registrationTypes.${registration}`)
              : t("placeholders.registrationType")}
          </Badge>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("fleetNumber.assignedOnSave")}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("creation.documentsSummary")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            {t(
              documentCount
                ? "creation.documentsCount"
                : "creation.noDocuments",
              { count: documentCount },
            )}
          </p>
          <p role="status" className="text-sm font-medium">
            {status}
          </p>
        </CardContent>
      </Card>
    </aside>
  );
}
