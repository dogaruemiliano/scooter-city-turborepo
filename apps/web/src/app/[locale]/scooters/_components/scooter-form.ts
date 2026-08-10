import { v1 } from "@repo/api-shared";
import {
  buildDateOnly,
  dateOnlyToDateParts,
  emptyDateParts,
  type DateParts,
} from "@repo/ui/lib/date-parts";
import type { useTranslations } from "next-intl";

export const DEFAULT_COMBUSTION_ENGINE_CC = "50";

export type ScooterFormField =
  | "vin"
  | "brandId"
  | "model"
  | "color"
  | "manufactureYear"
  | "powertrainType"
  | "engineType"
  | "engineCc"
  | "powerKw"
  | "currentMileageKm"
  | "registrationType"
  | "plateNumber"
  | "registeredOn"
  | "registrationExpiresOn"
  | "requiredDriverLicenseType"
  | "notes";

export type ScooterFormErrors = Partial<Record<ScooterFormField, string>>;

export interface ScooterFormState {
  vin: string;
  brandId: string;
  model: string;
  color: string;
  manufactureYear: string;
  powertrainType: v1.scooters.ScooterPowertrainType;
  engineType: string;
  engineCc: string;
  powerKw: string;
  currentMileageKm: string;
  registrationType: v1.scooters.ScooterRegistrationType;
  plateNumber: string;
  registeredOn: DateParts;
  registrationExpiresOn: DateParts;
  requiredDriverLicenseType: v1.scooters.ScooterRequiredDriverLicenseType;
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
    engineType: "",
    engineCc: DEFAULT_COMBUSTION_ENGINE_CC,
    powerKw: "",
    currentMileageKm: "",
    registrationType: "unregistered",
    plateNumber: "",
    registeredOn: emptyDateParts(),
    registrationExpiresOn: emptyDateParts(),
    requiredDriverLicenseType: "none",
    notes: "",
  };
}

export function scooterFormFromScooter(
  scooter: v1.scooters.Scooter,
): ScooterFormState {
  return {
    vin: scooter.vin,
    brandId: scooter.brandId,
    model: scooter.model,
    color: scooter.color ?? "",
    manufactureYear: String(scooter.manufactureYear),
    powertrainType: scooter.powertrainType,
    engineType: scooter.engineType ?? "",
    engineCc: scooter.engineCc == null ? "" : String(scooter.engineCc),
    powerKw: scooter.powerKw == null ? "" : String(scooter.powerKw),
    currentMileageKm:
      scooter.currentMileageKm == null ? "" : String(scooter.currentMileageKm),
    registrationType: scooter.registrationType,
    plateNumber: scooter.plateNumber ?? "",
    registeredOn: dateOnlyToDateParts(scooter.registeredOn),
    registrationExpiresOn: dateOnlyToDateParts(scooter.registrationExpiresOn),
    requiredDriverLicenseType: scooter.requiredDriverLicenseType,
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
  const manufactureYear = numberField(
    form.manufactureYear,
    "manufactureYear",
    messages,
    errors,
  );
  const engineCc =
    form.powertrainType === "combustion"
      ? numberField(
          form.engineCc,
          "engineCc",
          {
            ...messages,
            required: () => messages.engineCcRequired(),
          },
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

  if (blank(form.color)) {
    errors.color = messages.required("color");
  }

  if (form.powertrainType === "electric" && form.engineCc.trim().length > 0) {
    errors.engineCc = messages.engineCcElectric();
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const input: Record<string, unknown> = {
    vin: form.vin,
    brandId: form.brandId,
    model: form.model,
    color: form.color,
    manufactureYear,
    powertrainType: form.powertrainType,
    engineType: blank(form.engineType) ? null : form.engineType,
    powerKw: powerKw ?? null,
    currentMileageKm: currentMileageKm ?? null,
    ...registration.input,
  };

  if (form.powertrainType === "electric") {
    input.engineCc = null;
  } else {
    input.engineCc = engineCc;
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
    | "plateNumber"
    | "registeredOn"
    | "registrationExpiresOn"
    | "requiredDriverLicenseType"
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
      | "plateNumber"
      | "registeredOn"
      | "registrationExpiresOn"
      | "requiredDriverLicenseType"
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
    value === "engineType" ||
    value === "engineCc" ||
    value === "powerKw" ||
    value === "currentMileageKm" ||
    value === "registrationType" ||
    value === "plateNumber" ||
    value === "registeredOn" ||
    value === "registrationExpiresOn" ||
    value === "requiredDriverLicenseType" ||
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
        plateNumber: null,
        registeredOn: null,
        registrationExpiresOn: null,
        requiredDriverLicenseType: "none",
      },
    };
  }

  const registeredOn = buildDateOnly(form.registeredOn);
  const registrationExpiresOn =
    form.registrationType === "temporary"
      ? buildDateOnly(form.registrationExpiresOn)
      : { value: null, error: false };
  const normalizedPlate = v1.scooters.validatePlateForRegistrationType(
    form.registrationType,
    form.plateNumber,
  );

  if (!normalizedPlate) {
    errors.plateNumber = blank(form.plateNumber)
      ? messages.required("plateNumber")
      : messages.invalidPlateNumber();
  }

  if (registeredOn.error) {
    errors.registeredOn = messages.invalidDate("registeredOn");
  } else if (!registeredOn.value) {
    errors.registeredOn = messages.required("registeredOn");
  }

  if (registrationExpiresOn.error) {
    errors.registrationExpiresOn = messages.invalidDate(
      "registrationExpiresOn",
    );
  }

  if (
    form.registrationType === "temporary" &&
    !registrationExpiresOn.value &&
    !registrationExpiresOn.error
  ) {
    errors.registrationExpiresOn = messages.required("registrationExpiresOn");
  }

  if (
    registeredOn.value &&
    registrationExpiresOn.value &&
    registrationExpiresOn.value < registeredOn.value
  ) {
    errors.registrationExpiresOn = messages.invalidDate(
      "registrationExpiresOn",
    );
  }

  return {
    input: {
      registrationType: form.registrationType,
      plateNumber: normalizedPlate?.displayValue,
      registeredOn: registeredOn.value,
      registrationExpiresOn: registrationExpiresOn.value ?? null,
      requiredDriverLicenseType: form.requiredDriverLicenseType,
    },
  };
}

function numberField(
  value: string,
  field: Extract<ScooterFormField, "manufactureYear" | "engineCc">,
  messages: {
    required: (field: ScooterFormField) => string;
    invalidNumber: (field: ScooterFormField) => string;
  },
  errors: ScooterFormErrors,
): number | undefined {
  if (blank(value)) {
    errors[field] = messages.required(field);
    return undefined;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    errors[field] = messages.invalidNumber(field);
    return undefined;
  }

  return numeric;
}

function optionalNumberField(
  value: string,
  field: Extract<ScooterFormField, "powerKw">,
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

  if (field === "registeredOn" && issue.message.includes("today")) {
    return t("feedback.validation.registeredOnPastOrToday");
  }

  if (field === "registrationExpiresOn" && issue.message.includes("after")) {
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
    case "engineType":
      return t("fields.engineType");
    case "engineCc":
      return t("fields.engineCc");
    case "powerKw":
      return t("fields.powerKw");
    case "currentMileageKm":
      return t("fields.currentMileageKm");
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
