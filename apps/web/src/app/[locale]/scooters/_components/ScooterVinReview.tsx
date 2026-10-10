"use client";

import { Button, Checkbox, Input, Label } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { ScooterVinCorrection } from "./scooter-vin-review";

export interface VinReviewDocument {
  sourceId: string;
  fileName: string;
  vin: string | null;
  originalVin: string | null;
}

export function ScooterVinReview({
  documents,
  disabled,
  onApply,
}: {
  documents: VinReviewDocument[];
  disabled: boolean;
  onApply: (corrections: ScooterVinCorrection[]) => void;
}) {
  const t = useTranslations("scooters.extraction.vinReview");
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(documents.map((doc) => [doc.sourceId, doc.vin ?? ""])),
  );
  const [confirmed, setConfirmed] = useState(false);
  const normalized = documents.map((doc) => ({
    ...doc,
    value: (values[doc.sourceId] ?? "").trim().toUpperCase(),
  }));
  const valid = normalized.every((doc) =>
    doc.value ? /^[A-HJ-NPR-Z0-9]{17}$/.test(doc.value) : doc.vin === null,
  );
  const mismatch =
    new Set(normalized.map((doc) => doc.value).filter(Boolean)).size > 1;
  const corrections = normalized.flatMap((doc) =>
    doc.value && doc.value !== doc.vin
      ? [{ sourceId: doc.sourceId, previousVin: doc.vin, vin: doc.value }]
      : [],
  );

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="grid gap-4 rounded-md border border-warning p-4"
    >
      <div className="grid gap-2">
        <h2 id={`${id}-title`} className="font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      {normalized.map((doc, index) => {
        const inputId = `${id}-${index}`;
        const invalid =
          (doc.vin !== null || Boolean(doc.value)) &&
          !/^[A-HJ-NPR-Z0-9]{17}$/.test(doc.value);
        return (
          <div key={doc.sourceId} className="grid min-w-0 gap-2">
            <Label htmlFor={inputId} className="break-words">
              {doc.fileName}
            </Label>
            <Input
              id={inputId}
              value={values[doc.sourceId] ?? ""}
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={invalid}
              aria-describedby={`${inputId}-reading${invalid ? ` ${inputId}-error` : ""}`}
              onChange={(event) => {
                setValues((current) => ({
                  ...current,
                  [doc.sourceId]: event.target.value,
                }));
                setConfirmed(false);
              }}
            />
            <p
              id={`${inputId}-reading`}
              className="break-words text-sm text-muted-foreground"
            >
              {t("original", { vin: doc.originalVin ?? t("unreadable") })}
            </p>
            {invalid ? (
              <p id={`${inputId}-error`} className="text-sm text-destructive">
                {t("invalid")}
              </p>
            ) : null}
          </div>
        );
      })}
      {mismatch ? (
        <p role="status" className="text-sm text-warning">
          {t("mismatch")}
        </p>
      ) : null}
      <label className="flex items-start gap-3 text-sm">
        <Checkbox
          checked={confirmed}
          disabled={disabled}
          onCheckedChange={(checked) => setConfirmed(checked === true)}
        />
        <span>{t("confirm")}</span>
      </label>
      <Button
        type="button"
        className="justify-self-start"
        disabled={
          disabled || !valid || mismatch || !corrections.length || !confirmed
        }
        onClick={() => onApply(corrections)}
      >
        {t("apply")}
      </Button>
    </section>
  );
}
