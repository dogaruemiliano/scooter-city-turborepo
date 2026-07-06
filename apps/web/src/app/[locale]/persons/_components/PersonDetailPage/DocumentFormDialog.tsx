"use client";

import { v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactNode } from "react";

import { documentFormState, blankToNull } from "./helpers";
import { SelectField } from "./SelectField";
import { TextareaField } from "./TextareaField";
import { TextInputField } from "./TextInputField";
import type { DocumentFormState } from "./types";

type DocumentFormDialogProps = {
  title: string;
  triggerLabel?: string;
  triggerIcon?: ReactNode;
  document?: v1.persons.PersonDocument;
  busy: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  submitMode?: "create" | "update";
  onSubmit: (
    input:
      | v1.persons.CreatePersonDocumentInput
      | v1.persons.UpdatePersonDocumentInput,
  ) => Promise<boolean>;
};

export function DocumentFormDialog({
  title,
  triggerLabel,
  triggerIcon,
  document,
  busy,
  open,
  onOpenChange,
  submitMode = "create",
  onSubmit,
}: DocumentFormDialogProps) {
  const t = useTranslations("persons");
  const [internalOpen, setInternalOpen] = useState(false);
  const [form, setForm] = useState(() => documentFormState(document));
  const [error, setError] = useState<string | null>(null);
  const actualOpen = open ?? internalOpen;
  const setActualOpen = onOpenChange ?? setInternalOpen;

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    setActualOpen(nextOpen);
    if (nextOpen) {
      setForm(documentFormState(document));
      setError(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const candidate = {
      type: form.type,
      series: blankToNull(form.series),
      number: blankToNull(form.number),
      cnp: blankToNull(form.cnp),
      issuingCountryCode: blankToNull(form.issuingCountryCode),
      issuedBy: blankToNull(form.issuedBy),
      issuedOn: blankToNull(form.issuedOn),
      expiresOn: blankToNull(form.expiresOn),
      status: form.status,
      notes: blankToNull(form.notes),
    };
    if (submitMode === "create") {
      const input =
        v1.persons.createPersonDocumentInputSchema.safeParse(candidate);
      if (!input.success) {
        setError(input.error.issues[0]?.message ?? t("feedback.genericError"));
        return;
      }

      if (await onSubmit(input.data)) {
        setActualOpen(false);
      }
      return;
    }

    const input =
      v1.persons.updatePersonDocumentInputSchema.safeParse(candidate);
    if (!input.success) {
      setError(input.error.issues[0]?.message ?? t("feedback.genericError"));
      return;
    }

    if (await onSubmit(input.data)) {
      setActualOpen(false);
    }
  }

  function setValue<Key extends keyof DocumentFormState>(
    key: Key,
    value: DocumentFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <Dialog open={actualOpen} onOpenChange={changeOpen}>
      {triggerLabel ? (
        <DialogTrigger
          render={<Button type="button" variant="outline" size="sm" />}
        >
          {triggerIcon}
          {triggerLabel}
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => void submit(event)}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{t("feedback.updateErrorTitle")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t("fields.documentType")}
              value={form.type}
              values={v1.persons.PERSON_DOCUMENT_TYPES}
              labelForValue={(value) => t(`documentTypes.${value}`)}
              onChange={(value) =>
                setValue("type", value as v1.persons.PersonDocumentType)
              }
            />
            <SelectField
              label={t("fields.documentStatus")}
              value={form.status}
              values={v1.persons.PERSON_DOCUMENT_STATUSES}
              labelForValue={(value) => t(`documentStatuses.${value}`)}
              onChange={(value) =>
                setValue("status", value as v1.persons.PersonDocumentStatus)
              }
            />
            <TextInputField
              label={t("fields.documentSeries")}
              value={form.series}
              onChange={(value) => setValue("series", value)}
            />
            <TextInputField
              label={t("fields.documentNumber")}
              value={form.number}
              onChange={(value) => setValue("number", value)}
            />
            <TextInputField
              label={t("fields.documentCnp")}
              value={form.cnp}
              onChange={(value) => setValue("cnp", value)}
            />
            <TextInputField
              label={t("fields.documentIssuingCountryCode")}
              value={form.issuingCountryCode}
              onChange={(value) => setValue("issuingCountryCode", value)}
            />
            <TextInputField
              label={t("fields.documentIssuedBy")}
              value={form.issuedBy}
              onChange={(value) => setValue("issuedBy", value)}
            />
            <TextInputField
              label={t("fields.documentIssuedOn")}
              type="date"
              value={form.issuedOn}
              onChange={(value) => setValue("issuedOn", value)}
            />
            <TextInputField
              label={t("fields.documentExpiresOn")}
              type="date"
              value={form.expiresOn}
              onChange={(value) => setValue("expiresOn", value)}
            />
            <TextareaField
              label={t("fields.notes")}
              value={form.notes}
              className="sm:col-span-2"
              onChange={(value) => setValue("notes", value)}
            />
          </div>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={busy} />
              }
            >
              {t("actions.cancel")}
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy ? t("actions.saving") : t("actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
