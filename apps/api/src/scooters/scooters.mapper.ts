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
    cylinderCapacityCc: row.cylinderCapacityCc,
    purchasedOn: toDateOnlyString(row.purchasedOn)!,
    registrationStatus:
      row.registrationStatus as v1.scooters.ScooterRegistrationStatus,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
