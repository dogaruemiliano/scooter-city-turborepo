import { dateOnlyToday } from "../common/common.schemas";
import type { Scooter } from "./scooters.schemas";

export type ScooterReadinessIssue =
  | "needsCiv"
  | "needsRegistration"
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
  if (scooter.rentalInsuranceStatus !== "active")
    issues.push("invalidInsurance");
  if (scooter.itpStatus !== "active" && scooter.itpStatus !== "expiring")
    issues.push("invalidItp");
  return issues;
}
