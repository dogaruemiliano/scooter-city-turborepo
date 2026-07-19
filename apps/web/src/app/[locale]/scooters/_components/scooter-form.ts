import { v1 } from "@repo/api-shared";
import {
  buildDateOnly,
  dateOnlyToDateParts,
  emptyDateParts,
  type DateParts,
} from "@repo/ui/lib/date-parts";

export const DEFAULT_COMBUSTION_ENGINE_CC = "50";

export type ScooterFormField =
  | "vin"
  | "brand"
  | "model"
  | "color"
  | "manufactureYear"
  | "powertrainType"
  | "engineCc"
  | "powerKw"
  | "purchasedOn"
  | "registrationType"
  | "plateNumber"
  | "registeredOn"
  | "registrationExpiresOn"
  | "requiredDriverLicenseType"
  | "notes";

export type ScooterFormErrors = Partial<Record<ScooterFormField, string>>;

export interface ScooterFormState {
  vin: string;
  brand: string;
  model: string;
  color: string;
  manufactureYear: string;
  powertrainType: v1.scooters.ScooterPowertrainType;
  engineCc: string;
  powerKw: string;
  purchasedOn: DateParts;
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
}

export function createEmptyScooterForm(): ScooterFormState {
  return {
    vin: "",
    brand: "",
    model: "",
    color: "",
    manufactureYear: "",
    powertrainType: "combustion",
    engineCc: DEFAULT_COMBUSTION_ENGINE_CC,
    powerKw: "",
    purchasedOn: emptyDateParts(),
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
    brand: scooter.brand,
    model: scooter.model,
    color: scooter.color ?? "",
    manufactureYear: String(scooter.manufactureYear),
    powertrainType: scooter.powertrainType,
    engineCc: scooter.engineCc == null ? "" : String(scooter.engineCc),
    powerKw: scooter.powerKw == null ? "" : String(scooter.powerKw),
    purchasedOn: dateOnlyToDateParts(scooter.purchasedOn),
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
  const purchasedOn = buildDateOnly(form.purchasedOn);
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
  const registration = buildRegistrationInput(form, messages, errors);

  if (blank(form.color)) {
    errors.color = messages.required("color");
  }

  if (purchasedOn.error) {
    errors.purchasedOn = messages.invalidDate("purchasedOn");
  } else if (!purchasedOn.value) {
    errors.purchasedOn = messages.required("purchasedOn");
  }

  if (form.powertrainType === "electric" && form.engineCc.trim().length > 0) {
    errors.engineCc = messages.engineCcElectric();
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const input: Record<string, unknown> = {
    vin: form.vin,
    brand: form.brand,
    model: form.model,
    color: form.color,
    manufactureYear,
    powertrainType: form.powertrainType,
    powerKw: powerKw ?? null,
    purchasedOn: purchasedOn.value,
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
    value === "brand" ||
    value === "model" ||
    value === "color" ||
    value === "manufactureYear" ||
    value === "powertrainType" ||
    value === "engineCc" ||
    value === "powerKw" ||
    value === "purchasedOn" ||
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
