"use client";

import { v1 } from "@repo/api-shared";
import { Button, Label, Textarea } from "@repo/ui/components";
import { ClipboardPasteIcon, ImportIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
  MAX_IMPORT_CHARACTERS,
  parseDocumentImport,
} from "./scooter-document-import";
import { ScooterImportInstructions } from "./ScooterImportInstructions";
import { ScooterImportDialog } from "./ScooterImportDialog";
import type {
  ScooterEditorField,
  ScooterEditorValues,
} from "./scooter-editor-schema";

export function ScooterDocumentImport({
  brands,
  editing,
  disabled,
  onRawFields,
  rawFields,
}: {
  brands: v1.scooterBrands.ScooterBrand[];
  editing: boolean;
  disabled: boolean;
  rawFields: Record<string, string>;
  onRawFields: (fields: Record<string, string>) => void;
}) {
  const t = useTranslations("scooters");
  const id = useId();
  const form = useFormContext<ScooterEditorValues>();
  const [open, setOpen] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [readingClipboard, setReadingClipboard] = useState(false);
  const clipboardRequest = useRef(0);
  const pasteRef = useRef<HTMLButtonElement>(null);
  const jsonRef = useRef<HTMLTextAreaElement>(null);
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [review, setReview] = useState<{
    unresolved: string[];
    conflicts: string[];
    snapshot: ScooterEditorValues;
  } | null>(null);
  function changeOpen(nextOpen: boolean) {
    clipboardRequest.current += 1;
    setReadingClipboard(false);
    setOpen(nextOpen);
  }

  async function pasteJson() {
    const request = ++clipboardRequest.current;
    setReadingClipboard(true);
    setError(null);
    try {
      const text = await navigator.clipboard.readText();
      if (request !== clipboardRequest.current) return;
      if (text.length > MAX_IMPORT_CHARACTERS) {
        setError(t("documentImport.invalidJson"));
        return;
      }
      setJson(text);
      setShowEditor(true);
      if (!text.trim()) setError(t("documentImport.clipboardEmpty"));
    } catch {
      if (request !== clipboardRequest.current) return;
      setShowEditor(true);
      setError(t("documentImport.pasteManuallyHint"));
    } finally {
      if (request === clipboardRequest.current) setReadingClipboard(false);
    }
  }

  function apply() {
    setError(null);
    setFeedback(null);
    const result = parseDocumentImport(
      json,
      brands,
      form.getValues(),
      editing,
      rawFields,
    );
    if (!result.ok) {
      setError(
        t(`documentImport.${result.reason}`, {
          fields: result.fields.join(", "),
        }),
      );
      return;
    }
    for (const [field, value] of Object.entries(result.values)) {
      form.setValue(field as ScooterEditorField, value, {
        shouldDirty: true,
        shouldTouch: true,
      });
    }
    if (result.rawFields) onRawFields(result.rawFields);
    setReview({
      unresolved: result.unresolved,
      conflicts: result.emptyConflicts,
      snapshot: form.getValues(),
    });
    // Use the same resolver as manual input for cross-field validation and errors.
    void form.trigger();
    const count = Object.keys(result.values).length;
    setFeedback(
      [
        count || result.rawFields ? t("documentImport.applied", { count }) : "",
        result.rawFields ? t("documentImport.rawApplied") : "",
        result.confirmedEmpty.length
          ? t("documentImport.confirmedEmpty", {
              fields: result.confirmedEmpty
                .map((field) =>
                  t(`fields.${field === "brandName" ? "brand" : field}`),
                )
                .join(", "),
            })
          : "",
        result.unmatchedBrand
          ? t("documentImport.unmatchedBrand", { brand: result.unmatchedBrand })
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
    changeOpen(false);
  }

  return (
    <div className="grid gap-4 border-y border-border py-8 sm:py-10">
      <ScooterImportDialog
        open={open}
        onOpenChange={changeOpen}
        title={t("documentImport.title")}
        description={t("documentImport.help")}
        closeLabel={t("actions.close")}
        initialFocus={pasteRef}
        trigger={
          <Button
            type="button"
            size="lg"
            disabled={disabled}
            aria-describedby={`${id}-entry-hint`}
            className="w-full justify-self-center sm:w-auto sm:px-8"
          >
            <ImportIcon aria-hidden="true" className="size-5" />
            {t("documentImport.open")}
          </Button>
        }
        footer={
          showEditor && json.trim() ? (
            <Button
              type="button"
              disabled={disabled || readingClipboard}
              onClick={apply}
            >
              {t("documentImport.apply")}
            </Button>
          ) : null
        }
      >
        <ScooterImportInstructions editing={editing} disabled={disabled} />
        <div
          data-slot="import-entry-actions"
          className="grid grid-cols-2 gap-2"
        >
          <Button
            ref={pasteRef}
            type="button"
            variant={showEditor && json.trim() ? "outline" : "default"}
            disabled={disabled || readingClipboard}
            onClick={() => void pasteJson()}
          >
            <ClipboardPasteIcon aria-hidden="true" />
            {t(
              readingClipboard
                ? "documentImport.pasting"
                : "documentImport.paste",
            )}
          </Button>
          <Button
            type="button"
            variant="text"
            disabled={disabled || readingClipboard}
            onClick={() => {
              setShowEditor(true);
              requestAnimationFrame(() => jsonRef.current?.focus());
            }}
          >
            {t("documentImport.pasteManually")}
          </Button>
        </div>
        {showEditor ? (
          <div className="grid gap-2">
            <Label htmlFor={id}>{t("documentImport.jsonLabel")}</Label>
            <Textarea
              ref={jsonRef}
              id={id}
              value={json}
              rows={6}
              className="field-sizing-fixed"
              maxLength={MAX_IMPORT_CHARACTERS}
              disabled={disabled || readingClipboard}
              spellCheck={false}
              autoCapitalize="none"
              placeholder={'{"vin": "…", "powerKw": 2.4}'}
              aria-invalid={Boolean(error)}
              aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
              onChange={(event) => {
                setJson(event.target.value);
                setError(null);
              }}
            />
            <p id={`${id}-hint`} className="text-sm text-muted-foreground">
              {t("documentImport.mergeHint")}
            </p>
          </div>
        ) : null}
        {error ? (
          <p
            id={`${id}-error`}
            role="alert"
            className="break-words text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </ScooterImportDialog>
      <p
        id={`${id}-entry-hint`}
        className="max-w-md justify-self-center text-center text-sm text-muted-foreground"
      >
        {t("documentImport.entryHint")}
      </p>
      {review ? <ImportReviewWarnings review={review} /> : null}
      {feedback ? (
        <p role="status" className="text-sm text-muted-foreground">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}

/** Warnings remain visible until the corresponding form value changes or the user acknowledges review. */
function ImportReviewWarnings({
  review,
}: {
  review: {
    unresolved: string[];
    conflicts: string[];
    snapshot: ScooterEditorValues;
  };
}) {
  const t = useTranslations("scooters");
  const { control } = useFormContext<ScooterEditorValues>();
  const values = useWatch({ control });
  const [acknowledged, setAcknowledged] = useState<typeof review | null>(null);
  const unchanged = (key: string) => {
    const field = key === "brandName" ? "brandId" : (key as ScooterEditorField);
    return values[field] === review.snapshot[field];
  };
  const label = (key: string) =>
    t(`fields.${key === "brandName" ? "brand" : key}`);
  const unresolved = review.unresolved.filter(unchanged);
  const conflicts = review.conflicts.filter(unchanged);
  if (acknowledged === review || (!unresolved.length && !conflicts.length))
    return null;
  return (
    <div className="grid gap-2">
      <div role="alert" className="grid gap-2 text-sm">
        {unresolved.length ? (
          <p>
            {t("documentImport.reviewUnresolved", {
              fields: unresolved.map(label).join(", "),
            })}
          </p>
        ) : null}
        {conflicts.length ? (
          <p>
            {t("documentImport.reviewEmptyConflict", {
              fields: conflicts.map(label).join(", "),
            })}
          </p>
        ) : null}
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setAcknowledged(review)}
        >
          {t("documentImport.markReviewed")}
        </Button>
      </div>
    </div>
  );
}
