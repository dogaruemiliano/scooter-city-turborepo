import { v1 } from "@repo/api-shared";
import { toScooter } from "./scooters.mapper";

describe("licence-selected application policy", () => {
  it.each(v1.scooters.SCOOTER_REQUIRED_DRIVER_LICENSE_TYPES)(
    "derives cap and price for %s independently of physical configuration",
    (category) => {
      const expectedCap =
        category === "none" ? 25 : category === "AM" ? 45 : null;
      const expectedPrice =
        category === "none" ? "without_license" : "with_license";
      expect(v1.scooters.licenceSpeedLimitKmh(category)).toBe(expectedCap);
      expect(v1.scooters.scooterCommercialCategoryForLicense(category)).toBe(
        expectedPrice,
      );
      const row = {
        id: "scooter",
        brand: { name: "Honda", code: "HON" },
        createdAt: new Date(),
        updatedAt: new Date(),
        requiredLicenseCategory: category,
        commercialCategory:
          category === "none" ? "with_license" : "without_license",
        maxSpeedKmh: 60,
        limiterKind: "UNKNOWN",
        limiterKmh: null,
        maxSpeedSource: null,
        configurationEvidence: null,
      } as unknown as Parameters<typeof toScooter>[0];
      expect(toScooter(row)).toMatchObject({
        applicationSpeedLimitKmh: expectedCap,
        commercialCategory: expectedPrice,
        maxSpeedKmh: 60,
        limiterKind: "UNKNOWN",
        limiterKmh: null,
        maxSpeedSource: null,
        configurationEvidence: null,
      });
      expect(row.limiterKind).toBe("UNKNOWN");
    },
  );
  it.each([
    "commercialCategory",
    "limiterKind",
    "limiterKmh",
    "maxSpeedSource",
    "configurationEvidence",
    "speedConfigurationChangeReason",
  ])("rejects removed manual override %s", (field) => {
    expect(
      v1.scooters.updateScooterInputSchema.safeParse({
        [field]: field === "limiterKmh" ? 45 : "manual override",
      }).success,
    ).toBe(false);
  });
  it("allows licence and independent CIV speed editing without manual evidence fields", () => {
    expect(
      v1.scooters.updateScooterInputSchema.safeParse({
        requiredLicenseCategory: "AM",
        maxSpeedKmh: 60,
      }).success,
    ).toBe(true);
    expect(
      v1.scooters.updateScooterInputSchema.safeParse({
        registrationType: "unregistered",
        requiredLicenseCategory: "A1",
      }).success,
    ).toBe(true);
  });
});
