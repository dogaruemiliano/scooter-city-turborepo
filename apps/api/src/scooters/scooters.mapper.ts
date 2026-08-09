import { v1 } from "@repo/api-shared";

import { toDateOnlyString } from "../common/dates/date-only";
import type { Prisma, Scooter as ScooterRow } from "../generated/prisma/client";

type ScooterRowWithBrand = ScooterRow & {
  brand: { name: string };
  purchaseAllocation: {
    allocatedGrossAmount: Prisma.Decimal;
    expense: { occurredOn: Date; currency: string };
  } | null;
};

export function toScooter(row: ScooterRowWithBrand): v1.scooters.Scooter {
  return {
    id: row.id,
    vin: row.vin,
    brandId: row.brandId,
    brand: row.brand.name,
    model: row.model,
    color: row.color,
    manufactureYear: row.manufactureYear,
    powertrainType: row.powertrainType as v1.scooters.ScooterPowertrainType,
    engineType: row.engineType,
    engineCc: row.engineCc,
    powerKw: row.powerKw,
    purchasedOn: row.purchaseAllocation
      ? toDateOnlyString(row.purchaseAllocation.expense.occurredOn)
      : null,
    purchasePrice: row.purchaseAllocation
      ? row.purchaseAllocation.allocatedGrossAmount.toFixed(2)
      : null,
    purchaseCurrency: row.purchaseAllocation?.expense.currency ?? null,
    registrationType:
      row.registrationType as v1.scooters.ScooterRegistrationType,
    plateNumber: row.plateNumber,
    registeredOn: toDateOnlyString(row.registeredOn),
    registrationExpiresOn: toDateOnlyString(row.registrationExpiresOn),
    requiredDriverLicenseType:
      row.requiredDriverLicenseType as v1.scooters.ScooterRequiredDriverLicenseType,
    currentMileageKm: row.currentMileageKm,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export function toScooterListItem(
  row: ScooterRowWithBrand,
  attentionSummary: v1.maintenance.ScooterMaintenanceAttentionSummary,
): v1.scooters.ScooterListItem {
  return {
    ...toScooter(row),
    attentionSummary,
  };
}
