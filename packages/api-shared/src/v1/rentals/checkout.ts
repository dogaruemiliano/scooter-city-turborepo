import { z } from "zod";

export const RENTAL_POLICY = {
  version: "2026-10-30-v1",
  timezone: "Europe/Bucharest",
  agreementMonths: 24,
  noticeDays: 7,
  minimumParticipantAge: 18,
  depositMinor: 30_000,
  weeklyRates: { without_license: 30_000, with_license: 25_000 },
} as const;

export const commercialCategorySchema = z.enum([
  "without_license",
  "with_license",
]);
export const rentalPromotionSchema = z.enum(["standard", "three_plus_one"]);
export const NEW_CUSTOMER_PROMOTION_ERROR_CODE =
  "RENTAL_PROMOTION_NEW_CUSTOMERS_ONLY";
export const rentalConclusionContextSchema = z.enum([
  "on_site",
  "distance",
  "off_premises",
]);
export type RentalConclusionContext = z.infer<
  typeof rentalConclusionContextSchema
>;
export const rentalContextInputSchema = z
  .object({
    revision: z.number().int().positive(),
    conclusionContext: rentalConclusionContextSchema,
  })
  .strict();
export const rentalPaymentMethodSchema = z.enum(["cash", "transfer", "card"]);
export const rentalTermsSchema = z
  .object({
    schemaVersion: z.literal(1),
    tariffVersion: z.string(),
    commercialCategory: commercialCategorySchema,
    promotion: rentalPromotionSchema,
    weeklyRateMinor: z.number().int().positive(),
    depositMinor: z.number().int().nonnegative(),
    initialRentMinor: z.number().int().positive(),
    initialTotalMinor: z.number().int().positive(),
    initialCoverageDays: z.union([z.literal(7), z.literal(28)]),
    agreementMonths: z.literal(24),
    noticeDays: z.literal(7),
    timezone: z.literal("Europe/Bucharest"),
    rentalPaymentMethod: rentalPaymentMethodSchema,
    depositPaymentMethod: rentalPaymentMethodSchema,
  })
  .strict();
export type RentalTerms = z.infer<typeof rentalTermsSchema>;

/** Prices are integer bani and commercial category never implies driving eligibility. */
export function calculateRentalTerms(
  commercialCategory: z.infer<typeof commercialCategorySchema>,
  promotion: z.infer<typeof rentalPromotionSchema> = "standard",
  rentalPaymentMethod: z.infer<typeof rentalPaymentMethodSchema> = "cash",
  depositPaymentMethod: z.infer<typeof rentalPaymentMethodSchema> = "cash",
): RentalTerms {
  const weeklyRateMinor = RENTAL_POLICY.weeklyRates[commercialCategory];
  const initialRentMinor =
    weeklyRateMinor * (promotion === "three_plus_one" ? 3 : 1);
  return {
    schemaVersion: 1,
    tariffVersion: RENTAL_POLICY.version,
    commercialCategory,
    promotion,
    weeklyRateMinor,
    depositMinor: RENTAL_POLICY.depositMinor,
    initialRentMinor,
    initialTotalMinor: initialRentMinor + RENTAL_POLICY.depositMinor,
    initialCoverageDays: promotion === "three_plus_one" ? 28 : 7,
    agreementMonths: RENTAL_POLICY.agreementMonths,
    noticeDays: RENTAL_POLICY.noticeDays,
    timezone: RENTAL_POLICY.timezone,
    rentalPaymentMethod,
    depositPaymentMethod,
  };
}

const partFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: RENTAL_POLICY.timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
function localParts(date: Date): number[] {
  const parts = Object.fromEntries(
    partFormatter.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return ["year", "month", "day", "hour", "minute", "second"].map((key) =>
    Number(parts[key]),
  );
}
function localEpoch(parts: number[]): number {
  return Date.UTC(
    parts[0]!,
    parts[1]! - 1,
    parts[2]!,
    parts[3]!,
    parts[4]!,
    parts[5]!,
  );
}
/** Adds Bucharest calendar days/months, preserving wall-clock time across DST. */
export function addRentalCalendar(date: Date, days: number, months = 0): Date {
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid rental date");
  const [year, month, day, hour, minute, second] = localParts(date);
  const target = new Date(
    Date.UTC(
      year!,
      month! - 1 + months,
      1,
      hour!,
      minute!,
      second!,
      date.getUTCMilliseconds(),
    ),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day!, lastDay) + days);
  const wanted = target.getTime();
  let utc = wanted;
  for (let attempt = 0; attempt < 4; attempt++) {
    const offset =
      localEpoch(localParts(new Date(utc))) - Math.floor(utc / 1000) * 1000;
    const next = wanted - offset;
    if (next === utc) return new Date(utc);
    utc = next;
  }
  // DST-gap wall times do not exist. Reject instead of silently changing a signed start.
  if (
    localEpoch(localParts(new Date(utc))) !==
    Math.floor(wanted / 1000) * 1000
  )
    throw new Error("Rental date falls in a daylight-saving gap");
  return new Date(utc);
}

