import { v1 } from "@repo/api-shared";
import { z } from "zod";
import {
  insuranceEditorDefaults,
  type InsuranceEditorValues,
} from "./scooter-editor-schema";

const documentVinsSchema = z
  .array(
    z
      .object({
        fileName: z.string().min(1).max(255),
        documentType: z.enum(v1.scooters.SCOOTER_DOCUMENT_TYPES),
        vin: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-HJ-NPR-Z0-9]{17}$/)
          .nullable(),
      })
      .strict(),
  )
  .min(1)
  .max(100);
const valueSchema = z.union([z.string().max(500), z.number(), z.null()]);
const extractedPolicySchema = z
  .object({
    insuredName: valueSchema.optional(),
    validFrom: valueSchema.optional(),
    validUntil: valueSchema.optional(),
    premiumAmount: valueSchema.optional(),
    currency: valueSchema.optional(),
    documentVin: valueSchema.optional(),
    sourceFileNames: z.array(z.string().min(1).max(255)).min(1).max(20),
    rawFields: v1.scooters.insuranceRawFieldsSchema.optional(),
  })
  .strict();
type ExtractedPolicy = z.infer<typeof extractedPolicySchema>;
type InsuranceField = (typeof v1.scooters.INSURANCE_FIELDS)[number];

function normalizePolicyField(field: InsuranceField, original: unknown) {
  const value = typeof original === "string" ? original.trim() : original;
  if (value == null || value === "" || value === "-") return null;
  if (field === "premiumAmount" && typeof value === "string")
    return v1.vehicleCiv.parseCivNumber(value);
  if (field === "documentVin" && typeof value === "string")
    return value.toUpperCase();
  return value;
}

/** Combine pages of an explicitly associated policy without choosing between conflicts. */
function mergePolicyReadings(readings: ExtractedPolicy[]) {
  const normalized: Record<string, unknown> = {};
  const rawFields: NonNullable<v1.scooters.InsurancePolicyInput["rawFields"]> =
    {};
  for (const field of v1.scooters.INSURANCE_FIELDS) {
    const values = readings.map((reading) => {
      const original = reading[field];
      const value = typeof original === "string" ? original.trim() : original;
      return {
        value: normalizePolicyField(field, original),
        raw:
          reading.rawFields?.[field] !== undefined
            ? reading.rawFields[field]
            : value == null || value === ""
              ? null
              : String(original),
      };
    });
    // A printed dash is affirmative evidence of an empty field, unlike an unreadable page.
    const known = values.filter(
      (entry) => entry.value != null || entry.raw?.trim() === "-",
    );
    const distinct = new Set(known.map((entry) => entry.value));
    const conflict = distinct.size > 1;
    const selected = known[0] ?? values[0]!;
    normalized[field] = conflict ? null : selected.value;
    rawFields[field] = conflict ? null : selected.raw;
  }
  return { normalized, rawFields };
}

