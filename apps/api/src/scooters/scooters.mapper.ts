import { civMetadataResponse } from "./civ-metadata";
import { v1 } from "@repo/api-shared";

import { toDateOnlyString } from "../common/dates/date-only";
import type {
  Scooter as ScooterRow,
  VehicleCivDocument,
  ScooterInsurancePolicy,
  ScooterItpInspection,
} from "../generated/prisma/client";

type ScooterRowWithBrand = ScooterRow & {
  insuranceAttention?: v1.scooters.InsuranceAttention | null;
  rentalInsuranceStatus?: v1.scooters.Scooter["rentalInsuranceStatus"];
  photos?: { id: string }[];
  documents?: {
    id?: string;
    type: string;
    extractedData: unknown;
    clientCopyAsset?: { deletedAt: Date | null } | null;
    insurancePolicy?: {
      validFrom: Date | null;
      validUntil: Date | null;
    } | null;
  }[];
  problems?: { difficulty: v1.problems.Problem["difficulty"] }[];
  _count?: { problems: number };
  brand: { name: string; code: string };
  civDocument?: VehicleCivDocument | null;
  insurancePolicies?: ScooterInsurancePolicy[];
  inspections?: ScooterItpInspection[];
};

export function toScooter(row: ScooterRowWithBrand): v1.scooters.Scooter {
  const itp = row.inspections
    ? v1.scooters.scooterItpSummary(
        row.inspections.map((entry) => ({
          inspectionDate: toDateOnlyString(entry.inspectionDate),
          effectiveDate: toDateOnlyString(entry.effectiveDate) ?? undefined,
          createdAt: entry.createdAt.toISOString(),
          validUntil: toDateOnlyString(entry.validUntil),
          result: v1.scooters.scooterItpResultSchema.parse(entry.result),
        })),
        undefined,
        toDateOnlyString(row.civDocument?.issuedAt ?? null),
      )
    : undefined;
  return {
    ...(row.documents
      ? {
          missingClientDocuments: v1.scooters.missingScooterClientDocuments(
            row.documents.map((document) => ({
              ...document,
              id: document.id ?? "",
              clientCopy:
                document.clientCopyAsset && !document.clientCopyAsset.deletedAt,
              validFrom: toDateOnlyString(
                document.insurancePolicy?.validFrom ??
                  row.inspections?.find(
                    (inspection) =>
                      inspection.cardDocumentId === document.id ||
                      inspection.certificateDocumentId === document.id,
                  )?.inspectionDate ??
                  null,
              ),
              validUntil: toDateOnlyString(
                document.insurancePolicy?.validUntil ??
                  row.inspections?.find(
                    (inspection) =>
                      inspection.cardDocumentId === document.id ||
                      inspection.certificateDocumentId === document.id,
                  )?.validUntil ??
                  null,
              ),
            })),
            Boolean(row.inspections?.length) ||
              !itp?.validUntil ||
              itp.status === "expired" ||
              itp.status === "failed" ||
              itp.status === "review",
          ),
        }
      : {}),
    ...(itp ? { itpStatus: itp.status, itpValidUntil: itp.validUntil } : {}),
    ...(row.problems
      ? {
          problemDifficultyCounts: {
            easy: row.problems.filter((p) => p.difficulty === "easy").length,
            medium: row.problems.filter((p) => p.difficulty === "medium")
              .length,
            hard: row.problems.filter((p) => p.difficulty === "hard").length,
            unknown: row.problems.filter((p) => p.difficulty === null).length,
          },
        }
      : {}),
    maintenanceHoldCount: row._count?.problems ?? 0,
    rentalInsuranceStatus:
      row.rentalInsuranceStatus ??
      (row.insurancePolicies
        ? v1.scooters.rentalInsuranceStatus(
            row.insurancePolicies.map((policy) => ({
              validFrom: toDateOnlyString(policy.validFrom),
              validUntil: toDateOnlyString(policy.validUntil),
            })),
          )
        : undefined),
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
    hasCivDocument:
      row.documents?.some(v1.scooters.hasScooterCivDocumentEvidence) ?? false,
    civAvailability: row.civAvailability ?? "unknown",
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
    commercialCategory: v1.scooters.scooterCommercialCategoryForLicense(
      row.requiredLicenseCategory,
    ),
    applicationSpeedLimitKmh: v1.scooters.licenceSpeedLimitKmh(
      row.requiredLicenseCategory,
    ),
    limiterKind: row.limiterKind as v1.scooters.Scooter["limiterKind"],
    limiterKmh: row.limiterKmh,
    maxSpeedSource: row.maxSpeedSource,
    configurationEvidence: row.configurationEvidence,
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
    fuelSystem: row.fuelSystem,
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
    hasPhoneStand: row.hasPhoneStand,
    hasChargingOutlet: row.hasChargingOutlet,
    odometerWorking: row.odometerWorking,
    speedometerWorking: row.speedometerWorking,
    actualMaxSpeedKmh: row.actualMaxSpeedKmh,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

/** Inventory summaries retain CIV metadata without returning the original document fields. */
export function toScooterListItem(
  row: ScooterRowWithBrand,
): v1.scooters.ScooterListItem {
  const item = toScooter(row);
  delete item.civRawFields;
  return item;
}
