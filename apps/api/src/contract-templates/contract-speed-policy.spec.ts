import { ConflictException } from "@nestjs/common";
import { assertPhysicalSpeedDeclarationSupported } from "./contract-speed-policy";

const observation = {
  limiterCheck: "ok" as const,
  speedVerificationMethod: "Independent calibrated instrument",
  observedSpeedKmh: 25,
};
const recorded = {
  limiterKind: "LIMITED",
  limiterKmh: 25,
  maxSpeedSource: "Retained CIV reference",
  configurationEvidence: "Retained physical equipment record",
};

describe("licence policy and physical contract evidence", () => {
  it.each([25, null] as const)(
    "does not invent physical equipment from application cap %s",
    (cap) => {
      try {
        assertPhysicalSpeedDeclarationSupported(
          {
            limiterKind: "UNKNOWN",
            limiterKmh: null,
            maxSpeedSource: null,
            configurationEvidence: null,
          },
          observation,
          cap,
        );
        throw new Error("Expected the physical declaration to be refused");
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toMatchObject({
          code: "CONTRACT_TEMPLATE_POLICY_DECLARATION_REQUIRED",
        });
      }
    },
  );
  it("allows an actually documented matching limiter with a recorded check", () => {
    expect(() =>
      assertPhysicalSpeedDeclarationSupported(recorded, observation, 25),
    ).not.toThrow();
  });
  it("allows the corrected AM cap with a corresponding recorded 45km/h check", () => {
    expect(() =>
      assertPhysicalSpeedDeclarationSupported(
        { ...recorded, limiterKmh: 45 },
        { ...observation, observedSpeedKmh: 45 },
        45,
      ),
    ).not.toThrow();
  });
  it("does not use a 25km/h application check to claim verification of a 45km/h limiter", () => {
    expect(() =>
      assertPhysicalSpeedDeclarationSupported(
        { ...recorded, limiterKmh: 45 },
        observation,
        25,
      ),
    ).toThrow(ConflictException);
  });
  it("does not interpret an uncapped policy as physical limiter verification", () => {
    expect(() =>
      assertPhysicalSpeedDeclarationSupported(recorded, observation, null),
    ).toThrow(ConflictException);
  });
  it.each([25, null] as const)(
    "preserves documented physical absence independently of application cap %s",
    (cap) => {
      expect(() =>
        assertPhysicalSpeedDeclarationSupported(
          { ...recorded, limiterKind: "NO_LIMITER", limiterKmh: null },
          { ...observation, limiterCheck: "not_applicable" },
          cap,
        ),
      ).not.toThrow();
    },
  );
});
