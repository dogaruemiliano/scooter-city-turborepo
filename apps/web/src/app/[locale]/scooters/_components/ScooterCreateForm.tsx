"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  buttonVariants,
} from "@repo/ui/components";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";

import { webApi } from "@/lib/api";
import { ScooterFormFields } from "./ScooterFormFields";
import {
  DEFAULT_COMBUSTION_ENGINE_CC,
  blank,
  buildScooterInputCandidate,
  createEmptyScooterForm,
  fieldFromIssue,
  type ScooterFormErrors,
  type ScooterFormField,
  type ScooterFormIssue,
  type ScooterFormState,
} from "./scooter-form";

interface ScooterCreateFormProps {
  scootersHref: string;
}

export interface Feedback {
  kind: "success" | "error";
  title: string;
  messages: string[];
}

export function ScooterCreateForm({ scootersHref }: ScooterCreateFormProps) {
  const t = useTranslations("scooters");
  const router = useRouter();
  const formId = useId();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ScooterFormState>(() =>
    createEmptyScooterForm(),
  );
  const [fieldErrors, setFieldErrors] = useState<ScooterFormErrors>({});
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function createScooter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setFieldErrors({});

    const candidate = buildScooterInputCandidate(form, {
      required: (field) =>
        t("feedback.validation.required", { field: fieldLabel(field) }),
      invalidDate: (field) =>
        t("feedback.validation.invalid", { field: fieldLabel(field) }),
      invalidNumber: (field) =>
        t("feedback.validation.invalidNumber", { field: fieldLabel(field) }),
      invalidPlateNumber: () => t("feedback.validation.invalidPlateNumber"),
      engineCcRequired: () => t("feedback.validation.engineCcRequired"),
      engineCcElectric: () => t("feedback.validation.engineCcElectric"),
    });

    if (candidate.errors) {
      setFieldErrors(candidate.errors);
      setFeedback({
        kind: "error",
        title: t("feedback.createErrorTitle"),
        messages: Object.values(candidate.errors),
      });
      return;
    }

    const input = v1.scooters.createScooterInputSchema.safeParse(
      candidate.input,
    );

    if (!input.success) {
      const nextFieldErrors = formErrorsFromIssues(
        input.error.issues,
        formatValidationIssue,
      );
      setFieldErrors(nextFieldErrors);
      setFeedback({
        kind: "error",
        title: t("feedback.createErrorTitle"),
        messages:
          input.error.issues.length > 0
            ? input.error.issues.map((issue) =>
                formatValidationIssue(issue, fieldFromIssue(issue)),
              )
            : [t("feedback.createValidationFallback")],
      });
      return;
    }

    setCreating(true);
    try {
      await webApi.fetch(v1.scooters.ROUTES.create, v1.scooters.scooterSchema, {
        method: "POST",
        json: input.data,
      });

      setFeedback({
        kind: "success",
        title: t("feedback.createSuccessTitle"),
        messages: [t("feedback.createSuccessMessage")],
      });
      setForm(createEmptyScooterForm());
      router.push(scootersHref);
      router.refresh();
    } catch (error) {
      const conflict = scooterFieldConflict(error);
      if (conflict) {
        setFieldErrors({ [conflict.field]: conflict.message });
      }

      setFeedback({
        kind: "error",
        title: t("feedback.createErrorTitle"),
        messages: [
          conflict
            ? conflict.message
            : error instanceof ApiError
              ? error.message
              : t("feedback.genericError"),
        ],
      });
    } finally {
      setCreating(false);
    }
  }

  function setFormValue<Key extends keyof ScooterFormState>(
    key: Key,
    value: ScooterFormState[Key],
  ) {
    setForm((current) => {
      const next = { ...current, [key]: value };

      if (
        key === "powertrainType" &&
        value === "combustion" &&
        blank(current.engineCc)
      ) {
        next.engineCc = DEFAULT_COMBUSTION_ENGINE_CC;
      }

      return next;
    });
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

  function formatValidationIssue(
    issue: ScooterFormIssue,
    field: ScooterFormField | null,
  ): string {
    if (field === "vin") {
      return t("feedback.validation.invalidVin");
    }

    if (field === "engineCc") {
      if (issue.message.includes("required")) {
        return t("feedback.validation.engineCcRequired");
      }
      if (issue.message.includes("only allowed")) {
        return t("feedback.validation.engineCcElectric");
      }
    }

    if (field === "plateNumber") {
      return t("feedback.validation.invalidPlateNumber");
    }

    if (field === "purchasedOn" && issue.message.includes("today")) {
      return t("feedback.validation.purchasedOnPastOrToday");
    }

    if (field === "registeredOn" && issue.message.includes("today")) {
      return t("feedback.validation.registeredOnPastOrToday");
    }

    if (field === "registrationExpiresOn" && issue.message.includes("after")) {
      return t("feedback.validation.registrationExpiresOnAfterRegisteredOn");
    }

    const label = fieldLabel(field);
    if (issue.code === "too_small" && issue.minimum === 1) {
      return t("feedback.validation.required", { field: label });
    }

    if (
      issue.code === "too_big" &&
      (typeof issue.maximum === "number" || typeof issue.maximum === "bigint")
    ) {
      return t("feedback.validation.maxLength", {
        field: label,
        max: Number(issue.maximum),
      });
    }

    return issue.code === "invalid_format" || issue.code === "custom"
      ? t("feedback.validation.invalid", { field: label })
      : t("feedback.validation.fallback");
  }

  function fieldLabel(field: ScooterFormField | null): string {
    switch (field) {
      case "vin":
        return t("fields.vin");
      case "brand":
        return t("fields.brand");
      case "model":
        return t("fields.model");
      case "color":
        return t("fields.color");
      case "manufactureYear":
        return t("fields.manufactureYear");
      case "powertrainType":
        return t("fields.powertrainType");
      case "engineCc":
        return t("fields.engineCc");
      case "powerKw":
        return t("fields.powerKw");
      case "purchasedOn":
        return t("fields.purchasedOn");
      case "registrationType":
        return t("fields.registrationType");
      case "plateNumber":
        return t("fields.plateNumber");
      case "registeredOn":
        return t("fields.registeredOn");
      case "registrationExpiresOn":
        return t("fields.registrationExpiresOn");
      case "requiredDriverLicenseType":
        return t("fields.requiredDriverLicenseType");
      case "notes":
        return t("fields.notes");
      default:
        return t("createPage.title");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-lg flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-col gap-4">
        <Link
          href={scootersHref}
          className={buttonVariants({
            variant: "ghost",
            className: "w-fit text-muted-foreground",
          })}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {t("actions.backToList")}
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">{t("createPage.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("createPage.description")}
          </p>
        </div>
      </div>

      <form
        className="grid gap-6"
        noValidate
        onSubmit={(event) => void createScooter(event)}
      >
        <ScooterFormFields
          formId={formId}
          form={form}
          errors={fieldErrors}
          disabled={creating}
          onSetValue={setFormValue}
        />

        {feedback ? <FeedbackAlert feedback={feedback} /> : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link
            href={scootersHref}
            className={buttonVariants({
              variant: "outline",
              className: creating ? "pointer-events-none opacity-60" : "",
            })}
            aria-disabled={creating}
          >
            {t("actions.cancel")}
          </Link>
          <Button type="submit" disabled={creating}>
            {creating ? t("actions.creating") : t("actions.create")}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function FeedbackAlert({ feedback }: { feedback: Feedback }) {
  return (
    <Alert variant={feedback.kind === "error" ? "destructive" : "default"}>
      <AlertTitle>{feedback.title}</AlertTitle>
      <AlertDescription>
        {feedback.messages.length === 1 ? (
          feedback.messages[0]
        ) : (
          <ul className="list-disc pl-4">
            {feedback.messages.map((message, index) => (
              <li key={`${message}-${index}`}>{message}</li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function formErrorsFromIssues(
  issues: readonly ScooterFormIssue[],
  formatIssue: (
    issue: ScooterFormIssue,
    field: ScooterFormField | null,
  ) => string,
): ScooterFormErrors {
  const errors: ScooterFormErrors = {};

  for (const issue of issues) {
    const field = fieldFromIssue(issue);
    if (field && !errors[field]) {
      errors[field] = formatIssue(issue, field);
    }
  }

  return errors;
}

export function scooterFieldConflict(error: unknown): {
  field: Extract<ScooterFormField, "vin" | "plateNumber">;
  message: string;
} | null {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return null;
  }

  const details = error.details;
  const field =
    details &&
    typeof details === "object" &&
    !Array.isArray(details) &&
    "field" in details
      ? details.field
      : null;

  return field === "vin" || field === "plateNumber"
    ? { field, message: error.message }
    : null;
}