export function parseInsuranceImport(
  source: Record<string, unknown>,
  currentVin: string,
  current: InsuranceEditorValues[] = [],
  files: { fileName: string; insurancePolicyId?: string | null }[] = [],
) {
  const errors: string[] = [];
  const vins =
    source.documentVins === undefined
      ? undefined
      : documentVinsSchema.safeParse(source.documentVins);
  if (vins && !vins.success) errors.push("documentVins");
  const incoming =
    source.insurancePolicies === undefined
      ? undefined
      : z
          .array(extractedPolicySchema)
          .max(100)
          .safeParse(source.insurancePolicies);
  if (incoming && !incoming.success) errors.push("insurancePolicies");
  if (incoming?.success && incoming.data.length && !vins?.success)
    errors.push("documentVins");
  const evidence = vins?.success ? vins.data : [];
  const known = [
    currentVin,
    typeof source.vin === "string" && source.vin !== "-" ? source.vin : "",
    ...evidence.map((doc) => doc.vin ?? ""),
    ...(incoming?.success
      ? incoming.data.map((policy) =>
          typeof policy.documentVin === "string" && policy.documentVin !== "-"
            ? policy.documentVin
            : "",
        )
      : []),
  ]
    .map((vin) => vin.trim().toUpperCase())
    .filter((vin) => Boolean(vin) && vin !== "-");
  const mismatch = new Set(known).size > 1;
  const policies = current.map((policy) => ({ ...policy }));
  let needsVinReview = !known.length && evidence.some((doc) => !doc.vin);
  const groups = new Map<
    string,
    {
      explicitId: string | undefined;
      readings: ExtractedPolicy[];
      sourceFileNames: string[];
    }
  >();
  if (incoming?.success)
    for (const raw of incoming.data) {
      const matchingFiles = files.filter((file) =>
        raw.sourceFileNames.includes(file.fileName),
      );
      const ids = [
        ...new Set(
          matchingFiles.map((file) => file.insurancePolicyId).filter(Boolean),
        ),
      ];
      // Never guess which saved policy owns the document or combine separate policies.
      if (ids.length > 1) {
        errors.push("insurancePolicies.sourceFileNames");
        continue;
      }
      const evidenceForPolicy = evidence.filter(
        (doc) =>
          raw.sourceFileNames.includes(doc.fileName) &&
          doc.documentType === "insurance",
      );
      if (
        raw.sourceFileNames.some(
          (name) => !evidenceForPolicy.some((doc) => doc.fileName === name),
        )
      )
        errors.push("insurancePolicies.sourceFileNames");
      const sourceKey = [...raw.sourceFileNames].sort().join("\n");
      const duplicate = current.find(
        (policy) =>
          policy.sourceFileNames &&
          [...policy.sourceFileNames].sort().join("\n") === sourceKey,
      );
      const id = ids[0] ?? duplicate?.id ?? crypto.randomUUID();
      const group = groups.get(id);
      if (group && (!ids[0] || group.explicitId !== ids[0])) {
        errors.push("insurancePolicies.sourceFileNames");
        continue;
      }
      groups.set(id, {
        explicitId: ids[0] ?? undefined,
        readings: [...(group?.readings ?? []), raw],
        sourceFileNames: [
          ...new Set([
            ...(group?.sourceFileNames ?? []),
            ...raw.sourceFileNames,
          ]),
        ],
      });
    }
  for (const [id, group] of groups) {
    const { normalized, rawFields } = mergePolicyReadings(group.readings);
    if (
      ![
        normalized.insuredName,
        normalized.validFrom,
        normalized.validUntil,
        normalized.premiumAmount,
      ].some((value) => value !== null && value !== undefined && value !== "")
    ) {
      needsVinReview ||= !normalized.documentVin;
      continue;
    }
    const parsed = v1.scooters.insurancePolicyInputSchema.safeParse({
      ...normalized,
      id,
      rawFields,
      vinReviewConfirmed: true,
    });
    if (!parsed.success) {
      errors.push(
        ...parsed.error.issues.map(
          (issue) => `insurancePolicies.${issue.path.join(".")}`,
        ),
      );
      continue;
    }
    needsVinReview ||= !parsed.data.documentVin;
    const next = insuranceEditorDefaults({
      ...parsed.data,
      vinReviewConfirmed: false,
    });
    next.sourceFileNames = group.sourceFileNames;
    const index = policies.findIndex((policy) => policy.id === id);
    if (index < 0) policies.push(next);
    else {
      const previous = policies[index]!;
      for (const field of v1.scooters.INSURANCE_FIELDS) {
        // Unknown values and printed dashes cannot erase manually entered data.
        if (!next[field]) next[field] = previous[field];
      }
      policies[index] = {
        ...previous,
        ...next,
        rawFields: { ...previous.rawFields, ...next.rawFields },
      };
    }
  }
  if (policies.length > 100) errors.push("insurancePolicies");
  return {
    errors,
    mismatch,
    needsVinReview,
    evidence,
    policies: incoming?.success ? policies : undefined,
  };
}
