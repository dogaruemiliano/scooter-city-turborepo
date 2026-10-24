import { z } from "zod";
import { dateOnlySchema, dateOnlyToday } from "../common/common.schemas";

const identifier = z.string().min(1).max(120);
export const scooterItpResultSchema = z.enum(["passed", "failed", "unknown"]);
export const scooterItpInputSchema = z
  .object({
    inspectionDate: dateOnlySchema,
    validUntil: dateOnlySchema.nullable(),
    result: scooterItpResultSchema,
    certificateNumber: z.string().trim().min(1).max(120).nullable(),
    odometerKm: z.number().int().nonnegative().max(2_147_483_647).nullable(),
    cardDocumentId: identifier,
    certificateDocumentId: identifier,
    evidenceReviewed: z.literal(true),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.validUntil && record.validUntil < record.inspectionDate)
      context.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "itpDateOrder",
      });
    if (record.result === "passed" && !record.validUntil)
      context.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "itpValidityRequired",
      });
    if (record.inspectionDate > dateOnlyToday())
      context.addIssue({
        code: "custom",
        path: ["inspectionDate"],
        message: "itpFutureInspection",
      });
  })
  .meta({ id: "ScooterItpInput" });
export type ScooterItpInput = z.infer<typeof scooterItpInputSchema>;

export const scooterItpInspectionSchema = z
  .object({
    id: identifier,
    inspectionDate: dateOnlySchema,
    validUntil: dateOnlySchema.nullable(),
    result: scooterItpResultSchema,
    certificateNumber: z.string().nullable(),
    odometerKm: z.number().int().nonnegative().nullable(),
    cardDocumentId: identifier,
    certificateDocumentId: identifier,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type ScooterItpInspection = z.infer<typeof scooterItpInspectionSchema>;
export const scooterItpStatusSchema = z.enum([
  "missing",
  "review",
  "active",
  "expiring",
  "expired",
  "failed",
]);
export type ScooterItpStatus = z.infer<typeof scooterItpStatusSchema>;

/** The newest recorded inspection controls status, never the furthest expiry. */
export function scooterItpSummary(
  inspections: Pick<
    ScooterItpInspection,
    "inspectionDate" | "validUntil" | "result"
  >[],
  today = dateOnlyToday(),
): {
  status: ScooterItpStatus;
  validUntil: string | null;
  renewalRequired: boolean;
} {
  const latest = [...inspections].sort((a, b) =>
    b.inspectionDate.localeCompare(a.inspectionDate),
  )[0];
  if (!latest)
    return { status: "missing", validUntil: null, renewalRequired: true };
  if (latest.result === "failed")
    return { status: "failed", validUntil: null, renewalRequired: true };
  if (
    latest.result !== "passed" ||
    !latest.validUntil ||
    latest.inspectionDate > today
  )
    return {
      status: "review",
      validUntil: latest.validUntil,
      renewalRequired: true,
    };
  const warningDate = new Date(`${today}T00:00:00Z`);
  warningDate.setUTCDate(warningDate.getUTCDate() + 30);
  const status =
    latest.validUntil < today
      ? "expired"
      : latest.validUntil <= warningDate.toISOString().slice(0, 10)
        ? "expiring"
        : "active";
  return {
    status,
    validUntil: latest.validUntil,
    renewalRequired: status === "expired",
  };
}

export const scooterItpListSchema = z
  .object({
    inspections: z.array(scooterItpInspectionSchema),
    status: scooterItpStatusSchema,
    validUntil: dateOnlySchema.nullable(),
    renewalRequired: z.boolean(),
  })
  .strict()
  .meta({ id: "ScooterItpList" });
export type ScooterItpList = z.infer<typeof scooterItpListSchema>;
