"use client";

import { ApiError, v1 } from "@repo/api-shared";
import { Button, buttonVariants } from "@repo/ui/components";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";

import { webApi } from "@/lib/api";
import {
  FeedbackAlert,
  formErrorsFromIssues,
  type Feedback,
} from "./ScooterCreateForm";
import { ScooterFormFields } from "./ScooterFormFields";
import {
  buildScooterInputCandidate,
  fieldFromIssue,
  fieldLabel,
  formatValidationIssue,
  scooterFormFromScooter,
  type ScooterFormErrors,
  type ScooterFormField,
  type ScooterFormState,
} from "./scooter-form";

interface ScooterEditFormProps {
  scooter: v1.scooters.Scooter;
  scooterHref: string;
  brands: v1.scooterBrands.ScooterBrand[];
}

export function ScooterEditForm({
  scooter,
  scooterHref,
  brands,
}: ScooterEditFormProps) {
  const t = useTranslations("scooters");
  const router = useRouter();
  const formId = useId();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ScooterFormState>(() =>
    scooterFormFromScooter(scooter),
  );
  const [fieldErrors, setFieldErrors] = useState<ScooterFormErrors>({});
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function updateScooter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setFieldErrors({});

    const candidate = buildScooterInputCandidate(form, {
      required: (field) =>
        t("feedback.validation.required", { field: fieldLabel(field, t) }),
      invalidDate: (field) =>
        t("feedback.validation.invalid", { field: fieldLabel(field, t) }),
      invalidNumber: (field) =>
        t("feedback.validation.invalidNumber", { field: fieldLabel(field, t) }),
      invalidPlateNumber: () => t("feedback.validation.invalidPlateNumber"),
      engineCcRequired: () => t("feedback.validation.engineCcRequired"),
      engineCcElectric: () => t("feedback.validation.engineCcElectric"),
      invalidMileage: () => t("feedback.validation.invalidMileage"),
    });

    if (candidate.errors) {
      setFieldErrors(candidate.errors);
      setFeedback({
        kind: "error",
        title: t("feedback.updateErrorTitle"),
        messages: Object.values(candidate.errors),
      });
      return;
    }

    const input = v1.scooters.updateScooterInputSchema.safeParse(
      candidate.input,
    );

    if (!input.success) {
      setFieldErrors(
        formErrorsFromIssues(input.error.issues, (issue, field) =>
          formatValidationIssue(issue, field, t),
        ),
      );
      setFeedback({
        kind: "error",
        title: t("feedback.updateErrorTitle"),
        messages: input.error.issues.map((issue) =>
          formatValidationIssue(issue, fieldFromIssue(issue), t),
        ),
      });
      return;
    }

    // Registration is edited from its own sheet on the detail page.
    const generalInput = { ...input.data };
    delete generalInput.registrationType;
    delete generalInput.plateNumber;
    delete generalInput.registeredOn;
    delete generalInput.registrationExpiresOn;
    delete generalInput.requiredDriverLicenseType;

    setSaving(true);
    try {
      await webApi.fetch(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        { method: "PATCH", json: generalInput },
      );

      router.push(scooterHref);
      router.refresh();
    } catch (error) {
      setFeedback({
        kind: "error",
        title: t("feedback.updateErrorTitle"),
        messages: [
          error instanceof ApiError
            ? error.message
            : t("feedback.genericError"),
        ],
      });
      setSaving(false);
    }
  }

  function setFormValue<Key extends keyof ScooterFormState>(
    key: Key,
    value: ScooterFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    clearFieldError(key);
    if (key === "powertrainType") {
      clearFieldError("engineCc");
    }
  }

  function clearFieldError(field: ScooterFormField) {
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-lg flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <form
        className="grid gap-6"
        noValidate
        onSubmit={(event) => void updateScooter(event)}
      >
        <ScooterFormFields
          formId={formId}
          form={form}
          errors={fieldErrors}
          brands={brands}
          disabled={saving}
          includeRegistration={false}
          onSetValue={setFormValue}
        />

        {feedback ? <FeedbackAlert feedback={feedback} /> : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link
            href={scooterHref}
            className={buttonVariants({
              variant: "outline",
              className: saving ? "pointer-events-none opacity-60" : "",
            })}
            aria-disabled={saving}
          >
            {t("actions.cancel")}
          </Link>
          <Button type="submit" disabled={saving}>
            {saving ? t("actions.saving") : t("actions.save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
