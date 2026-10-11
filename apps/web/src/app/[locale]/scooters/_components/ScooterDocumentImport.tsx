"use client";

import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";

import { v1 } from "@repo/api-shared";
import { Button, Checkbox, Label, Textarea } from "@repo/ui/components";
import {
  FileJsonIcon,
  ImportIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";
import {
  MAX_IMPORT_CHARACTERS,
  parseDocumentImport,
  type DocumentImportResult,
} from "./scooter-document-import";
import type { DocumentSource } from "./scooter-document-sources";
import { useScooterImportReview } from "./ScooterImportReview";
import { ScooterImportInstructions } from "./ScooterImportInstructions";
import { ScooterImportDialog } from "./ScooterImportDialog";
import { ScooterVinReference } from "./ScooterVinReference";
import type {
  ScooterEditorField,
  ScooterEditorValues,
} from "./scooter-editor-schema";

// UTF-8 may use up to four bytes per character; check decoded length as well.
const MAX_IMPORT_BYTES = MAX_IMPORT_CHARACTERS * 4;

export function ScooterDocumentImport({
  brands,
  editing,
  disabled,
  onRawFields,
  rawFields,
  insuranceFiles = [],
  onImport,
  sources = [],
  onApplyImport,
  secondary = false,
}: {
  brands: v1.scooterBrands.ScooterBrand[];
  editing: boolean;
  sources?: DocumentSource[];
  onApplyImport?: (result: Extract<DocumentImportResult, { ok: true }>) => void;
  onImport: (result: Extract<DocumentImportResult, { ok: true }>) => void;
  disabled: boolean;
  insuranceFiles?: { fileName: string; insurancePolicyId?: string | null }[];
  rawFields: Record<string, string>;
  onRawFields: (fields: Record<string, string>) => void;
  secondary?: boolean;
}) {
  const t = useTranslations("scooters");
  const canWrite = canAccess(
    useOptionalSession()?.user,
    "scooter_documents.write",
  );
  const id = useId();
  const form = useFormContext<ScooterEditorValues>();
  const [vinReviewed, setVinReviewed] = useState(false);
  const [needsVinReview, setNeedsVinReview] = useState(false);
  const [importedVin, setImportedVin] = useState<string>();
  const [open, setOpen] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRequest = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLButtonElement>(null);
  const jsonRef = useRef<HTMLTextAreaElement>(null);
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const {
    count: reviewCount,
    reviewFields,
    reviewImport,
  } = useScooterImportReview();
  useEffect(
    () => () => {
      fileRequest.current += 1;
    },
    [],
  );

  function changeOpen(nextOpen: boolean) {
    fileRequest.current += 1;
    setReadingFile(false);
    setOpen(nextOpen);
  }

  function parseJson(text: string) {
    return parseDocumentImport(
      text,
      brands,
      form.getValues(),
      editing,
      rawFields,
      insuranceFiles,
      sources,
    );
  }

  function showImportError(
    result: Extract<DocumentImportResult, { ok: false }>,
    text: string,
  ) {
    if (result.reason === "invalidSources" && result.sourceIssue) {
      const { kind, provided, uploaded } = result.sourceIssue;
      const none = t("documentImport.sourceIssues.none");
      setError(
        t(`documentImport.sourceIssues.${kind}`, {
          provided: provided.join(", ") || none,
          uploaded: uploaded.join(", ") || none,
        }),
      );
      return;
    }
    setError(
      t(`documentImport.${result.reason}`, {
        fields: result.fields.join(", "),
        count: text.length,
        limit: MAX_IMPORT_CHARACTERS,
      }),
    );
  }

  async function readJsonFile(file: File) {
    const request = ++fileRequest.current;
    setReadingFile(false);
    setJson("");
    setFileName(null);
    setVinReviewed(false);
    setNeedsVinReview(false);
    setError(null);
    if (!/\.json$/i.test(file.name)) {
      setError(t("documentImport.invalidFileType"));
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setError(t("documentImport.fileTooLarge", { limit: MAX_IMPORT_BYTES }));
      return;
    }
    setReadingFile(true);
    try {
      const text = await file.text();
      if (request !== fileRequest.current) return;
      const result = parseJson(text);
      if (!result.ok) {
        showImportError(result, text);
        return;
      }
      setJson(text);
      setFileName(file.name);
      setNeedsVinReview(Boolean(result.needsVinReview));
      setImportedVin(result.values.vin);
    } catch {
      if (request !== fileRequest.current) return;
      setError(t("documentImport.fileReadError"));
    } finally {
      if (request === fileRequest.current) setReadingFile(false);
    }
  }

  function apply() {
    if (!canWrite) return;
    setError(null);
    const result = parseJson(json);
    if (!result.ok) {
      showImportError(result, json);
      return;
    }
    if (result.needsVinReview && !vinReviewed) {
      setNeedsVinReview(true);
      setImportedVin(result.values.vin);
      return;
    }
    if (result.insurancePolicies)
      result.insurancePolicies = result.insurancePolicies.map((policy) => ({
        ...policy,
        vinReviewConfirmed:
          policy.vinReviewConfirmed || (vinReviewed && !policy.documentVin),
      }));
    onImport(result);
    if (onApplyImport) onApplyImport(result);
    else {
      if (result.insurancePolicies)
        form.setValue(
          "insurancePolicies",
          result.insurancePolicies.map((policy) => ({
            ...policy,
            vinReviewConfirmed:
              policy.vinReviewConfirmed || (vinReviewed && !policy.documentVin),
          })),
          { shouldDirty: true, shouldTouch: true },
        );
      for (const [field, value] of Object.entries(result.values)) {
        form.setValue(field as ScooterEditorField, value, {
          shouldDirty: true,
          shouldTouch: true,
        });
      }
      if (result.rawFields) onRawFields(result.rawFields);
    }
    reviewImport(result, form.getValues());
    // Keep normal form validation separate from non-blocking extraction warnings.
    if (editing) void form.trigger();
    changeOpen(false);
  }

  if (!canWrite) return null;

  return (
    <div
      className={
        secondary
          ? "grid justify-items-start gap-3"
          : "grid gap-4 border-y border-border py-8 sm:py-10"
      }
    >
      <ScooterImportDialog
        open={open}
        onOpenChange={changeOpen}
        title={t("documentImport.title")}
        description={t("documentImport.help")}
        closeLabel={t("actions.close")}
        initialFocus={uploadRef}
        trigger={
          <Button
            type="button"
            size={secondary ? "default" : "lg"}
            variant={secondary ? "text" : "default"}
            disabled={disabled}
            className={
              secondary
                ? undefined
                : "w-full justify-self-center sm:w-auto sm:px-8"
            }
          >
            <ImportIcon aria-hidden="true" className="size-5" />
            {t("documentImport.open")}
          </Button>
        }
        footer={
          json.trim() ? (
            <Button
              type="button"
              disabled={disabled || readingFile || Boolean(error)}
              onClick={apply}
            >
              {t("documentImport.apply")}
            </Button>
          ) : null
        }
      >
        <ScooterImportInstructions
          editing={editing}
          disabled={disabled}
          sources={sources}
        />
        <div
          data-slot="import-entry-actions"
          className="grid grid-cols-2 gap-2"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            aria-label={t("documentImport.upload")}
            className="hidden"
            disabled={disabled}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void readJsonFile(file);
            }}
          />
          <Button
            ref={uploadRef}
            type="button"
            variant={json.trim() ? "outline" : "default"}
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            {readingFile ? (
              <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
            ) : (
              <UploadIcon aria-hidden="true" />
            )}
            {t(
              readingFile
                ? "documentImport.readingFile"
                : "documentImport.upload",
            )}
          </Button>
          <Button
            type="button"
            variant="text"
            disabled={disabled || readingFile}
            onClick={() => {
              setShowEditor(true);
              requestAnimationFrame(() => jsonRef.current?.focus());
            }}
          >
            {t("documentImport.editJson")}
          </Button>
        </div>
        {fileName ? (
          <p
            role="status"
            className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"
          >
            <FileJsonIcon aria-hidden="true" className="size-4 shrink-0" />
            <span className="break-all">
              {t("documentImport.fileReady", { fileName })}
            </span>
          </p>
        ) : null}
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
              disabled={disabled || readingFile}
              spellCheck={false}
              autoCapitalize="none"
              placeholder={'{"schemaVersion": 2, "documents": []}'}
              aria-invalid={Boolean(error)}
              aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
              onPaste={(event) => {
                const input = event.currentTarget;
                const count =
                  input.value.length -
                  (input.selectionEnd - input.selectionStart) +
                  event.clipboardData.getData("text/plain").length;
                // Native maxLength would silently truncate the pasted JSON.
                // Keep the previous draft and explain the actual size instead.
                if (count > MAX_IMPORT_CHARACTERS) {
                  event.preventDefault();
                  setError(
                    t("documentImport.tooLarge", {
                      count,
                      limit: MAX_IMPORT_CHARACTERS,
                    }),
                  );
                }
              }}
              onChange={(event) => {
                fileRequest.current += 1;
                setReadingFile(false);
                setJson(event.target.value);
                setFileName(null);
                setVinReviewed(false);
                setNeedsVinReview(false);
                setError(null);
              }}
            />
            <p id={`${id}-hint`} className="text-sm text-muted-foreground">
              {t("documentImport.mergeHint")}
            </p>
          </div>
        ) : null}
        {needsVinReview ? (
          <div className="grid gap-3">
            <p role="alert" className="text-sm">
              {t("documentImport.vinReview")}
            </p>
            <ScooterVinReference fallbackVin={importedVin} />
            <label className="flex items-center gap-3 text-sm">
              <Checkbox
                checked={vinReviewed}
                onCheckedChange={setVinReviewed}
              />
              {t("documentImport.confirmVinReview")}
            </label>
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
      {reviewCount > 0 ? (
        <div role="status" className="grid gap-2 text-sm text-warning">
          <p className="flex items-center gap-2">
            <TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
            {t("documentImport.reviewCount", { count: reviewCount })}
          </p>
          <ul className="list-disc space-y-1 pl-6">
            {reviewFields.map((field, index) => (
              <li key={`${index}:${field}`} className="break-words">
                {field}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
