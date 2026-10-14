import { civMetadataResponse } from "./civ-metadata";
import { v1 } from "@repo/api-shared";

import { toDateOnlyString } from "../common/dates/date-only";
import type {
  Scooter as ScooterRow,
  VehicleCivDocument,
  ScooterInsurancePolicy,
} from "../generated/prisma/client";

type ScooterRowWithBrand = ScooterRow & {
  insuranceAttention?: v1.scooters.InsuranceAttention | null;
  photos?: { id: string }[];
  problems?: { severity: v1.problems.Problem["severity"] }[];
  _count?: { problems: number };
  brand: { name: string; code: string };
  civDocument?: VehicleCivDocument | null;
  insurancePolicies?: ScooterInsurancePolicy[];
};

export function toScooter(row: ScooterRowWithBrand): v1.scooters.Scooter {
  return {
    ...(row.problems
      ? {
          problemSeverityCounts: {
            low: row.problems.filter((p) => p.severity === "low").length,
            moderate: row.problems.filter((p) => p.severity === "moderate")
              .length,
            high: row.problems.filter((p) => p.severity === "high").length,
            critical: row.problems.filter((p) => p.severity === "critical")
              .length,
            unknown: row.problems.filter((p) => p.severity === null).length,
          },
        }
      : {}),
    maintenanceHoldCount: row._count?.problems ?? 0,
    ...(row.photos
      ? {
          coverUrl: row.photos[0]
            ? v1.scooters.ROUTES.photos.content(row.id, row.photos[0].id)
            : null,
        }
      : {}),
    ...(row.insuranceAttention !== undefined
      ? { insuranceAttention: row.insuranceAttention }
      : {}),
    ...(row.insurancePolicies
      ? {
          insurancePolicies: row.insurancePolicies.map((policy) => ({
            id: policy.id,
            insuredName: policy.insuredName,
            validFrom: toDateOnlyString(policy.validFrom),
            validUntil: toDateOnlyString(policy.validUntil),
            premiumAmount: policy.premiumAmount?.toNumber() ?? null,
            currency: policy.currency,
            documentVin: policy.documentVin,
            vinReviewConfirmed: policy.vinReviewConfirmed,
            rawFields: v1.scooters.insuranceRawFieldsSchema.parse(
              policy.rawFields ?? {},
            ),
            createdAt: policy.createdAt.toISOString(),
            updatedAt: policy.updatedAt.toISOString(),
          })),
        }
      : {}),
    ...(row.civDocument === undefined
      ? {}
      : civMetadataResponse(row.civDocument)),
    maxAxle3MassKg: row.maxAxle3MassKg ?? null,
    maxAxle4MassKg: row.maxAxle4MassKg ?? null,
    maxAxle5MassKg: row.maxAxle5MassKg ?? null,
    brakedTrailerMassKg: row.brakedTrailerMassKg ?? null,
    unbrakedTrailerMassKg: row.unbrakedTrailerMassKg ?? null,
    couplingPointMassKg: row.couplingPointMassKg ?? null,
    standingCapacity: row.standingCapacity ?? null,
    noiseMeasurementRpm: row.noiseMeasurementRpm ?? null,
    vehicleClass: row.vehicleClass ?? null,
    driveType: row.driveType ?? null,
    stationaryNoiseDb: row.stationaryNoiseDb?.toNumber() ?? null,
    drivingNoiseDb: row.drivingNoiseDb?.toNumber() ?? null,
    co2EmissionsGKm: row.co2EmissionsGKm?.toNumber() ?? null,
    id: row.id,
    fleetNumber: row.fleetNumber,
    vin: row.vin,
    brandId: row.brandId,
    brand: row.brand.name,
    brandCode: row.brand.code,
    vehicleType: row.vehicleType,
    civNumber: row.civNumber,
    nationalEmissionsCode: row.nationalEmissionsCode,
    variant: row.variant,
    version: row.version,
    commercialName: row.commercialName,
    vehicleCategory: row.vehicleCategory,
    vehicleCategoryOther: row.vehicleCategoryOther,
    nationalCategory: row.nationalCategory,
    nationalCategoryOther: row.nationalCategoryOther,
    bodyType: row.bodyType,
    bodyTypeOther: row.bodyTypeOther,
    typeApprovalNumber: row.typeApprovalNumber,
    nationalRegistryNumber: row.nationalRegistryNumber,
    seatsCount: row.seatsCount,
    engineSerialNumber: row.engineSerialNumber,
    ratedEngineRpm: row.ratedEngineRpm,
    fuelType: row.fuelType,
    fuelTypeOther: row.fuelTypeOther,
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
    hasGps: row.hasGps,
    odometerWorking: row.odometerWorking,
    speedometerWorking: row.speedometerWorking,
    actualMaxSpeedKmh: row.actualMaxSpeedKmh,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
