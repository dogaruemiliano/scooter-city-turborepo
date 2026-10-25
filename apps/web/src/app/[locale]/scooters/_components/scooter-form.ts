import { v1 } from "@repo/api-shared";
import {
  buildDateOnly,
  dateOnlyToDateParts,
  emptyDateParts,
  type DateParts,
} from "@repo/ui/lib/date-parts";
import type { useTranslations } from "next-intl";

export const DEFAULT_COMBUSTION_ENGINE_CC = "";

export type ScooterFormField =
  | "vin"
  | "brandId"
  | "model"
  | "color"
  | "manufactureYear"
  | "powertrainType"
  | "engineCode"
  | "engineDisplacementCc"
  | "powerKw"
  | "currentMileageKm"
  | "registrationType"
  | "registrationNumber"
  | "registrationDate"
  | "temporaryRegistrationExpiresAt"
  | "requiredLicenseCategory"
  | "notes";

export type ScooterFormErrors = Partial<Record<ScooterFormField, string>>;

export interface ScooterFormState {
  vin: string;
  brandId: string;
  model: string;
  color: string;
  manufactureYear: string;
  powertrainType: v1.scooters.ScooterPowertrainType;
  engineCode: string;
  engineDisplacementCc: string;
  powerKw: string;
  currentMileageKm: string;
  registrationType: v1.scooters.ScooterRegistrationType;
  registrationNumber: string;
  registrationDate: DateParts;
  temporaryRegistrationExpiresAt: DateParts;
  requiredLicenseCategory: v1.scooters.ScooterRequiredDriverLicenseType;
  notes: string;
}

export interface ScooterFormIssue {
  code: string;
  path: readonly PropertyKey[];
  message: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
}

interface ScooterFormMessages {
  required: (field: ScooterFormField) => string;
  invalidDate: (field: ScooterFormField) => string;
  invalidNumber: (field: ScooterFormField) => string;
  invalidPlateNumber: () => string;
  engineCcRequired: () => string;
  engineCcElectric: () => string;
  invalidMileage: () => string;
}

export function createEmptyScooterForm(): ScooterFormState {
  return {
    vin: "",
    brandId: "",
    model: "",
    color: "",
    manufactureYear: "",
    powertrainType: "combustion",
    engineCode: "",
    engineDisplacementCc: DEFAULT_COMBUSTION_ENGINE_CC,
    powerKw: "",
    currentMileageKm: "",
    registrationType: "unregistered",
    registrationNumber: "",
    registrationDate: emptyDateParts(),
    temporaryRegistrationExpiresAt: emptyDateParts(),
    requiredLicenseCategory: "none",
    notes: "",
  };
}

export function scooterFormFromScooter(
  scooter: v1.scooters.Scooter,
): ScooterFormState {
  return {
    vin: scooter.vin,
    brandId: scooter.brandId,
    model: scooter.model ?? "",
    color: scooter.color ?? "",
    manufactureYear:
      scooter.manufactureYear == null ? "" : String(scooter.manufactureYear),
    powertrainType: scooter.powertrainType,
    engineCode: scooter.engineCode ?? "",
    engineDisplacementCc:
      scooter.engineDisplacementCc == null
        ? ""
        : String(scooter.engineDisplacementCc),
    powerKw: scooter.powerKw == null ? "" : String(scooter.powerKw),
    currentMileageKm:
      scooter.currentMileageKm == null ? "" : String(scooter.currentMileageKm),
    registrationType: scooter.registrationType,
    registrationNumber: scooter.registrationNumber ?? "",
    registrationDate: dateOnlyToDateParts(scooter.registrationDate),
    temporaryRegistrationExpiresAt: dateOnlyToDateParts(
      scooter.temporaryRegistrationExpiresAt,
    ),
    requiredLicenseCategory: scooter.requiredLicenseCategory ?? "none",
    notes: scooter.notes ?? "",
  };
}

