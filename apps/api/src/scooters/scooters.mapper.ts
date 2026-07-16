import { v1 } from "@repo/api-shared";

import { toDateOnlyString } from "../common/dates/date-only";
import type { Scooter as ScooterRow } from "../generated/prisma/client";

export function toScooter(row: ScooterRow): v1.scooters.Scooter {
  return {
    id: row.id,
    vin: row.vin,
    brand: row.brand,
    model: row.model,
    color: row.color,
    manufactureYear: row.manufactureYear,
    powertrainType: row.powertrainType as v1.scooters.ScooterPowertrainType,
    engineCc: row.engineCc,
    powerKw: row.powerKw,
    purchasedOn: toDateOnlyString(row.purchasedOn)!,
    registrationType:
      row.registrationType as v1.scooters.ScooterRegistrationType,
    plateNumber: row.plateNumber,
    registeredOn: toDateOnlyString(row.registeredOn),
    registrationExpiresOn: toDateOnlyString(row.registrationExpiresOn),
    requiredDriverLicenseType:
      row.requiredDriverLicenseType as v1.scooters.ScooterRequiredDriverLicenseType,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