export function rentalDateOnly(date: Date): string {
  const [year, month, day] = localParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
/** Until an approved representation procedure exists, unknown/minor participants fail closed. */
export function rentalAdultPolicyEligible(
  dateOfBirth: string | null | undefined,
  at: Date,
): boolean {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return false;
  const birth = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (
    !Number.isFinite(birth.getTime()) ||
    birth.toISOString().slice(0, 10) !== dateOfBirth
  )
    return false;
  const adult = new Date(
    Date.UTC(
      birth.getUTCFullYear() + RENTAL_POLICY.minimumParticipantAge,
      birth.getUTCMonth(),
      birth.getUTCDate(),
    ),
  )
    .toISOString()
    .slice(0, 10);
  return adult <= rentalDateOnly(at);
}

/** Convert a date-only reservation input to Bucharest midnight, independently of browser timezone. */
export function rentalDateStart(dateOnly: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly))
    throw new Error("Invalid rental date");
  const wanted = Date.parse(`${dateOnly}T00:00:00.000Z`);
  if (
    !Number.isFinite(wanted) ||
    new Date(wanted).toISOString().slice(0, 10) !== dateOnly
  )
    throw new Error("Invalid rental date");
  let utc = wanted;
  for (let attempt = 0; attempt < 4; attempt++) {
    const offset =
      localEpoch(localParts(new Date(utc))) - Math.floor(utc / 1000) * 1000;
    const next = wanted - offset;
    if (next === utc) return new Date(utc);
    utc = next;
  }
  throw new Error("Rental midnight could not be resolved");
}

export const equipmentPresenceSchema = z.enum(["present", "absent", "unknown"]);
export const inspectionCheckSchema = z.enum([
  "ok",
  "defect",
  "not_checked",
  "not_applicable",
]);
export const inspectionEquipmentSchema = z
  .object({
    presence: equipmentPresenceSchema,
    condition: inspectionCheckSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.presence === "absent" && value.condition !== "not_applicable")
      ctx.addIssue({
        code: "custom",
        path: ["condition"],
        message: "Absent equipment is not applicable",
      });
    if (value.presence === "unknown" && value.condition !== "not_checked")
      ctx.addIssue({
        code: "custom",
        path: ["condition"],
        message: "Unknown equipment must remain unchecked",
      });
  });
export const rentalInspectionDataSchema = z
  .object({
    schemaVersion: z.literal(1),
    odometerDisplayedKm: z.number().int().nonnegative().nullable(),
    odometer: inspectionCheckSchema,
    speedometer: inspectionCheckSchema,
    brakes: inspectionCheckSchema,
    tyres: inspectionCheckSchema,
    lights: inspectionCheckSchema,
    horn: inspectionCheckSchema,
    mirrors: inspectionCheckSchema,
    phoneStand: inspectionEquipmentSchema,
    chargingOutlet: inspectionEquipmentSchema,
    helmetCount: z.number().int().min(0).max(10),
    keysCount: z.number().int().min(0).max(10),
    fuelPercent: z.number().min(0).max(100).nullable(),
    observedSpeedKmh: z.number().nonnegative().max(300).nullable(),
    speedVerificationMethod: z.string().trim().max(2000).nullable(),
    limiterCheck: inspectionCheckSchema,
    operatorSpeedConfirmed: z.boolean(),
    cosmeticNotes: z.string().trim().max(4000),
    mediaIds: z.array(z.string().min(1)).max(100),
    criticalDefect: z.string().trim().max(4000).nullable(),
    additionalChecks: z
      .object({
        engine: inspectionCheckSchema,
        electricStart: inspectionCheckSchema,
        kickstart: inspectionCheckSchema,
        batteryCharge: inspectionCheckSchema,
        frontTyre: inspectionCheckSchema,
        rearTyre: inspectionCheckSchema,
        headlight: inspectionCheckSchema,
        indicators: inspectionCheckSchema,
        brakeLight: inspectionCheckSchema,
        helmet: inspectionCheckSchema,
        keys: inspectionCheckSchema,
      })
      .strict(),
    additionalEquipment: z
      .object({
        topCase: inspectionEquipmentSchema,
        luggageRack: inspectionEquipmentSchema,
        antitheft: inspectionEquipmentSchema,
      })
      .strict(),
    technicalNotes: z.string().trim().max(4000),
    equipmentNotes: z.string().trim().max(4000),
  })
  .strict();
