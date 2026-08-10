"use client";

import { Button } from "@repo/ui/components";
import {
  CameraIcon,
  CheckCircle2Icon,
  FileTextIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type ChangeEvent } from "react";

import {
  prepareExpenseEvidence,
  type SelectedExpenseEvidence,
} from "../_lib/expense-api";

interface ExpenseEvidencePickerProps {
  disabled: boolean;
  error?: string;
  label: string;
  onChange(value: SelectedExpenseEvidence | null): void;
  onProcessingChange?(processing: boolean): void;
  required?: boolean;
  value: SelectedExpenseEvidence | null;
}

export function ExpenseEvidencePicker({
  disabled,
  error,
  label,
  onChange,
  onProcessingChange,
  required = false,
  value,
}: ExpenseEvidencePickerProps) {
  const t = useTranslations("finance.expenses.form.evidence");
  const id = useId();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    if (disabled) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setProcessing(true);
    onProcessingChange?.(true);
    setFileError(null);
    onChange(null);
    try {
      onChange(await prepareExpenseEvidence(file));
    } catch (selectionError) {
      setFileError(
        selectionError instanceof Error &&
          selectionError.message === "FILE_TOO_LARGE"
          ? t("tooLarge")
          : selectionError instanceof Error &&
              selectionError.message === "UNSUPPORTED_TYPE"
            ? t("unsupported")
            : t("prepareFailed"),
      );
    } finally {
      setProcessing(false);
      onProcessingChange?.(false);
    }
  }

  const describedBy = fileError || error ? `${id}-error` : `${id}-formats`;

  return (
    <fieldset
      disabled={disabled}
      className="flex flex-col gap-2"
      aria-describedby={describedBy}
      aria-invalid={Boolean(fileError || error)}
      aria-required={required}
    >
      <legend className="text-sm font-semibold">
        {label}{" "}
        <span className="font-normal text-muted-foreground">
          {required ? (
            <>
              <span aria-hidden="true" className="text-foreground">
                *
              </span>
              <span className="sr-only">{t("required")}</span>
            </>
          ) : (
            t("optional")
          )}
        </span>
      </legend>
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted p-4">
        {value ? (
          <div className="flex min-w-0 items-center gap-2 rounded-lg bg-background p-3">
            <CheckCircle2Icon
              aria-hidden="true"
              className="size-4 shrink-0 text-primary"
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {value.fileName}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("remove")}
              disabled={disabled || processing}
              onClick={() => {
                setFileError(null);
                onChange(null);
              }}
            >
              <XIcon />
            </Button>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <input
            ref={cameraInputRef}
            id={`${id}-camera`}
            type="file"
            accept="image/jpeg,image/png"
            capture="environment"
            className="sr-only"
            required={required && !value}
            aria-required={required}
            disabled={disabled || processing}
            onChange={(event) => void selectFile(event)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || processing}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            onClick={() => cameraInputRef.current?.click()}
          >
            <CameraIcon data-icon="inline-start" />
            {t("takePhoto")}
          </Button>
          <input
            ref={fileInputRef}
            id={`${id}-file`}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            className="sr-only"
            aria-required={required}
            disabled={disabled || processing}
            onChange={(event) => void selectFile(event)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || processing}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileTextIcon data-icon="inline-start" />
            {value ? t("replaceFile") : t("chooseFile")}
          </Button>
        </div>

        {processing ? (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
            {t("preparing")}
          </p>
        ) : null}

        <p
          id={`${id}-formats`}
          className="text-center text-xs text-muted-foreground"
        >
          {t("formats")}
        </p>
      </div>
      {fileError || error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {fileError ?? error}
        </p>
      ) : null}
    </fieldset>
  );
}
