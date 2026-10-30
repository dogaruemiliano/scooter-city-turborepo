import { z } from "zod";
import { dateOnlySchema, dateOnlyToday } from "../common/common.schemas";

export const INSURANCE_FIELDS = [
  "insuredName",
  "validFrom",
  "validUntil",
  "premiumAmount",
  "currency",
  "documentVin",
] as const;
export const insuranceRawFieldsSchema = z.partialRecord(
  z.enum(INSURANCE_FIELDS),
  z.string().max(500).nullable(),
);

export const insurancePolicyInputSchema = z
  .object({
    id: z.string().min(1).max(120),
    insuredName: z.string().trim().min(1).max(250).nullable(),
    validFrom: dateOnlySchema.nullable(),
    validUntil: dateOnlySchema.nullable(),
    premiumAmount: z
      .number()
      .nonnegative()
      .max(9_999_999_999.99)
      .multipleOf(0.01)
      .nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    documentVin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-HJ-NPR-Z0-9]{17}$/)
      .nullable(),
    vinReviewConfirmed: z.boolean().default(false),
    rawFields: insuranceRawFieldsSchema.optional(),
  })
  .strict()
  .superRefine((policy, ctx) => {
    if (
      policy.validFrom &&
      policy.validUntil &&
      policy.validUntil < policy.validFrom
    )
      ctx.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "insuranceDateOrder",
      });
    if (
      !policy.insuredName &&
      !policy.validFrom &&
      !policy.validUntil &&
      policy.premiumAmount === null
    )
      ctx.addIssue({
        code: "custom",
        path: ["insuredName"],
        message: "insuranceEmpty",
      });
  });
export type InsurancePolicyInput = z.infer<typeof insurancePolicyInputSchema>;

export const insurancePoliciesInputSchema = z
  .array(insurancePolicyInputSchema)
  .max(100)
  .superRefine((policies, ctx) => {
    if (new Set(policies.map((policy) => policy.id)).size !== policies.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate insurance policy IDs",
      });
  });
export const insurancePolicySchema = z.object({
  ...insurancePolicyInputSchema.shape,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type InsurancePolicy = z.infer<typeof insurancePolicySchema>;

export const insuranceAttentionSchema = z.enum([
  "expired",
  "upcoming",
  "review",
]);
export type InsuranceAttention = z.infer<typeof insuranceAttentionSchema>;

/** No warning is not a readiness guarantee: a scooter may have no recorded policy. */
export function insuranceAttention(
  policies: Pick<InsurancePolicyInput, "validFrom" | "validUntil">[],
  today = dateOnlyToday(),
): InsuranceAttention | null {
  const statuses = policies.map((policy) => insuranceStatus(policy, today));
  if (!statuses.length || statuses.includes("active")) return null;
  if (statuses.includes("review")) return "review";
  if (statuses.includes("expired")) return "expired";
  return "upcoming";
}

export function insuranceStatus(
  policy: Pick<InsurancePolicyInput, "validFrom" | "validUntil">,
  today = dateOnlyToday(),
) {
  if (!policy.validFrom || !policy.validUntil) return "review";
  if (policy.validUntil < today) return "expired";
  if (policy.validFrom > today) return "upcoming";
  return "active";
}

export function insurancePeriodsOverlap(
  policies: Pick<InsurancePolicyInput, "validFrom" | "validUntil">[],
) {
  return policies.some(
    (a, index) =>
      a.validFrom &&
      a.validUntil &&
      policies
        .slice(index + 1)
        .some(
          (b) =>
            b.validFrom &&
            b.validUntil &&
            a.validFrom! <= b.validUntil &&
            b.validFrom <= a.validUntil!,
        ),
  );
}

/** Readiness summary: unlike attention, missing insurance is explicit. */
export function rentalInsuranceStatus(
  policies: Pick<InsurancePolicyInput, "validFrom" | "validUntil">[],
  today = dateOnlyToday(),
): "missing" | "active" | InsuranceAttention {
  if (!policies.length) return "missing";
  const statuses = policies.map((policy) => insuranceStatus(policy, today));
  if (statuses.includes("active")) return "active";
  return insuranceAttention(policies, today) ?? "missing";
}

export const insuranceRevisionSchema = z.object({
  id: z.string(),
  policyId: z.string(),
  snapshot: insurancePolicySchema,
  source: z.enum(["manual", "document", "unknown"]),
  action: z.enum(["change", "deleted"]).optional(),
  createdAt: z.iso.datetime(),
});
export const scooterInsuranceListSchema = z.object({
  policies: z.array(insurancePolicySchema),
  history: z.array(insuranceRevisionSchema),
  updatedAt: z.iso.datetime(),
});
export type ScooterInsuranceList = z.infer<typeof scooterInsuranceListSchema>;
export const scooterInsuranceSaveSchema = z
  .object({
    policies: insurancePoliciesInputSchema,
    expectedUpdatedAt: z.iso.datetime(),
    source: z.enum(["manual", "document"]).default("manual"),
  })
  .strict();
export type ScooterInsuranceSave = z.infer<typeof scooterInsuranceSaveSchema>;

export const scooterInsuranceDeleteSchema = z
  .object({ expectedUpdatedAt: z.iso.datetime() })
  .strict();
