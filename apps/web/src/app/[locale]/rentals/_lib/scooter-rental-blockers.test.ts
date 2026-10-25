import { expect, it } from "vitest";
import { scooterRentalBlockers } from "./scooter-rental-blockers";
import type { ScooterSelectItem } from "@/components/ScooterSelect";

const eligible: ScooterSelectItem = {
  id: "s",
  fleetNumber: 7,
  brandCode: "HON",
  brand: "Honda",
  model: "Vision",
  registrationNumber: "B123",
  registrationType: "national",
  rentalInsuranceStatus: "active",
  maintenanceHoldCount: 0,
};
it("allows recorded registration, active insurance and no service hold", () => {
  expect(scooterRentalBlockers(eligible, "2026-10-24")).toEqual([]);
});
it.each([
  [
    { registrationType: "unregistered", registrationNumber: null },
    "registrationMissing",
  ],
  [
    {
      registrationType: "temporary",
      temporaryRegistrationExpiresAt: "2026-10-23",
    },
    "registrationExpired",
  ],
  [{ rentalInsuranceStatus: "missing" }, "insuranceMissing"],
  [{ rentalInsuranceStatus: "expired" }, "insuranceExpired"],
  [{ rentalInsuranceStatus: "upcoming" }, "insuranceUpcoming"],
  [{ rentalInsuranceStatus: "review" }, "insuranceReview"],
  [{ maintenanceHoldCount: 1 }, "serviceHold"],
  [{ rentalInsuranceStatus: undefined }, "eligibilityUnknown"],
] as const)("explains the blocker %s", (patch, reason) => {
  expect(
    scooterRentalBlockers({ ...eligible, ...patch }, "2026-10-24"),
  ).toContain(reason);
});
it("reports every blocker instead of hiding later ones", () => {
  expect(
    scooterRentalBlockers(
      {
        ...eligible,
        registrationNumber: null,
        rentalInsuranceStatus: "missing",
        maintenanceHoldCount: 2,
      },
      "2026-10-24",
    ),
  ).toEqual(["registrationMissing", "insuranceMissing", "serviceHold"]);
});
