import { v1 } from "@repo/api-shared";
import type { DocumentImportResult } from "./scooter-document-import";
import {
  isNumericField,
  scooterCreateFormSchema,
  scooterEditFormSchema,
  type ScooterEditorValues,
} from "./scooter-editor-schema";

export interface ImportFieldReview {
  field: string;
  value: string;
  policyId?: string;
  rawCodes: string[];
}

const rawLabels: Record<string, string> = {
  "serie civ": "civNumber",
  "dată eliberare": "civIssuedAt",
  "data eliberare": "civIssuedAt",
  "reprezentanță rar": "civIssuingAuthority",
  "d.2 - variantă": "variant",
  "d.2 - versiune": "version",
};

/** A semantic raw key is the same warning as its editable CIV field. */
export function remainingCivDocumentWarnings(
  fields: string[],
  reviews: ImportFieldReview[],
): string[] {
  const covered = new Set(
    reviews
      .filter((review) => !review.policyId)
      .flatMap((review) => [
        review.field,
        ...review.rawCodes,
        ...(review.field === "brandId" ? ["brandName"] : []),
        ...(review.field === "powertrainType" ? ["propulsionSystem"] : []),
      ]),
  );
  return [...new Set(fields)].filter((field) => !covered.has(field));
}

/** Raw rubrics and structured properties referring to one input count once. */
export function importFieldReviews(
  result: Extract<DocumentImportResult, { ok: true }>,
  snapshot: ScooterEditorValues,
): ImportFieldReview[] {
  const reviews = new Map<string, ImportFieldReview>();
  function add(field: string, rawCode?: string) {
    const name = field === "brandName" ? "brandId" : field;
    const entry = reviews.get(name) ?? {
      field: name,
      value: String(snapshot[name as keyof ScooterEditorValues] ?? ""),
      rawCodes: [],
    };
    if (rawCode) entry.rawCodes.push(rawCode);
    reviews.set(name, entry);
  }
  for (const field of [...result.unresolved, ...result.emptyConflicts])
    add(field);
  if (result.unmatchedBrand) add("brandId");
  if (result.values.civVersion === "unknown") add("civVersion");
  const version = (snapshot.civVersion ||
    "unknown") as v1.vehicleCiv.CivVersion;
  for (const code of result.unresolvedRawFields) {
    const mapped =
      rawLabels[code.trim().toLocaleLowerCase("ro")] ??
      v1.vehicleCiv.resolveCivField(version, code.trim());
    if (mapped)
      add(mapped === "propulsionSystem" ? "powertrainType" : mapped, code);
  }
  return [
    ...reviews.values(),
    ...insuranceFieldReviews(result.insurancePolicies ?? []),
    ...Object.entries(result.unresolvedInsuranceFields ?? {}).flatMap(
      ([policyId, fields]) => {
        const policy = snapshot.insurancePolicies?.find(
          (item) => item.id === policyId,
        );
        return policy
          ? fields.map((field) => ({
              field,
              policyId,
              value:
                policy[field as (typeof v1.scooters.INSURANCE_FIELDS)[number]],
              rawCodes: [],
            }))
          : [];
      },
    ),
  ];
}

export function insuranceFieldReviews(
  policies: NonNullable<ScooterEditorValues["insurancePolicies"]>,
  includeRetainedValues = true,
): ImportFieldReview[] {
  const reviews = new Map<string, ImportFieldReview>();
  for (const policy of policies) {
    for (const field of v1.scooters.INSURANCE_FIELDS) {
      if (!policy.rawFields || !(field in policy.rawFields)) continue;
      // Reopening a saved form should not re-flag values already corrected by
      // the user. A new import must still flag conflicts with retained values.
      if (!includeRetainedValues && policy[field]) continue;
      const raw = policy.rawFields[field];
      if (
        raw == null ||
        raw.trim() === "" ||
        (raw.trim() === "-" && policy[field])
      ) {
        reviews.set(`${policy.id}.${field}`, {
          field,
          policyId: policy.id,
          value: policy[field],
          rawCodes: [],
        });
      }
    }
  }
  return [...reviews.values()];
}

