import { z } from "zod";

export const retentionCategorySchema = z.enum([
  "contract",
  "selfie",
  "identity",
  "audit",
  "media",
]);
export type RetentionCategory = z.infer<typeof retentionCategorySchema>;
const id = z.string().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const retentionPolicyInputSchema = z.strictObject({
  category: retentionCategorySchema,
  daysAfterRentalClosed: z.number().int().min(1).max(36500),
  legalBasis: z.string().trim().min(20).max(4000),
});
export const retentionApprovalInputSchema = z.strictObject({
  manifestHash: hash,
  statement: z.string().trim().min(20).max(4000),
});
export const retentionPolicyApprovalInputSchema = z.strictObject({
  statement: z.string().trim().min(20).max(4000),
});
export const retentionPreviewInputSchema = z.strictObject({
  packageIds: z
    .array(id)
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate packages"),
  categories: z
    .array(retentionCategorySchema)
    .min(1)
    .max(5)
    .refine(
      (categories) => new Set(categories).size === categories.length,
      "Duplicate categories",
    ),
});
export const retentionHoldInputSchema = z
  .strictObject({
    packageId: id.optional(),
    assetId: id.optional(),
    category: retentionCategorySchema.optional(),
    reason: z.string().trim().min(10).max(4000),
    legalBasis: z.string().trim().min(20).max(4000),
  })
  .refine(
    (value) => !(value.packageId && value.assetId),
    "Choose package or asset scope, or neither for a company/category hold",
  );
export const retentionHoldReleaseInputSchema = z.strictObject({
  reason: z.string().trim().min(20).max(4000),
});
export const retentionExecuteInputSchema = z.strictObject({
  manifestHash: hash,
});
export const retentionManifestItemSchema = z.strictObject({
  category: retentionCategorySchema,
  subjectType: z.enum(["asset", "package", "audit"]),
  targetId: id,
  packageIds: z.array(id),
  policyId: id,
  expectedHash: hash,
  eligibleAt: z.iso.datetime(),
  byteSize: z.number().int().nonnegative(),
  blockers: z.array(z.string()),
});
export const retentionManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  companyId: id,
  packageIds: z.array(id),
  categories: z.array(retentionCategorySchema),
  createdAt: z.iso.datetime(),
  policyVersions: z.array(
    z.strictObject({
      id,
      category: retentionCategorySchema,
      version: z.number().int().positive(),
      daysAfterRentalClosed: z.number().int().positive(),
    }),
  ),
  items: z.array(retentionManifestItemSchema),
  blockers: z.array(z.string()),
});
