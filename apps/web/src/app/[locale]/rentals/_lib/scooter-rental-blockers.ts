import type { ScooterSelectItem } from "@/components/ScooterSelect";

/** Only recorded eligibility is accepted; absent summaries do not imply readiness. */
export function scooterRentalBlockers(
  scooter: ScooterSelectItem,
  today: string,
) {
  const reasons: (
    | "registrationMissing"
    | "registrationExpired"
    | "insuranceMissing"
    | "insuranceExpired"
    | "insuranceUpcoming"
    | "insuranceReview"
    | "clientDocumentsMissing"
    | "itpInvalid"
    | "serviceHold"
    | "eligibilityUnknown"
  )[] = [];
  if (
    !scooter.registrationNumber?.trim() ||
    scooter.registrationType === "unregistered"
  )
    reasons.push("registrationMissing");
  else if (!scooter.registrationType) reasons.push("eligibilityUnknown");
  else if (scooter.registrationType === "temporary") {
    if (!scooter.temporaryRegistrationExpiresAt)
      reasons.push("eligibilityUnknown");
    else if (scooter.temporaryRegistrationExpiresAt.slice(0, 10) < today)
      reasons.push("registrationExpired");
  }
  switch (scooter.rentalInsuranceStatus) {
    case "active":
      break;
    case "missing":
      reasons.push("insuranceMissing");
      break;
    case "expired":
      reasons.push("insuranceExpired");
      break;
    case "upcoming":
      reasons.push("insuranceUpcoming");
      break;
    case "review":
      reasons.push("insuranceReview");
      break;
    default:
      if (!reasons.includes("eligibilityUnknown"))
        reasons.push("eligibilityUnknown");
  }
  if (scooter.missingClientDocuments?.length)
    reasons.push("clientDocumentsMissing");
  if (scooter.itpStatus && !["active", "expiring"].includes(scooter.itpStatus))
    reasons.push("itpInvalid");
  if (scooter.maintenanceHoldCount === undefined) {
    if (!reasons.includes("eligibilityUnknown"))
      reasons.push("eligibilityUnknown");
  } else if (scooter.maintenanceHoldCount > 0) reasons.push("serviceHold");
  return reasons;
}