export type RentalInspectionData = z.infer<typeof rentalInspectionDataSchema>;
export const saveRentalInspectionInputSchema = z
  .object({
    revision: z.number().int().positive(),
    expectedScooterUpdatedAt: z.iso.datetime(),
    eventType: z.enum(["handover", "return"]),
    data: rentalInspectionDataSchema,
  })
  .strict();
export type SaveRentalInspectionInput = z.infer<
  typeof saveRentalInspectionInputSchema
>;
export const rentalPaymentInputSchema = z
  .object({
    idempotencyKey: z.string().min(16).max(120),
    purpose: z.enum(["rent", "deposit"]),
    method: rentalPaymentMethodSchema,
    amountMinor: z.number().int().positive().max(2_147_483_647),
    receivedAt: z.iso.datetime(),
    evidenceReference: z.string().trim().min(1).max(1000),
  })
  .strict();
export type RentalPaymentInput = z.infer<typeof rentalPaymentInputSchema>;
export const rentalPaymentSchema = rentalPaymentInputSchema.extend({
  id: z.string(),
  rentalId: z.string(),
  status: z.enum(["confirmed", "refunded"]),
  confirmedByUserId: z.string(),
  coverageStartsAt: z.iso.datetime().nullable(),
  coverageEndsAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export const rentalInspectionSchema = z.object({
  id: z.string(),
  rentalId: z.string(),
  scooterId: z.string(),
  eventType: z.enum(["handover", "return"]),
  version: z.number().int().positive(),
  status: z.enum(["draft", "confirmed"]),
  dataSnapshot: rentalInspectionDataSchema,
  scooterUpdatedAt: z.iso.datetime(),
  inspectedByUserId: z.string(),
  confirmedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export const rentalReadinessSchema = z.object({
  ready: z.boolean(),
  issues: z.array(z.string()),
});
export const rentalQuoteQuerySchema = z
  .object({
    scooterId: z.string().min(1),
    personId: z.string().min(1).optional(),
    promotion: rentalPromotionSchema.optional(),
    rentalPaymentMethod: rentalPaymentMethodSchema.optional(),
    depositPaymentMethod: rentalPaymentMethodSchema.optional(),
  })
  .strict();

/** Unchecked controls stay unchecked; absence is never fabricated as a defect. */
export function inspectionReadinessIssues(
  data: RentalInspectionData,
  applicationSpeedLimitKmh: number | null,
): string[] {
  const issues: string[] = [];
  for (const key of [
    "speedometer",
    "brakes",
    "tyres",
    "lights",
    "horn",
    "mirrors",
  ] as const)
    if (data[key] !== "ok") issues.push(`inspection.${key}`);
  if (data.odometer === "not_checked" || data.odometer === "not_applicable")
    issues.push("inspection.odometer");
  for (const key of ["phoneStand", "chargingOutlet"] as const) {
    const equipment = data[key];
    if (
      equipment.presence === "unknown" ||
      (equipment.presence === "present" &&
        equipment.condition === "not_checked")
    )
      issues.push(`inspection.${key}`);
  }
  if (!data.keysCount) issues.push("inspection.keys");
  if (!data.operatorSpeedConfirmed) issues.push("inspection.speedConfirmation");
  if (
    applicationSpeedLimitKmh !== null &&
    (data.limiterCheck !== "ok" ||
      data.observedSpeedKmh === null ||
      !data.speedVerificationMethod)
  )
    issues.push("inspection.limiter");
  if (
    applicationSpeedLimitKmh !== null &&
    data.observedSpeedKmh != null &&
    data.observedSpeedKmh > applicationSpeedLimitKmh
  )
    issues.push("inspection.limiterExceeded");
  if (data.criticalDefect) issues.push("inspection.criticalDefect");
  for (const [key, value] of Object.entries(data.additionalChecks))
    if (value === "not_checked" || value === "defect")
      issues.push(`inspection.${key}`);
  for (const key of ["frontTyre", "rearTyre", "keys"] as const)
    if (data.additionalChecks[key] !== "ok") issues.push(`inspection.${key}`);
  if (data.helmetCount > 0 && data.additionalChecks.helmet !== "ok")
    issues.push("inspection.helmet");
  for (const [key, equipment] of Object.entries(data.additionalEquipment))
    if (
      equipment.presence === "unknown" ||
      (equipment.presence === "present" &&
        equipment.condition === "not_checked")
    )
      issues.push(`inspection.${key}`);
  return issues;
}
