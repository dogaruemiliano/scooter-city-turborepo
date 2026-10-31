import { z } from "zod";
import type { ScooterRequiredDriverLicenseType } from "./scooters.constants";

/** Application policy selected by the operator; this does not assert physical limiter equipment. */
export function licenceSpeedLimitKmh(
  category: ScooterRequiredDriverLicenseType,
): 25 | 45 | null {
  return category === "none" ? 25 : category === "AM" ? 45 : null;
}

/** Price policy is derived from the same licence selection, independently of CIV construction speed. */
export function scooterCommercialCategoryForLicense(
  category: ScooterRequiredDriverLicenseType,
): "without_license" | "with_license" {
  return category === "none" ? "without_license" : "with_license";
}

/** Documented construction speed, limiter configuration and measured speed are independent. */
export const scooterSpeedConfigurationSchema = z
  .object({
    limiterKind: z.enum(["LIMITED", "NO_LIMITER", "UNKNOWN"]),
    maxSpeedKmh: z.number().int().positive().nullable(),
    limiterKmh: z.number().int().positive().max(300).nullable(),
    maxSpeedSource: z.string().trim().min(1).nullable(),
    configurationEvidence: z.string().trim().min(1).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.limiterKind === "UNKNOWN") return;
    for (const key of [
      "maxSpeedKmh",
      "maxSpeedSource",
      "configurationEvidence",
    ] as const)
      if (value[key] === null)
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Documented configuration is required",
        });
    if (value.limiterKind === "NO_LIMITER" && value.limiterKmh !== null)
      ctx.addIssue({
        code: "custom",
        path: ["limiterKmh"],
        message: "No limiter must not have a threshold",
      });
    if (
      value.limiterKind === "LIMITED" &&
      (value.limiterKmh === null ||
        value.maxSpeedKmh === null ||
        value.limiterKmh > value.maxSpeedKmh)
    )
      ctx.addIssue({
        code: "custom",
        path: ["limiterKmh"],
        message: "Limiter threshold must not exceed constructive speed",
      });
  });
