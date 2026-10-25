"use client";
import { useFormAction } from "@/lib/form/use-form-action";
import { SaveButton } from "@repo/ui/components/save-button";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { v1 } from "@repo/api-shared";
import { FormActions } from "@repo/ui/components";
import { Feedback, useTask, WorkspacePage } from "@/components/WorkspaceForm";
import { buttonVariants } from "@repo/ui/components/button";
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
import { useOptionalSession } from "@/components/auth/SessionProvider";
import {
  personCreateCancelHref,
  personCreateDestination,
} from "../../_lib/person-create-destination";

/** Contact-only registration does not require or submit identity documents. */
export function ContactPersonCreateForm({
  personsHref,
  rentalDraftId,
}: PersonCreateFormProps) {
  const session = useOptionalSession();
  const formAction = useFormAction();

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
  const candidate = createPersonInput(form, () => "");
  const ready =
    !candidate.error &&
    v1.persons.createPersonInputSchema.safeParse(candidate.input).success;
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
            router.push(
              personCreateDestination(
                personsHref,
                person.id,
                rentalDraftId,
                session?.user?.id,
              ),
            );
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
        <FormActions ready={ready} pending={task.busy}>
          <Link
            href={personCreateCancelHref(personsHref, rentalDraftId)}
            className={buttonVariants({ variant: "outline" })}
            aria-disabled={task.busy || undefined}
            tabIndex={task.busy ? -1 : undefined}
            onClick={(event) => {
              if (task.busy) event.preventDefault();
            }}
          >
            {t("actions.cancel")}
          </Link>
          <SaveButton
            type="submit"
            disabled={task.busy}
            {...formAction(
              "create",
              { pending: task.busy, error: task.error },
              t("actions.create"),
            )}
          />
        </FormActions>
      </form>
    </WorkspacePage>
  );
}
