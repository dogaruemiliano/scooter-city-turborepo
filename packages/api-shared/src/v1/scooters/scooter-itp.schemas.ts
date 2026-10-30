import { z } from "zod";
import { dateOnlySchema, dateOnlyToday } from "../common/common.schemas";

const identifier = z.string().min(1).max(120);
export const scooterItpResultSchema = z.enum(["passed", "failed", "unknown"]);
export const scooterItpInputSchema = z
  .object({
    inspectionDate: dateOnlySchema.nullable(),
    validUntil: dateOnlySchema.nullable(),
    result: scooterItpResultSchema,
    certificateNumber: z.string().trim().min(1).max(120).nullable(),
    odometerKm: z.number().int().nonnegative().max(2_147_483_647).nullable(),
    cardDocumentId: identifier.nullable(),
    certificateDocumentId: identifier.nullable(),
    source: z.enum(["manual", "document"]).optional(),
    evidenceReviewed: z.literal(true),
    expectedLatestId: identifier.nullable().optional(),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.source === "manual" && record.expectedLatestId === undefined)
      context.addIssue({
        code: "custom",
        path: ["expectedLatestId"],
        message: "itpHistoryRequired",
      });
    if (
      (record.source ?? "document") === "document" &&
      (!record.inspectionDate ||
        !record.cardDocumentId ||
        !record.certificateDocumentId)
    )
      context.addIssue({
        code: "custom",
        path: ["inspectionDate"],
        message: "itpEvidenceRequired",
      });
    if (
      record.source === "manual" &&
      (record.cardDocumentId || record.certificateDocumentId)
    )
      context.addIssue({
        code: "custom",
        path: ["cardDocumentId"],
        message: "itpManualEvidence",
      });
    if (
      record.source === "manual" &&
      !record.validUntil &&
      record.result !== "failed"
    )
      context.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "itpValidityRequired",
      });
    if (
      record.validUntil &&
      record.inspectionDate &&
      record.validUntil < record.inspectionDate
    )
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
    if (record.inspectionDate && record.inspectionDate > dateOnlyToday())
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
    inspectionDate: dateOnlySchema.nullable(),
    validUntil: dateOnlySchema.nullable(),
    result: scooterItpResultSchema,
    certificateNumber: z.string().nullable(),
    odometerKm: z.number().int().nonnegative().nullable(),
    cardDocumentId: identifier.nullable(),
    certificateDocumentId: identifier.nullable(),
    source: z.enum(["manual", "document"]).optional(),
    effectiveDate: dateOnlySchema.optional(),
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
  inspections: (Pick<
    ScooterItpInspection,
    "inspectionDate" | "validUntil" | "result"
  > & { effectiveDate?: string; createdAt?: string })[],
  today = dateOnlyToday(),
  civIssuedAt?: string | null,
): {
  status: ScooterItpStatus;
  validUntil: string | null;
  renewalRequired: boolean;
} {
  // RAR's inspection on CIV issuance is the initial two-year inspection.
  const initialExpiry = civIssuedAt
    ? initialScooterItpExpiry(civIssuedAt)
    : null;
  const records =
    inspections.length || !initialExpiry
      ? inspections
      : [
          {
            inspectionDate: civIssuedAt!,
            validUntil: initialExpiry,
            result: "passed" as const,
          },
        ];
  const latest = [...records].sort(
    (a, b) =>
      (
        b.effectiveDate ??
        b.inspectionDate ??
        b.createdAt?.slice(0, 10) ??
        ""
      ).localeCompare(
        a.effectiveDate ?? a.inspectionDate ?? a.createdAt?.slice(0, 10) ?? "",
      ) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  )[0];
  if (!latest)
    return { status: "missing", validUntil: null, renewalRequired: true };
  if (latest.result === "failed")
    return { status: "failed", validUntil: null, renewalRequired: true };
  if (
    latest.result !== "passed" ||
    !latest.validUntil ||
    (latest.inspectionDate != null && latest.inspectionDate > today)
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

/** Add calendar years and clamp leap-day issuance to February's last day. */
export function initialScooterItpExpiry(issuedAt: string): string | null {
  if (!dateOnlySchema.safeParse(issuedAt).success) return null;
  const issued = new Date(`${issuedAt}T00:00:00Z`);
  const year = issued.getUTCFullYear() + 2;
  const month = issued.getUTCMonth();
  const day = Math.min(
    issued.getUTCDate(),
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
  );
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}
