import { v1 } from "@repo/api-shared";
import {
  buildDateOnly,
  dateOnlyToDateParts,
  emptyDateParts,
  type DateParts,
} from "@repo/ui/lib/date-parts";

export const DEFAULT_COMBUSTION_CYLINDER_CAPACITY_CC = "50";

export type ScooterFormField =
  | "vin"
  | "brand"
  | "model"
  | "color"
  | "manufactureYear"
  | "powertrainType"
  | "cylinderCapacityCc"
  | "purchasedOn"
  | "notes";

export type ScooterFormErrors = Partial<Record<ScooterFormField, string>>;

export interface ScooterFormState {
  vin: string;
  brand: string;
  model: string;
  color: string;
  manufactureYear: string;
  powertrainType: v1.scooters.ScooterPowertrainType;
  cylinderCapacityCc: string;
  purchasedOn: DateParts;
  notes: string;
}

export interface ScooterFormIssue {
  code: string;
  path: readonly PropertyKey[];
  message: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
}

export function createEmptyScooterForm(): ScooterFormState {
  return {
    vin: "",
    brand: "",
    model: "",
    color: "",
    manufactureYear: "",
    powertrainType: "combustion",
    cylinderCapacityCc: DEFAULT_COMBUSTION_CYLINDER_CAPACITY_CC,
    purchasedOn: emptyDateParts(),
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
    cylinderCapacityCc:
      scooter.cylinderCapacityCc == null
        ? ""
        : String(scooter.cylinderCapacityCc),
    purchasedOn: dateOnlyToDateParts(scooter.purchasedOn),
    notes: scooter.notes ?? "",
  };
}

export function buildScooterInputCandidate(
  form: ScooterFormState,
  messages: {
    required: (field: ScooterFormField) => string;
    invalidDate: (field: ScooterFormField) => string;
    invalidNumber: (field: ScooterFormField) => string;
    cylinderCapacityRequired: () => string;
    cylinderCapacityElectric: () => string;
  },
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
  const cylinderCapacityCc =
    form.powertrainType === "combustion"
      ? numberField(
          form.cylinderCapacityCc,
          "cylinderCapacityCc",
          {
            ...messages,
            required: () => messages.cylinderCapacityRequired(),
          },
          errors,
        )
      : undefined;

  if (blank(form.color)) {
    errors.color = messages.required("color");
  }

  if (purchasedOn.error) {
    errors.purchasedOn = messages.invalidDate("purchasedOn");
  } else if (!purchasedOn.value) {
    errors.purchasedOn = messages.required("purchasedOn");
  }

  if (
    form.powertrainType === "electric" &&
    form.cylinderCapacityCc.trim().length > 0
  ) {
    errors.cylinderCapacityCc = messages.cylinderCapacityElectric();
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
    purchasedOn: purchasedOn.value,
  };

  if (form.powertrainType === "electric") {
    input.cylinderCapacityCc = null;
  } else {
    input.cylinderCapacityCc = cylinderCapacityCc;
  }

  if (!blank(form.notes)) {
    input.notes = form.notes;
  } else {
    input.notes = null;
  }

  return { input };
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
    value === "cylinderCapacityCc" ||
    value === "purchasedOn" ||
    value === "notes"
  );
}

export function blank(value: string): boolean {
  return value.trim().length === 0;
}

function numberField(
  value: string,
  field: Extract<ScooterFormField, "manufactureYear" | "cylinderCapacityCc">,
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
