import { ConflictException } from "@nestjs/common";
import type { v1 } from "@repo/api-shared";

interface RecordedSpeedConfiguration {
  limiterKind: string;
  limiterKmh: number | null;
  maxSpeedSource: string | null;
  configurationEvidence: string | null;
}

/** Licence policy alone cannot substantiate the supplied templates' physical-limiter declarations. */
export function assertPhysicalSpeedDeclarationSupported(
  recorded: RecordedSpeedConfiguration,
  inspection: Pick<
    v1.rentals.RentalInspectionData,
    "limiterCheck" | "speedVerificationMethod" | "observedSpeedKmh"
  >,
  applicationSpeedLimitKmh: 25 | 45 | null,
): asserts recorded is RecordedSpeedConfiguration & {
  limiterKind: "LIMITED" | "NO_LIMITER";
  maxSpeedSource: string;
  configurationEvidence: string;
} {
  if (
    !["LIMITED", "NO_LIMITER"].includes(recorded.limiterKind) ||
    !recorded.maxSpeedSource?.trim() ||
    !recorded.configurationEvidence?.trim() ||
    (recorded.limiterKind === "LIMITED" &&
      (recorded.limiterKmh !== applicationSpeedLimitKmh ||
        inspection.limiterCheck !== "ok" ||
        !inspection.speedVerificationMethod?.trim() ||
        inspection.observedSpeedKmh === null))
  )
    throw new ConflictException({
      code: "CONTRACT_TEMPLATE_POLICY_DECLARATION_REQUIRED",
      message:
        "The current contract template requires an approved declaration for the licence-based speed policy; a corresponding physical limiter configuration is not recorded or verified.",
    });
}