export function buildScooterInputCandidate(
  form: ScooterFormState,
  messages: ScooterFormMessages,
): {
  input?: Record<string, unknown>;
  errors?: ScooterFormErrors;
} {
  const errors: ScooterFormErrors = {};
  const manufactureYear = optionalNumberField(
    form.manufactureYear,
    "manufactureYear",
    messages,
    errors,
  );
  const engineDisplacementCc =
    form.powertrainType !== "electric"
      ? optionalNumberField(
          form.engineDisplacementCc,
          "engineDisplacementCc",
          messages,
          errors,
        )
      : undefined;
  const powerKw = optionalNumberField(
    form.powerKw,
    "powerKw",
    messages,
    errors,
  );
  const currentMileageKm = optionalMileageField(
    form.currentMileageKm,
    messages,
    errors,
  );
  const registration = buildRegistrationInput(form, messages, errors);

  if (blank(form.brandId)) {
    errors.brandId = messages.required("brandId");
  }

  if (
    form.powertrainType === "electric" &&
    form.engineDisplacementCc.trim().length > 0
  ) {
    errors.engineDisplacementCc = messages.engineCcElectric();
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const input: Record<string, unknown> = {
    vin: form.vin,
    brandId: form.brandId,
    model: blank(form.model) ? null : form.model,
    color: blank(form.color) ? null : form.color,
    manufactureYear: manufactureYear ?? null,
    powertrainType: form.powertrainType,
    engineCode: blank(form.engineCode) ? null : form.engineCode,
    powerKw: powerKw ?? null,
    currentMileageKm: currentMileageKm ?? null,
    ...registration.input,
  };

  if (form.powertrainType === "electric") {
    input.engineDisplacementCc = null;
  } else {
    input.engineDisplacementCc = engineDisplacementCc ?? null;
  }

  if (!blank(form.notes)) {
    input.notes = form.notes;
  } else {
    input.notes = null;
  }

  return { input };
}

export function buildScooterRegistrationInputCandidate(
  form: ScooterFormState,
  messages: ScooterFormMessages,
): {
  input?: Pick<
    v1.scooters.UpdateScooterInput,
    | "registrationType"
    | "registrationNumber"
    | "registrationDate"
    | "temporaryRegistrationExpiresAt"
    | "requiredLicenseCategory"
  >;
  errors?: ScooterFormErrors;
} {
  const errors: ScooterFormErrors = {};
  const registration = buildRegistrationInput(form, messages, errors);

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    input: registration.input as Pick<
      v1.scooters.UpdateScooterInput,
      | "registrationType"
      | "registrationNumber"
      | "registrationDate"
      | "temporaryRegistrationExpiresAt"
      | "requiredLicenseCategory"
    >,
  };
}

export function fieldFromIssue(
  issue: ScooterFormIssue,
): ScooterFormField | null {
  const [field] = issue.path;
  return typeof field === "string" && isScooterFormField(field) ? field : null;
}

export function isScooterFormField(value: string): value is ScooterFormField {
  return (
    value === "vin" ||
    value === "brandId" ||
    value === "model" ||
    value === "color" ||
    value === "manufactureYear" ||
    value === "powertrainType" ||
    value === "engineCode" ||
    value === "engineDisplacementCc" ||
    value === "powerKw" ||
    value === "currentMileageKm" ||
    value === "registrationType" ||
    value === "registrationNumber" ||
    value === "registrationDate" ||
    value === "temporaryRegistrationExpiresAt" ||
    value === "requiredLicenseCategory" ||
    value === "notes"
  );
}

export function blank(value: string): boolean {
  return value.trim().length === 0;
}

