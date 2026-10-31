import { v1 } from "@repo/api-shared";
import type { Scooter } from "../generated/prisma/client";

/** Recorded instrument/equipment states prefill the draft; unknown controls stay unchecked until inspection. */
export function prefillRentalInspection(
  scooter: Pick<
    Scooter,
    | "currentMileageKm"
    | "hasPhoneStand"
    | "hasChargingOutlet"
    | "requiredLicenseCategory"
  > &
    Partial<Pick<Scooter, "odometerWorking" | "speedometerWorking">>,
): v1.rentals.RentalInspectionData {
  const equipment = (
    present: boolean | null,
  ): v1.rentals.RentalInspectionData["phoneStand"] => ({
    presence: present === null ? "unknown" : present ? "present" : "absent",
    condition: present === false ? "not_applicable" : "not_checked",
  });
  return {
    schemaVersion: 1,
    odometerDisplayedKm: scooter.currentMileageKm,
    odometer:
      scooter.odometerWorking === true
        ? "ok"
        : scooter.odometerWorking === false
          ? "defect"
          : "not_checked",
    speedometer:
      scooter.speedometerWorking === true
        ? "ok"
        : scooter.speedometerWorking === false
          ? "defect"
          : "not_checked",
    brakes: "not_checked",
    tyres: "not_checked",
    lights: "not_checked",
    horn: "not_checked",
    mirrors: "not_checked",
    phoneStand: equipment(scooter.hasPhoneStand),
    chargingOutlet: equipment(scooter.hasChargingOutlet),
    helmetCount: 0,
    keysCount: 0,
    fuelPercent: null,
    observedSpeedKmh: null,
    speedVerificationMethod: null,
    limiterCheck:
      v1.scooters.licenceSpeedLimitKmh(scooter.requiredLicenseCategory) === null
        ? "not_applicable"
        : "not_checked",
    operatorSpeedConfirmed: false,
    cosmeticNotes: "",
    mediaIds: [],
    criticalDefect: null,
    additionalChecks: {
      engine: "not_checked",
      electricStart: "not_checked",
      kickstart: "not_checked",
      batteryCharge: "not_checked",
      frontTyre: "not_checked",
      rearTyre: "not_checked",
      headlight: "not_checked",
      indicators: "not_checked",
      brakeLight: "not_checked",
      helmet: "not_checked",
      keys: "not_checked",
    },
    additionalEquipment: {
      topCase: equipment(null),
      luggageRack: equipment(null),
      antitheft: equipment(null),
    },
    technicalNotes: "",
    equipmentNotes: "",
  };
}

/** A broken instrument may show a number; it cannot replace the last known mileage. */
export function inspectionScooterChanges(
  data: v1.rentals.RentalInspectionData,
): Partial<
  Pick<
    Scooter,
    | "currentMileageKm"
    | "odometerWorking"
    | "speedometerWorking"
    | "hasPhoneStand"
    | "hasChargingOutlet"
  >
> {
  const working = (value: string) =>
    value === "ok" ? true : value === "defect" ? false : undefined;
  const presence = (value: string) =>
    value === "present" ? true : value === "absent" ? false : undefined;
  return {
    ...(data.odometer === "ok" && data.odometerDisplayedKm !== null
      ? { currentMileageKm: data.odometerDisplayedKm }
      : {}),
    odometerWorking: working(data.odometer),
    speedometerWorking: working(data.speedometer),
    hasPhoneStand: presence(data.phoneStand.presence),
    hasChargingOutlet: presence(data.chargingOutlet.presence),
  };
}

export function inspectionHasCriticalFinding(
  data: v1.rentals.RentalInspectionData,
): boolean {
  return (
    Boolean(data.criticalDefect) ||
    [
      data.speedometer,
      data.brakes,
      data.tyres,
      data.lights,
      data.horn,
      data.mirrors,
      data.limiterCheck,
      data.additionalChecks.engine,
      data.additionalChecks.frontTyre,
      data.additionalChecks.rearTyre,
      data.additionalChecks.headlight,
      data.additionalChecks.indicators,
      data.additionalChecks.brakeLight,
    ].includes("defect")
  );
}
