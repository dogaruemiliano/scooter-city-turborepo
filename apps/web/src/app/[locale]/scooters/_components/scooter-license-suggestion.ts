import { v1 } from "@repo/api-shared";

/** Document evidence for import review, independent of the form default. */
export function documentedLicenseSuggestion(
  maxSpeedKmh: string,
): "none" | undefined {
  return v1.vehicleCiv.parseCivNumber(maxSpeedKmh) === 25 ? "none" : undefined;
}
