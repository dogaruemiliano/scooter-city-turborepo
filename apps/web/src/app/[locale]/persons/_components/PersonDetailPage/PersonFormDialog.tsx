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
import { PencilIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { blankToNull, personFormState } from "./helpers";
import { TextareaField } from "./TextareaField";
import { TextInputField } from "./TextInputField";
import type { PersonFormState } from "./types";

export function PersonFormDialog({
  person,
  busy,
  open,
  onOpenChange,
  renderTrigger = true,
  onSubmit,
}: {
  person: v1.persons.Person;
  busy: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  renderTrigger?: boolean;
  onSubmit: (input: v1.persons.UpdatePersonInput) => Promise<boolean>;
}) {
  const t = useTranslations("persons");
  const [internalOpen, setInternalOpen] = useState(false);
  const [form, setForm] = useState(() => personFormState(person));
  const [error, setError] = useState<string | null>(null);
  const actualOpen = open ?? internalOpen;
  const setActualOpen = onOpenChange ?? setInternalOpen;

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    setActualOpen(nextOpen);
    if (nextOpen) {
      setForm(personFormState(person));
      setError(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const input = v1.persons.updatePersonInputSchema.safeParse({
      email: form.email,
      phone: form.phone,
      firstName: form.firstName,
      lastName: form.lastName,
      dateOfBirth: blankToNull(form.dateOfBirth),
      addressLine1: blankToNull(form.addressLine1),
      addressLine2: blankToNull(form.addressLine2),
      city: blankToNull(form.city),
      region: blankToNull(form.region),
      postalCode: blankToNull(form.postalCode),
      countryCode: blankToNull(form.countryCode),
      notes: blankToNull(form.notes),
    });

    if (!input.success) {
      setError(input.error.issues[0]?.message ?? t("feedback.genericError"));
      return;
    }

    if (await onSubmit(input.data)) {
      setActualOpen(false);
    }
  }

  function setValue<Key extends keyof PersonFormState>(
    key: Key,
    value: PersonFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <Dialog open={actualOpen} onOpenChange={changeOpen}>
      {renderTrigger ? (
        <DialogTrigger
          render={<Button type="button" variant="outline" size="sm" />}
        >
          <PencilIcon data-icon="inline-start" />
          {t("actions.editPerson")}
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => void submit(event)}
        >
          <DialogHeader>
            <DialogTitle>{t("detail.dialogs.editPersonTitle")}</DialogTitle>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{t("feedback.updateErrorTitle")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField
              label={t("fields.firstName")}
              value={form.firstName}
              onChange={(value) => setValue("firstName", value)}
            />
            <TextInputField
              label={t("fields.lastName")}
              value={form.lastName}
              onChange={(value) => setValue("lastName", value)}
            />
            <TextInputField
              label={t("fields.email")}
              type="email"
              value={form.email}
              onChange={(value) => setValue("email", value)}
            />
            <TextInputField
              label={t("fields.phone")}
              value={form.phone}
              onChange={(value) => setValue("phone", value)}
            />
            <TextInputField
              label={t("fields.dateOfBirth")}
              type="date"
              value={form.dateOfBirth}
              onChange={(value) => setValue("dateOfBirth", value)}
            />
            <TextInputField
              label={t("fields.countryCode")}
              value={form.countryCode}
              onChange={(value) => setValue("countryCode", value)}
            />
            <TextInputField
              label={t("fields.region")}
              value={form.region}
              onChange={(value) => setValue("region", value)}
            />
            <TextInputField
              label={t("fields.city")}
              value={form.city}
              onChange={(value) => setValue("city", value)}
            />
            <TextInputField
              label={t("fields.postalCode")}
              value={form.postalCode}
              onChange={(value) => setValue("postalCode", value)}
            />
            <TextInputField
              label={t("fields.addressLine1")}
              value={form.addressLine1}
              className="sm:col-span-2"
              onChange={(value) => setValue("addressLine1", value)}
            />
            <TextInputField
              label={t("fields.addressLine2")}
              value={form.addressLine2}
              className="sm:col-span-2"
              onChange={(value) => setValue("addressLine2", value)}
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
