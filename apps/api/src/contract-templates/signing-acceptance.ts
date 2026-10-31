import { ConflictException } from "@nestjs/common";
import type { PackageSnapshot } from "./contract-data";

/** The displayed statement and stored act share this resolver and the pinned package snapshot. */
export function documentAcceptanceText(
  snapshot: PackageSnapshot,
  type: string,
): string {
  if (
    snapshot.acceptanceTexts &&
    type in snapshot.acceptanceTexts &&
    type !== "LIMITER"
  )
    return snapshot.acceptanceTexts[
      type as Exclude<
        keyof NonNullable<PackageSnapshot["acceptanceTexts"]>,
        "LIMITER"
      >
    ];
  switch (type) {
    case "RENTAL_AGREEMENT":
      return snapshot.companySettings.signingAcceptanceText;
    case "GDPR_NOTICE":
      return "Confirm că am primit și am luat cunoștință de informare.";
    case "TECHNICAL_HANDOVER":
      return "Confirm starea tehnică, echipamentele și datele consemnate în anexa tehnică prezentată.";
    case "PROMOTION_ADDENDUM":
      return "Confirm că am parcurs și accept condițiile promoționale consemnate în actul adițional prezentat.";
    default:
      throw new ConflictException(
        "No approved acceptance is defined for this document type",
      );
  }
}

export function limiterAcceptanceText(
  snapshot: PackageSnapshot,
): string | null {
  if (snapshot.limiterKind !== "LIMITED") return null;
  if (snapshot.acceptanceTexts?.LIMITER)
    return snapshot.acceptanceTexts.LIMITER;
  const text = snapshot.display.speedDeclaration;
  if (!text?.trim())
    throw new ConflictException("The pinned limiter declaration is missing");
  return text;
}

export function freezePackageAcceptances(
  snapshot: PackageSnapshot,
): NonNullable<PackageSnapshot["acceptanceTexts"]> {
  return {
    RENTAL_AGREEMENT: documentAcceptanceText(snapshot, "RENTAL_AGREEMENT"),
    GDPR_NOTICE: documentAcceptanceText(snapshot, "GDPR_NOTICE"),
    TECHNICAL_HANDOVER: documentAcceptanceText(snapshot, "TECHNICAL_HANDOVER"),
    PROMOTION_ADDENDUM: documentAcceptanceText(snapshot, "PROMOTION_ADDENDUM"),
    LIMITER: limiterAcceptanceText(snapshot),
  };
}