/** A correction resolves only its own review, using the same validation as the form. */
export function remainingImportReviews(
  reviews: ImportFieldReview[],
  values: ScooterEditorValues,
  editing: boolean,
): ImportFieldReview[] {
  if (!reviews.length) return reviews;
  const validation = (
    editing ? scooterEditFormSchema : scooterCreateFormSchema
  ).safeParse(values);
  const invalidPaths = validation.success
    ? []
    : validation.error.issues.map((issue) => issue.path.join("."));
  return reviews.filter((review) => {
    const index = review.policyId
      ? (values.insurancePolicies?.findIndex(
          (policy) => policy.id === review.policyId,
        ) ?? -1)
      : -1;
    const value = review.policyId
      ? values.insurancePolicies?.[index]?.[
          review.field as (typeof v1.scooters.INSURANCE_FIELDS)[number]
        ]
      : values[review.field as keyof ScooterEditorValues];
    const path = review.policyId
      ? `insurancePolicies.${index}.${review.field}`
      : review.field;
    if (
      value == null ||
      String(value) === review.value ||
      !String(value).trim() ||
      String(value).trim() === "-" ||
      ((isNumericField(review.field) || review.field === "premiumAmount") &&
        v1.vehicleCiv.parseCivNumber(String(value)) == null)
    )
      return true;
    return invalidPaths.some(
      (invalid) =>
        !invalid ||
        path === invalid ||
        path.startsWith(`${invalid}.`) ||
        invalid.startsWith(`${path}.`),
    );
  });
}

/** Resolve array paths by policy identity; removing a policy must not move its warnings. */
export function activeImportReviews(
  reviews: ImportFieldReview[],
  values: ScooterEditorValues,
  editing: boolean,
) {
  const active: Record<string, ImportFieldReview> = {};
  const inactive = new Set<string>(
    v1.scooters.inactivePowertrainFields(values.powertrainType),
  );
  for (const review of reviews) {
    if (review.policyId) {
      const index =
        values.insurancePolicies?.findIndex(
          (policy) => policy.id === review.policyId,
        ) ?? -1;
      const policy = values.insurancePolicies?.[index];
      if (
        policy &&
        policy[review.field as keyof typeof policy] === review.value
      )
        active[`insurancePolicies.${index}.${review.field}`] = review;
      continue;
    }
    const field = review.field;
    if (
      inactive.has(field) ||
      (field === "fuelType" && values.powertrainType === "electric")
    )
      continue;
    if (
      field.endsWith("Other") &&
      values[field.slice(0, -5) as keyof ScooterEditorValues] !== "other"
    )
      continue;
    if (
      [
        "registrationNumber",
        "registrationDate",
        "requiredLicenseCategory",
        "temporaryRegistrationExpiresAt",
      ].includes(field)
    ) {
      if (
        editing ||
        !values.registrationType ||
        values.registrationType === "unregistered"
      )
        continue;
      if (
        field === "temporaryRegistrationExpiresAt" &&
        values.registrationType !== "temporary"
      )
        continue;
    }
    if (
      String(values[field as keyof ScooterEditorValues] ?? "") === review.value
    )
      active[field] = review;
  }
  return active;
}

export function unresolvedDocumentRubrics(
  result: Extract<DocumentImportResult, { ok: true }>,
  snapshot: ScooterEditorValues,
) {
  const version = (snapshot.civVersion ||
    "unknown") as v1.vehicleCiv.CivVersion;
  return result.unresolvedRawFields.filter(
    (code) =>
      !["mentiuni", "mențiuni"].includes(code.trim().toLowerCase()) &&
      !rawLabels[code.trim().toLocaleLowerCase("ro")] &&
      !v1.vehicleCiv.resolveCivField(version, code.trim()),
  );
}
