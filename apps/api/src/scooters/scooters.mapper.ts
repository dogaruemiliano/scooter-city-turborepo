import { v1 } from "@repo/api-shared";

import { toDateOnlyString } from "../common/dates/date-only";
import type { Scooter as ScooterRow } from "../generated/prisma/client";

type ScooterRowWithBrand = ScooterRow & {
  brand: { name: string };
};

export function toScooter(row: ScooterRowWithBrand): v1.scooters.Scooter {
  return {
    id: row.id,
    vin: row.vin,
    brandId: row.brandId,
    brand: row.brand.name,
    variant: row.variant,
    version: row.version,
    commercialName: row.commercialName,
    vehicleCategory: row.vehicleCategory,
    nationalCategory: row.nationalCategory,
    bodyType: row.bodyType,
    typeApprovalNumber: row.typeApprovalNumber,
    nationalRegistryNumber: row.nationalRegistryNumber,
    seatsCount: row.seatsCount,
    engineSerialNumber: row.engineSerialNumber,
    ratedEngineRpm: row.ratedEngineRpm,
    fuelType: row.fuelType,
    propulsionSystem: row.propulsionSystem,
    electricMotorPowerKw: row.electricMotorPowerKw?.toNumber() ?? null,
    powerToWeightRatioKwKg: row.powerToWeightRatioKwKg?.toNumber() ?? null,
    maxSpeedKmh: row.maxSpeedKmh,
    emissionsStandard: row.emissionsStandard,
    curbWeightKg: row.curbWeightKg,
    actualWeightKg: row.actualWeightKg,
    maxTechnicallyPermissibleMassKg: row.maxTechnicallyPermissibleMassKg,
    maxTrainMassKg: row.maxTrainMassKg,
    maxAxle1MassKg: row.maxAxle1MassKg,
    maxAxle2MassKg: row.maxAxle2MassKg,
    axlesCount: row.axlesCount,
    lengthMm: row.lengthMm,
    widthMm: row.widthMm,
    heightMm: row.heightMm,
    wheelbaseMm: row.wheelbaseMm,
    frontTyreSpecification: row.frontTyreSpecification,
    rearTyreSpecification: row.rearTyreSpecification,
    frontSuspension: row.frontSuspension,
    rearSuspension: row.rearSuspension,
    fuelTankCapacityLiters: row.fuelTankCapacityLiters?.toNumber() ?? null,
    registrationCertificateNumber: row.registrationCertificateNumber,
    model: row.model,
    color: row.color,
    manufactureYear: row.manufactureYear,
    powertrainType: row.powertrainType,
    engineCode: row.engineCode,
    engineDisplacementCc: row.engineDisplacementCc,
    powerKw: row.powerKw?.toNumber() ?? null,
    registrationType: row.registrationType,
    registrationNumber: row.registrationNumber,
    registrationDate: toDateOnlyString(row.registrationDate),
    temporaryRegistrationExpiresAt: toDateOnlyString(
      row.temporaryRegistrationExpiresAt,
    ),
    requiredLicenseCategory: row.requiredLicenseCategory,
    currentMileageKm: row.currentMileageKm,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
