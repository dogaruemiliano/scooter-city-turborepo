import { dateOnlyToday } from "../common/common.schemas";
import type { Scooter } from "./scooters.schemas";

export type ScooterReadinessIssue =
  | "needsCiv"
  | "needsRegistration"
  | "needsInsurance"
  | "expiredInsurance"
  | "upcomingInsurance"
  | "needsItp"
  | "expiredItp"
  | "failedItp"
  | "invalidInsurance"
  | "invalidItp";

/** Prerequisites are sequential; insurance and ITP are checked together. */
export function scooterReadinessIssues(
  scooter: Pick<
    Scooter,
    | "hasCivDocument"
    | "registrationType"
    | "registrationNumber"
    | "temporaryRegistrationExpiresAt"
    | "rentalInsuranceStatus"
    | "itpStatus"
  >,
  today = dateOnlyToday(),
): ScooterReadinessIssue[] {
  if (!scooter.hasCivDocument) return ["needsCiv"];
  if (
    scooter.registrationType === "unregistered" ||
    !scooter.registrationNumber?.trim() ||
    (scooter.registrationType === "temporary" &&
      (!scooter.temporaryRegistrationExpiresAt ||
        scooter.temporaryRegistrationExpiresAt.slice(0, 10) < today))
  )
    return ["needsRegistration"];
  const issues: ScooterReadinessIssue[] = [];
  switch (scooter.rentalInsuranceStatus) {
    case "active":
      break;
    case "expired":
      issues.push("expiredInsurance");
      break;
    case "upcoming":
      issues.push("upcomingInsurance");
      break;
    case "review":
      issues.push("invalidInsurance");
      break;
    default:
      issues.push("needsInsurance");
  }
  switch (scooter.itpStatus) {
    case "active":
    case "expiring":
      break;
    case "expired":
      issues.push("expiredItp");
      break;
    case "failed":
      issues.push("failedItp");
      break;
    case "review":
      issues.push("invalidItp");
      break;
    default:
      issues.push("needsItp");
  }
  return issues;
}
