import { ApiError } from "@repo/api-shared";
import {
  CREATE_FIELDS,
  type ScooterEditorField,
} from "./scooter-editor-schema";
import type {
  ValidationIssue,
  ValidationTranslator,
} from "@/lib/form/messages";
import { INTEGER_FIELDS, isNumericField } from "./scooter-editor-schema";

export function scooterEditorMessage(
  issue: ValidationIssue,
  path: string,
  t: ValidationTranslator,
): string | undefined {
  if (path === "fleetNumber") return t("numbering.invalid");
  if (path.startsWith("insurancePolicies")) {
    if (issue.message === "insuranceVinMismatch")
      return t("insurance.vinMismatch");
    if (issue.message === "insuranceDateOrder") return t("insurance.dateOrder");
    if (issue.message === "insuranceVinReview")
      return t("insurance.vinReviewRequired");
    if (path.endsWith("documentVin"))
      return t("feedback.validation.invalidVin");
    return undefined;
  }
  const field = t(`fields.${path === "brandId" ? "brand" : path}`);
  if (issue.message === "Fuel does not match the selected powertrain.")
    return t("feedback.validation.incompatibleFuel");
  if (path === "vin") return t("feedback.validation.invalidVin");
  if (isNumericField(path)) {
    if (
      path === "currentMileageKm" &&
      (issue.code === "invalid_type" ||
        (issue.code === "too_small" && issue.minimum !== undefined))
    )
      return t("feedback.validation.invalidMileage");
    if (
      issue.minimum === 0 &&
      ["powerKw", "engineDisplacementCc"].includes(path)
    ) {
      return t("feedback.validation.positiveNumber", { field });
    }
    if (issue.minimum !== undefined)
      return t("feedback.validation.minimumNumber", {
        field,
        min: Number(issue.minimum),
      });
    if (issue.maximum !== undefined)
      return t("feedback.validation.maximumNumber", {
        field,
        max: Number(issue.maximum),
      });
    if (issue.code === "invalid_type")
      return t(
        INTEGER_FIELDS.has(path)
          ? "feedback.validation.invalidInteger"
          : "feedback.validation.invalidNumber",
        { field },
      );
  }
  if (
    issue.message?.includes("is required") ||
    (["requiredLicenseCategory", "powertrainType"].includes(path) &&
      issue.code === "invalid_value")
  )
    return t("feedback.validation.required", { field });
  if (
    issue.message ===
    "Plate number does not match the selected registration type."
  )
    return t("feedback.validation.invalidPlateNumber");
  if (path === "civIssuedAt" && issue.code === "custom")
    return t("feedback.validation.invalid", { field });
  if (issue.message === "Registration date must be today or earlier.")
    return t("feedback.validation.registeredOnPastOrToday");
  if (
    issue.message ===
    "Registration expiry date must be on or after the registration date."
  )
    return t("feedback.validation.registrationExpiresOnAfterRegisteredOn");
  if (issue.message === "Engine cc is only allowed for combustion scooters.")
    return t("feedback.validation.engineCcElectric");
  if (
    ["registrationDate", "temporaryRegistrationExpiresAt"].includes(path) &&
    issue.code === "custom"
  )
    return t("feedback.validation.invalid", { field });
  return undefined;
}

/** Normalize the API's flat field paths without applying errors to unknown form controls. */
export function scooterServerFieldErrors(
  error: unknown,
  t: ValidationTranslator,
): Partial<Record<ScooterEditorField, string>> {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return {};
  const errors: Partial<Record<ScooterEditorField, string>> = {};
  for (const issue of error.details as unknown[]) {
    if (
      !issue ||
      typeof issue !== "object" ||
      !("path" in issue) ||
      typeof issue.path !== "string" ||
      !(CREATE_FIELDS as readonly string[]).includes(issue.path)
    )
      continue;
    const field = issue.path as ScooterEditorField;
    const message =
      "message" in issue && typeof issue.message === "string"
        ? issue.message
        : "";
    const code =
      "code" in issue && typeof issue.code === "string"
        ? issue.code
        : undefined;
    errors[field] =
      scooterEditorMessage({ path: [field], code, message }, field, t) ??
      t("feedback.validation.invalid", {
        field: t(`fields.${field === "brandId" ? "brand" : field}`),
      });
  }
  return errors;
}