function buildRegistrationInput(
  form: ScooterFormState,
  messages: ScooterFormMessages,
  errors: ScooterFormErrors,
): { input: Record<string, unknown> } {
  if (form.registrationType === "unregistered") {
    return {
      input: {
        registrationType: "unregistered",
        registrationNumber: null,
        registrationDate: null,
        temporaryRegistrationExpiresAt: null,
        requiredLicenseCategory: "none",
      },
    };
  }

  const registrationDate = buildDateOnly(form.registrationDate);
  const temporaryRegistrationExpiresAt =
    form.registrationType === "temporary"
      ? buildDateOnly(form.temporaryRegistrationExpiresAt)
      : { value: null, error: false };
  const normalizedPlate = v1.scooters.validatePlateForRegistrationType(
    form.registrationType,
    form.registrationNumber,
  );

  if (!normalizedPlate) {
    errors.registrationNumber = blank(form.registrationNumber)
      ? messages.required("registrationNumber")
      : messages.invalidPlateNumber();
  }

  if (registrationDate.error) {
    errors.registrationDate = messages.invalidDate("registrationDate");
  }

  if (temporaryRegistrationExpiresAt.error) {
    errors.temporaryRegistrationExpiresAt = messages.invalidDate(
      "temporaryRegistrationExpiresAt",
    );
  }

  if (
    form.registrationType === "temporary" &&
    !temporaryRegistrationExpiresAt.value &&
    !temporaryRegistrationExpiresAt.error
  ) {
    errors.temporaryRegistrationExpiresAt = messages.required(
      "temporaryRegistrationExpiresAt",
    );
  }

  if (
    registrationDate.value &&
    temporaryRegistrationExpiresAt.value &&
    temporaryRegistrationExpiresAt.value < registrationDate.value
  ) {
    errors.temporaryRegistrationExpiresAt = messages.invalidDate(
      "temporaryRegistrationExpiresAt",
    );
  }

  return {
    input: {
      registrationType: form.registrationType,
      registrationNumber: normalizedPlate?.displayValue,
      registrationDate: registrationDate.value ?? null,
      temporaryRegistrationExpiresAt:
        temporaryRegistrationExpiresAt.value ?? null,
      requiredLicenseCategory: form.requiredLicenseCategory,
    },
  };
}

function optionalNumberField(
  value: string,
  field: Extract<
    ScooterFormField,
    "powerKw" | "manufactureYear" | "engineDisplacementCc"
  >,
  messages: {
    invalidNumber: (field: ScooterFormField) => string;
  },
  errors: ScooterFormErrors,
): number | undefined {
  if (blank(value)) {
    return undefined;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    errors[field] = messages.invalidNumber(field);
    return undefined;
  }

  return numeric;
}

function optionalMileageField(
  value: string,
  messages: Pick<ScooterFormMessages, "invalidMileage">,
  errors: ScooterFormErrors,
): number | undefined {
  if (blank(value)) {
    return undefined;
  }

  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    errors.currentMileageKm = messages.invalidMileage();
    return undefined;
  }

  return numeric;
}

export type ScooterTranslations = ReturnType<typeof useTranslations>;

export function formatValidationIssue(
  issue: ScooterFormIssue,
  field: ScooterFormField | null,
  t: ScooterTranslations,
): string {
  if (field === "vin") {
    return t("feedback.validation.invalidVin");
  }

  if (field === "engineDisplacementCc") {
    if (issue.message.includes("required")) {
      return t("feedback.validation.engineCcRequired");
    }
    if (issue.message.includes("only allowed")) {
      return t("feedback.validation.engineCcElectric");
    }
  }

  if (field === "registrationNumber") {
    return t("feedback.validation.invalidPlateNumber");
  }

  if (field === "registrationDate" && issue.message.includes("today")) {
    return t("feedback.validation.registeredOnPastOrToday");
  }

  if (
    field === "temporaryRegistrationExpiresAt" &&
    issue.message.includes("after")
  ) {
    return t("feedback.validation.registrationExpiresOnAfterRegisteredOn");
  }

  const label = fieldLabel(field, t);
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

export function fieldLabel(
  field: ScooterFormField | null,
  t: ScooterTranslations,
): string {
  switch (field) {
    case "vin":
      return t("fields.vin");
    case "brandId":
      return t("fields.brand");
    case "model":
      return t("fields.model");
    case "color":
      return t("fields.color");
    case "manufactureYear":
      return t("fields.manufactureYear");
    case "powertrainType":
      return t("fields.powertrainType");
    case "engineCode":
      return t("fields.engineCode");
    case "engineDisplacementCc":
      return t("fields.engineDisplacementCc");
    case "powerKw":
      return t("fields.powerKw");
    case "currentMileageKm":
      return t("fields.currentMileageKm");
    case "registrationType":
      return t("fields.registrationType");
    case "registrationNumber":
      return t("fields.registrationNumber");
    case "registrationDate":
      return t("fields.registrationDate");
    case "temporaryRegistrationExpiresAt":
      return t("fields.temporaryRegistrationExpiresAt");
    case "requiredLicenseCategory":
      return t("fields.requiredLicenseCategory");
    case "notes":
      return t("fields.notes");
    default:
      return t("createPage.title");
  }
}
