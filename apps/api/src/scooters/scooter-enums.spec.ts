import { v1 } from "@repo/api-shared";
import {
  ScooterDocumentType,
  DrivingLicenseCategory,
  ScooterFuelType,
  ScooterUseCategory,
  ScooterBodyType,
  ScooterVehicleCategory,
  PowertrainType,
  ScooterRegistrationType,
} from "../generated/prisma/enums";

describe("Scooter API and database enums", () => {
  it.each([
    ["document", v1.scooters.SCOOTER_DOCUMENT_TYPES, ScooterDocumentType],
    ["fuel", v1.scooters.SCOOTER_CIV_OPTIONS.fuelType, ScooterFuelType],
    [
      "use",
      v1.scooters.SCOOTER_CIV_OPTIONS.nationalCategory,
      ScooterUseCategory,
    ],
    ["body", v1.scooters.SCOOTER_CIV_OPTIONS.bodyType, ScooterBodyType],
    [
      "category",
      v1.scooters.SCOOTER_CIV_OPTIONS.vehicleCategory,
      ScooterVehicleCategory,
    ],
    ["powertrain", v1.scooters.SCOOTER_POWERTRAIN_TYPES, PowertrainType],
    [
      "registration",
      v1.scooters.SCOOTER_REGISTRATION_TYPES,
      ScooterRegistrationType,
    ],
    [
      "license",
      v1.scooters.SCOOTER_REQUIRED_DRIVER_LICENSE_TYPES,
      DrivingLicenseCategory,
    ],
  ])("keeps %s options aligned", (_name, options, databaseEnum) => {
    expect([...options].sort()).toEqual(Object.values(databaseEnum).sort());
  });
});
