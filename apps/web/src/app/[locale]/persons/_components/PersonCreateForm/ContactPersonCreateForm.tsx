"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { v1 } from "@repo/api-shared";
import { Button } from "@repo/ui/components";
import { Feedback, useTask, WorkspacePage } from "@/components/WorkspaceForm";
import { webApi } from "@/lib/api";
import { PersonalSection } from "./PersonalSection";
import { ContactSection } from "./ContactSection";
import { AddressSection } from "./AddressSection";
import { NotesField } from "./NotesField";
import { createEmptyCreateForm } from "./form-state";
import { createPersonInput } from "./input";
import type {
  FormErrors,
  PersonCreateFormProps,
  SetPersonFormValue,
} from "./types";

/** Contact-only registration does not require or submit identity documents. */
export function ContactPersonCreateForm({
  personsHref,
}: PersonCreateFormProps) {
  const t = useTranslations("persons");
  const locale = useLocale();
  const router = useRouter();
  const formId = useId();
  const task = useTask();
  const [form, setForm] = useState(() => ({
    ...createEmptyCreateForm("foreign"),
    documents: [],
  }));
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const setValue: SetPersonFormValue = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <WorkspacePage
      title={t("createPage.title")}
      description={t("createPage.description")}
    >
      <form
        className="grid gap-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void task.run(async () => {
            const candidate = createPersonInput(form, (field, error) =>
              t(`feedback.date.${error}`, { field: t(`fields.${field}`) }),
            );
            if (!candidate.input) {
              setFieldErrors(
                candidate.error
                  ? { [candidate.error.field]: candidate.error.message }
                  : {},
              );
              throw new Error(t("feedback.createValidationFallback"));
            }
            delete candidate.input.documentWorkflow;
            delete candidate.input.documents;
            const parsed = v1.persons.createPersonInputSchema.safeParse(
              candidate.input,
            );
            if (!parsed.success) {
              setFieldErrors(
                Object.fromEntries(
                  parsed.error.issues.map((issue) => {
                    const field = String(issue.path[0]);
                    const special =
                      field === "email"
                        ? "invalidEmail"
                        : field === "phone"
                          ? "invalidPhone"
                          : field === "cnp"
                            ? "invalidCnp"
                            : null;
                    return [
                      field,
                      special
                        ? t(`feedback.validation.${special}`)
                        : t("feedback.validation.invalid", {
                            field: t(`fields.${field}`),
                          }),
                    ];
                  }),
                ),
              );
              throw new Error(t("feedback.createValidationFallback"));
            }
            setFieldErrors({});
            const person = await webApi.fetch(
              v1.persons.ROUTES.create,
              v1.persons.personSchema,
              { method: "POST", json: parsed.data },
            );
            router.push(`${personsHref}/${encodeURIComponent(person.id)}`);
            router.refresh();
          });
        }}
      >
        <PersonalSection
          formId={formId}
          form={form}
          fieldErrors={fieldErrors}
          locale={locale}
          showUnder18Warning={false}
          onSetFormValue={setValue}
        />
        <ContactSection
          formId={formId}
          form={form}
          fieldErrors={fieldErrors}
          locale={locale}
          onSetFormValue={setValue}
          onChangePhone={(phone, details) =>
            setForm((current) => ({
              ...current,
              phone,
              phoneCountry: details.country,
              phoneCountryCallingCode: details.countryCallingCode,
              phoneNationalNumber: details.nationalNumber,
            }))
          }
        />
        <AddressSection
          formId={formId}
          form={form}
          fieldErrors={fieldErrors}
          locale={locale}
          onSetFormValue={setValue}
          onChangeCountry={(countryCode) =>
            setForm((current) => ({
              ...current,
              countryCode,
              region: "",
              city: "",
            }))
          }
        />
        <NotesField
          formId={formId}
          value={form.notes}
          error={fieldErrors.notes}
          onChange={(value) => setValue("notes", value)}
        />
        <Feedback error={task.error} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={task.busy}>
            {t(task.busy ? "actions.creating" : "actions.create")}
          </Button>
          <Link
            href={personsHref}
            className="text-sm underline underline-offset-4"
          >
            {t("actions.cancel")}
          </Link>
        </div>
      </form>
    </WorkspacePage>
  );
}
