"use client";
import { useEffect, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import { Button, FormSection } from "@repo/ui/components";
import { FormField } from "@/components/form/FormField";
import { FormDateField } from "@/components/form/controls";
import { webApi } from "@/lib/api";
import type { ScooterEditorValues } from "./scooter-editor-schema";

type Evidence = Pick<
  v1.scooters.ScooterDocument,
  "id" | "fileName" | "extractedData"
> & { version?: "original" | "client_copy" };
export function itpValidityReadings(documents: Evidence[]) {
  const current = v1.scooters.latestScooterItpEvidence(
    v1.scooters.scooterItpEvidence(documents),
  );
  if (current.some((row) => row.result === "failed")) return [];
  return current.flatMap((row, index) => {
    const dates = row.conflicts
      ? [
          ...new Set(
            row.sources
              .map((source) => source.reading.validUntil)
              .filter((date): date is string => Boolean(date)),
          ),
        ]
      : row.validUntil
        ? [row.validUntil]
        : [];
    return dates.map((date) => ({
      date,
      inspectionDate: row.inspectionDate,
      source: row.sources.map((source) => source.fileName).join(" · "),
      id: `${index}-${date}`,
    }));
  });
}

export function ScooterItpValidityFields({
  scooter,
  evidence = [],
  disabled = false,
  number,
}: {
  scooter?: v1.scooters.Scooter;
  evidence?: Evidence[];
  disabled?: boolean;
  number?: number;
}) {
  const t = useTranslations("scooters.compliance");
  const ti = useTranslations("scooters.itp");
  const form = useFormContext<ScooterEditorValues>();
  const value =
    useWatch({ control: form.control, name: "itpValidUntil" }) ?? "";
  const [source, setSource] = useState<string>();
  const autoValue = useRef<string | undefined>(undefined);
  const currentEvidence = v1.scooters.latestScooterItpEvidence(
    v1.scooters.scooterItpEvidence(evidence),
  );
  const evidenceConflicts =
    v1.scooters.scooterItpEvidenceConflicts(currentEvidence);
  const readings = itpValidityReadings(evidence);
  const latest = readings[0]?.inspectionDate;
  const candidates = [
    ...new Map(
      readings
        .filter((entry) => entry.inspectionDate === latest)
        .map((entry) => [entry.date, entry]),
    ).values(),
  ];
  const issuedAt = useWatch({ control: form.control, name: "civIssuedAt" });
  const hasItpEvidence = evidence.some((doc) =>
    doc.extractedData?.documents?.some(
      (entry) =>
        entry.documentType === "itp_card" ||
        entry.documentType === "itp_certificate",
    ),
  );
  const civExpiry =
    !hasItpEvidence &&
    scooter?.itpStatus !== "failed" &&
    scooter?.itpStatus !== "review" &&
    issuedAt
      ? v1.scooters.initialScooterItpExpiry(issuedAt)
      : null;
  const candidate =
    candidates.length === 1 && !evidenceConflicts
      ? candidates[0]?.date
      : candidates.length
        ? undefined
        : (civExpiry ?? undefined);
  useEffect(() => {
    if (
      !disabled &&
      !candidate &&
      autoValue.current &&
      form.getValues("itpValidUntil") === autoValue.current
    ) {
      form.setValue("itpValidUntil", "", { shouldDirty: true });
      autoValue.current = undefined;
    }
    if (
      !disabled &&
      candidate &&
      (!form.getValues("itpValidUntil") ||
        form.getValues("itpValidUntil") === autoValue.current)
    ) {
      form.setValue("itpValidUntil", candidate, { shouldDirty: true });
      autoValue.current = candidate;
    }
  }, [candidate, form, disabled]);
  const scooterId = scooter?.id;
  const savedUpdatedAt = scooter?.updatedAt;
  const savedCivIssuedAt = scooter?.civIssuedAt;
  useEffect(() => {
    if (!scooterId) return;
    const controller = new AbortController();
    void webApi
      .fetch(
        v1.scooters.ROUTES.itp.list(scooterId),
        v1.scooters.scooterItpListSchema,
        { signal: controller.signal, cache: "no-store" },
      )
      .then((data) => {
        if (!controller.signal.aborted)
          setSource(
            data.inspections[0]?.source ??
              (savedCivIssuedAt && data.validUntil ? "civ" : undefined),
          );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [scooterId, savedUpdatedAt, savedCivIssuedAt]);
  const displaySource = candidates.some((entry) => entry.date === value)
    ? "document"
    : civExpiry === value
      ? "civ"
      : value && value !== scooter?.itpValidUntil
        ? "manual"
        : source;
  return (
    <FormSection panel number={number} title={ti("title")} columns={1}>
      <div className="grid gap-4">
        <FormField
          name="itpValidUntil"
          label={ti("validUntil")}
          disabled={disabled}
        >
          <FormDateField />
        </FormField>
        <p className="text-sm text-muted-foreground">{t("itpHelp")}</p>
        {hasItpEvidence && !candidate && !value ? (
          <p className="text-sm text-warning">{ti("manualRecovery")}</p>
        ) : null}
        {displaySource ? (
          <p className="text-sm text-muted-foreground">
            {displaySource === "civ"
              ? ti("calculatedFromCiv")
              : ti(
                  displaySource === "manual"
                    ? "manualSource"
                    : "documentSource",
                )}
          </p>
        ) : null}
        {candidates.length > 1 || evidenceConflicts ? (
          <p role="alert" className="text-sm text-warning">
            {t("itpConflict")}
          </p>
        ) : null}
        {candidates
          .filter((entry) => entry.date !== value)
          .map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {entry.source}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  form.setValue("itpValidUntil", entry.date, {
                    shouldDirty: true,
                  })
                }
              >
                {t("useItp", { date: entry.date })}
              </Button>
            </div>
          ))}
      </div>
    </FormSection>
  );
}
