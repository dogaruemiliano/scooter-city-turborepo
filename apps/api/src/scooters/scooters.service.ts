import { activeMaintenanceHoldWhere } from "../problems/maintenance-hold";
import { writeScooterItpValidity } from "./scooter-itp-validity";
import {
  resolveInsuranceDateSources,
  removeInsurancePolicies,
  writeInsurancePolicies,
} from "./scooter-insurance";
import { CivVocabularyService } from "./civ-vocabulary.service";
import { civMetadataWrite } from "./civ-metadata";
import {
  civAvailabilityWrite,
  hasAttachedCivEvidence,
} from "./civ-availability";
import { ScooterDocumentsService } from "./scooter-documents.service";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { toDateOnlyDate, toDateOnlyString } from "../common/dates/date-only";
import type { Prisma, Scooter } from "../generated/prisma/client";
import { Prisma as PrismaRuntime } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { editorSaveFingerprint } from "../scooter-document-jobs/document-job-lifecycle";
import { ScooterPhotosService } from "./scooter-photos.service";

const galleryCoverPhotos = {
  where: { deletedAt: null, type: "GALLERY_COVER", asset: { deletedAt: null } },
  select: { id: true },
  take: 1,
} satisfies Prisma.Scooter$photosArgs;

const maintenanceCount = {
  select: { problems: { where: activeMaintenanceHoldWhere } },
} as const;

export const scooterInclude = {
  _count: maintenanceCount,
  photos: galleryCoverPhotos,
  brand: true,
  documents: {
    where: { deletedAt: null, asset: { deletedAt: null } },
    select: {
      id: true,
      type: true,
      extractedData: true,
      clientCopyAsset: { select: { deletedAt: true } },
      insurancePolicy: { select: { validFrom: true, validUntil: true } },
    },
  },
  civDocument: true,
  inspections: {
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: 1,
  },
  insurancePolicies: {
    where: { deletedAt: null },
    orderBy: [{ validUntil: "desc" }, { id: "asc" }],
  },
} satisfies Prisma.ScooterInclude;

const scooterListInclude = {
  civDocument: true,
  problems: {
    where: {
      status: { in: ["open", "in_progress"] },
    },
    select: { difficulty: true },
  },
  _count: maintenanceCount,
  photos: galleryCoverPhotos,
  brand: true,
  documents: {
    where: { deletedAt: null, asset: { deletedAt: null } },
    select: {
      id: true,
      type: true,
      extractedData: true,
      clientCopyAsset: { select: { deletedAt: true } },
      insurancePolicy: { select: { validFrom: true, validUntil: true } },
    },
  },
  insurancePolicies: {
    where: { deletedAt: null },
    select: { validFrom: true, validUntil: true },
  },
  inspections: {
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: 1,
  },
} satisfies Prisma.ScooterInclude;

function toScooterListRow({
  insurancePolicies,
  ...scooter
}: Prisma.ScooterGetPayload<{
  include: typeof scooterListInclude;
}>): ScooterWithBrand {
  return {
    ...scooter,
    // No warning can also mean no policy; rental readiness must distinguish it.
    rentalInsuranceStatus: v1.scooters.rentalInsuranceStatus(
      insurancePolicies.map((policy) => ({
        validFrom: toDateOnlyString(policy.validFrom),
        validUntil: toDateOnlyString(policy.validUntil),
      })),
    ),
    insuranceAttention: v1.scooters.insuranceAttention(
      insurancePolicies.map((policy) => ({
        validFrom: toDateOnlyString(policy.validFrom),
        validUntil: toDateOnlyString(policy.validUntil),
      })),
    ),
  };
}

type ScooterWithBrand = Scooter & {
  insuranceAttention?: v1.scooters.InsuranceAttention | null;
  rentalInsuranceStatus?: v1.scooters.Scooter["rentalInsuranceStatus"];
  brand: { name: string; code: string };
};

interface SearchIdRow {
  id: string;
}

interface SearchCountRow {
  total: number;
}

const SCOOTER_VIN_CONFLICT_CODE = "SCOOTER_VIN_CONFLICT";
const SCOOTER_PLATE_CONFLICT_CODE = "SCOOTER_PLATE_CONFLICT";

interface RegistrationState {
  registrationType: v1.scooters.ScooterRegistrationType;
  registrationNumber: string | null;
  registrationDate: string | null;
  temporaryRegistrationExpiresAt: string | null;
  requiredLicenseCategory: v1.scooters.ScooterRequiredDriverLicenseType;
}

@Injectable()
export class ScootersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: ScooterDocumentsService,
    private readonly civVocabulary: CivVocabularyService,
    private readonly photos: ScooterPhotosService,
  ) {}

  async nextFleetNumber() {
    const counter = await this.prisma.scooterFleetCounter.findUniqueOrThrow({
      where: { id: 1 },
    });
    const next = counter.lastNumber + 1;
    return { fleetNumber: next <= 2_147_483_647 ? next : null };
  }

  private async allocateFleetNumber(
    tx: Prisma.TransactionClient,
    requested?: number,
  ) {
    // Even a manual allocation locks the same counter row as automatic creation.
    // Keep this lock until the scooter and its attachments have committed.
    const counter = await tx.scooterFleetCounter.update({
      where: { id: 1 },
      data: { lastNumber: { increment: 0 } },
    });
    if (
      requested !== undefined &&
      (await tx.scooter.findUnique({
        where: { fleetNumber: requested },
        select: { id: true },
      }))
    ) {
      throw new ConflictException({
        code: "SCOOTER_FLEET_NUMBER_CONFLICT",
        message: "Scooter internal number already exists",
        details: { field: "fleetNumber" },
      });
    }
    const fleetNumber = requested ?? counter.lastNumber + 1;
    if (fleetNumber > 2_147_483_647)
      throw new ConflictException({
        code: "SCOOTER_FLEET_NUMBER_EXHAUSTED",
        message:
          "Automatic fleet numbering is exhausted; choose an unused internal number.",
        details: { field: "fleetNumber" },
      });
    if (fleetNumber > counter.lastNumber)
      await tx.scooterFleetCounter.update({
        where: { id: 1 },
        data: { lastNumber: fleetNumber },
      });
    return fleetNumber;
  }

  async create(
    input: v1.scooters.CreateScooterInput,
    userId?: string,
  ): Promise<ScooterWithBrand> {
    this.assertValidPowertrain(input.powertrainType, input);

    try {
      const replay = await this.completedEditorSave(input, userId);
      if (replay) return replay;
      const data = this.toCreateData(input);
      await this.assertActivePlateAvailable(data.registrationNumberNormalized);

      const prepared = await this.documents.prepare(
        input.documentDrafts,
        userId,
      );
      const preparedPhotos = await this.photos.prepareDrafts(
        input.photoDrafts,
        userId,
      );
      return await this.prisma.$transaction(async (tx) => {
        const fleetNumber = await this.allocateFleetNumber(
          tx,
          input.fleetNumber,
        );
        const scooter = await tx.scooter.create({
          data: { ...data, fleetNumber },
          include: scooterInclude,
        });
        const insuranceRevisions = input.insurancePolicies?.length
          ? await writeInsurancePolicies(
              tx,
              scooter.id,
              scooter.vin,
              input.insurancePolicies,
            )
          : [];
        await this.documents.apply(
          tx,
          scooter.id,
          prepared,
          [],
          userId,
          [],
          input.sessionId,
          editorSaveFingerprint(input),
          scooter.vin,
        );
        await resolveInsuranceDateSources(
          tx,
          scooter.id,
          scooter.vin,
          insuranceRevisions,
        );
        await writeScooterItpValidity(
          tx,
          scooter.id,
          input.itpValidUntil,
          Boolean(input.documentDrafts?.length),
        );
        await this.civVocabulary.remember(tx, input);
        await this.photos.applyDrafts(tx, scooter.id, preparedPhotos, userId);
        return input.insurancePolicies?.length ||
          preparedPhotos.length ||
          input.itpValidUntil !== undefined ||
          input.documentDrafts?.length
          ? tx.scooter.findUniqueOrThrow({
              where: { id: scooter.id },
              include: scooterInclude,
            })
          : scooter;
      });
    } catch (error) {
      const replay = await this.completedEditorSave(input, userId);
      if (replay) return replay;
      this.handleWriteError(error);
    }
  }

  async list(query: v1.scooters.ListScootersQuery): Promise<{
    items: ScooterWithBrand[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    if (query.search) {
      return this.search(query);
    }

    const where = this.toListWhere(query);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.scooter.count({ where }),
      this.prisma.scooter.findMany({
        where,
        include: scooterListInclude,
        orderBy: this.toScooterOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: items.map(toScooterListRow),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  private async search(query: v1.scooters.ListScootersQuery): Promise<{
    items: ScooterWithBrand[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const cte = this.toSearchCte(query);
    const [countRows, idRows] = await this.prisma.$transaction([
      this.prisma.$queryRaw<SearchCountRow[]>(PrismaRuntime.sql`
        ${cte}
        SELECT count(*)::int AS total
        FROM scored
      `),
      this.prisma.$queryRaw<SearchIdRow[]>(PrismaRuntime.sql`
        ${cte}
        SELECT id
        FROM scored
        ORDER BY ${this.toSearchOrderBy(query)}
        OFFSET ${(query.page - 1) * query.pageSize}
        LIMIT ${query.pageSize}
      `),
    ]);

    const ids = idRows.map((row) => row.id);
    if (ids.length === 0) {
      return {
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        total: countRows[0]?.total ?? 0,
      };
    }

    const order = new Map(ids.map((id, index) => [id, index]));
    const items = await this.prisma.scooter.findMany({
      where: { id: { in: ids } },
      include: scooterListInclude,
    });
    items.sort((first, second) => order.get(first.id)! - order.get(second.id)!);

    return {
      items: items.map(toScooterListRow),
      page: query.page,
      pageSize: query.pageSize,
      total: countRows[0]?.total ?? 0,
    };
  }

  async findActiveById(id: string): Promise<ScooterWithBrand | null> {
    return this.prisma.scooter.findFirst({
      where: { id, deletedAt: null },
      include: scooterInclude,
    });
  }

  async update(
    id: string,
    input: v1.scooters.UpdateScooterInput,
    userId?: string,
  ): Promise<ScooterWithBrand> {
    try {
      const replay = await this.completedEditorSave(input, userId, id);
      if (replay) return replay;
      const existing = await this.prisma.scooter.findFirst({
        where: { id, deletedAt: null },
        include: { civDocument: true },
      });
      if (!existing) {
        throw new NotFoundException("Scooter not found");
      }

      const nextPowertrainType =
        input.powertrainType ?? existing.powertrainType;
      const changingPowertrain = nextPowertrainType !== existing.powertrainType;
      this.assertValidPowertrain(
        nextPowertrainType,
        changingPowertrain ? { ...existing, ...input } : input,
      );
      for (const field of v1.scooters.SCOOTER_CIV_FIELDS) {
        const otherField = `${field}Other` as const;
        if (input[field] === undefined && input[otherField] === undefined)
          continue;
        const next =
          input[field] === undefined ? existing[field] : input[field];
        const text =
          input[otherField] === undefined
            ? existing[otherField]
            : input[otherField];
        if ((next === "other" && !text) || (next !== "other" && text != null)) {
          throw new BadRequestException({
            message: "The CIV selection and custom value must match.",
            details: { field: otherField },
          });
        }
      }
      const data = this.toUpdateData(input, existing);
      await this.assertActivePlateAvailable(
        typeof data.registrationNumberNormalized === "string"
          ? data.registrationNumberNormalized
          : null,
        id,
      );

      const prepared = await this.documents.prepare(
        input.documentDrafts,
        userId,
      );
      return await this.prisma.$transaction(async (tx) => {
        if (input.expectedUpdatedAt) {
          // Compare after locking the parent, shared with document mutations.
          const rows = await tx.$queryRaw<{ updatedAt: Date }[]>`
            SELECT "updatedAt" FROM "Scooter"
            WHERE id = ${id} AND "deletedAt" IS NULL FOR UPDATE
          `;
          if (!rows.length) throw new NotFoundException("Scooter not found");
          if (
            rows[0].updatedAt.getTime() !==
            new Date(input.expectedUpdatedAt).getTime()
          )
            throw new ConflictException({
              code: "SCOOTER_UPDATE_CONFLICT",
              message:
                "The scooter changed since this editor was opened. Reload before saving.",
            });
        }
        if (
          input.fleetNumber !== undefined &&
          input.fleetNumber !== existing.fleetNumber
        )
          data.fleetNumber = await this.allocateFleetNumber(
            tx,
            input.fleetNumber,
          );
        const scooter = await tx.scooter.update({
          where: { id, deletedAt: null },
          data: { ...data, updatedAt: new Date() },
          include: scooterInclude,
        });
        if (input.civAvailability === "not_issued") {
          // Recheck after locking/updating the parent; concurrent document writes
          // take this same lock before attachment.
          civAvailabilityWrite(input, scooter);
          const remainingDocuments = await tx.scooterDocument.findMany({
            where: {
              scooterId: id,
              deletedAt: null,
              asset: { deletedAt: null },
              ...(input.removedDocumentIds?.length
                ? { id: { notIn: input.removedDocumentIds } }
                : {}),
            },
            select: { id: true, type: true, extractedData: true },
          });
          if (
            hasAttachedCivEvidence(
              remainingDocuments,
              input.documentExtractions,
            )
          )
            throw new BadRequestException({
              code: "SCOOTER_CIV_AVAILABILITY_CONFLICT",
              message:
                "A scooter with an attached CIV cannot be marked as CIV not issued.",
              details: { field: "civAvailability" },
            });
        }
        const insuranceRevisions =
          input.insurancePolicies?.length || input.vin !== undefined
            ? await writeInsurancePolicies(
                tx,
                id,
                scooter.vin,
                input.insurancePolicies,
              )
            : [];
        await removeInsurancePolicies(tx, id, input.removedInsurancePolicyIds);
        await this.documents.apply(
          tx,
          id,
          prepared,
          input.removedDocumentIds,
          userId,
          input.documentExtractions,
          input.sessionId,
          editorSaveFingerprint(input),
          scooter.vin,
        );
        await resolveInsuranceDateSources(
          tx,
          scooter.id,
          scooter.vin,
          insuranceRevisions,
        );
        await writeScooterItpValidity(
          tx,
          scooter.id,
          input.itpValidUntil,
          Boolean(
            input.documentDrafts?.length || input.documentExtractions?.length,
          ),
        );
        await this.civVocabulary.remember(tx, input);
        return input.insurancePolicies?.length ||
          input.removedInsurancePolicyIds?.length ||
          input.itpValidUntil !== undefined ||
          input.documentDrafts?.length ||
          input.documentExtractions?.length
          ? tx.scooter.findUniqueOrThrow({
              where: { id: scooter.id },
              include: scooterInclude,
            })
          : scooter;
      });
    } catch (error) {
      const replay = await this.completedEditorSave(input, userId, id);
      if (replay) return replay;
      this.handleWriteError(error);
    }
  }

  private async completedEditorSave(
    input: { sessionId?: string },
    userId?: string,
    scooterId?: string,
  ): Promise<ScooterWithBrand | null> {
    if (!input.sessionId || !userId) return null;
    const session = await this.prisma.scooterDocumentEditorSession.findFirst({
      where: { id: input.sessionId, userId },
    });
    if (!session?.scooterId || !session.saveFingerprint) return null;
    if (
      session.saveFingerprint !== editorSaveFingerprint(input) ||
      (scooterId && session.scooterId !== scooterId)
    )
      throw new BadRequestException(
        "This editor session already saved a different request.",
      );
    const scooter = await this.findActiveById(session.scooterId);
    if (!scooter)
      throw new NotFoundException("Previously saved scooter is unavailable.");
    return scooter;
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.prisma.scooter.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException("Scooter not found");
    }

    await this.prisma.scooter.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private toCreateData(
    input: v1.scooters.CreateScooterInput,
  ): Omit<Prisma.ScooterCreateInput, "fleetNumber"> {
    const civData = civMetadataWrite(input);
    return {
      maxAxle3MassKg: input.maxAxle3MassKg,
      maxAxle4MassKg: input.maxAxle4MassKg,
      maxAxle5MassKg: input.maxAxle5MassKg,
      brakedTrailerMassKg: input.brakedTrailerMassKg,
      unbrakedTrailerMassKg: input.unbrakedTrailerMassKg,
      couplingPointMassKg: input.couplingPointMassKg,
      standingCapacity: input.standingCapacity,
      noiseMeasurementRpm: input.noiseMeasurementRpm,
      stationaryNoiseDb: input.stationaryNoiseDb,
      drivingNoiseDb: input.drivingNoiseDb,
      co2EmissionsGKm: input.co2EmissionsGKm,
      vehicleClass: input.vehicleClass,
      driveType: input.driveType,
      civDocument: civData ? { create: civData } : undefined,
      vin: input.vin,
      brand: { connect: { id: input.brandId } },
      vehicleType: input.vehicleType,
      civNumber: input.civNumber,
      civAvailability: civAvailabilityWrite(input),
      nationalEmissionsCode: input.nationalEmissionsCode,
      variant: input.variant,
      version: input.version,
      commercialName: input.commercialName,
      vehicleCategory: input.vehicleCategory,
      vehicleCategoryOther: input.vehicleCategoryOther,
      nationalCategory: input.nationalCategory,
      nationalCategoryOther: input.nationalCategoryOther,
      bodyType: input.bodyType,
      bodyTypeOther: input.bodyTypeOther,
      typeApprovalNumber: input.typeApprovalNumber,
      nationalRegistryNumber: input.nationalRegistryNumber,
      seatsCount: input.seatsCount,
      engineSerialNumber: input.engineSerialNumber,
      ratedEngineRpm: input.ratedEngineRpm,
      fuelType: input.fuelType,
      fuelTypeOther: input.fuelTypeOther,
      propulsionSystem: input.propulsionSystem,
      electricMotorPowerKw: input.electricMotorPowerKw,
      powerToWeightRatioKwKg: input.powerToWeightRatioKwKg,
      maxSpeedKmh: input.maxSpeedKmh,
      emissionsStandard: input.emissionsStandard,
      curbWeightKg: input.curbWeightKg,
      actualWeightKg: input.actualWeightKg,
      maxTechnicallyPermissibleMassKg: input.maxTechnicallyPermissibleMassKg,
      maxTrainMassKg: input.maxTrainMassKg,
      maxAxle1MassKg: input.maxAxle1MassKg,
      maxAxle2MassKg: input.maxAxle2MassKg,
      axlesCount: input.axlesCount,
      lengthMm: input.lengthMm,
      widthMm: input.widthMm,
      heightMm: input.heightMm,
      wheelbaseMm: input.wheelbaseMm,
      frontTyreSpecification: input.frontTyreSpecification,
      rearTyreSpecification: input.rearTyreSpecification,
      frontSuspension: input.frontSuspension,
      rearSuspension: input.rearSuspension,
      fuelTankCapacityLiters: input.fuelTankCapacityLiters,
      registrationCertificateNumber: input.registrationCertificateNumber,
      model: input.model,
      color: input.color,
      manufactureYear: input.manufactureYear,
      powertrainType: input.powertrainType,
      fuelSystem: input.fuelSystem,
      engineCode: input.engineCode ?? null,
      engineDisplacementCc:
        input.powertrainType === "electric" ? null : input.engineDisplacementCc,
      powerKw: input.powerKw ?? null,
      ...this.toRegistrationWriteData({
        registrationType: input.registrationType ?? "unregistered",
        registrationNumber: input.registrationNumber ?? null,
        registrationDate: input.registrationDate ?? null,
        temporaryRegistrationExpiresAt:
          input.temporaryRegistrationExpiresAt ?? null,
        requiredLicenseCategory: input.requiredLicenseCategory ?? "none",
      }),
      currentMileageKm: input.currentMileageKm ?? null,
      hasGps: input.hasGps,
      hasPhoneStand: input.hasPhoneStand,
      hasChargingOutlet: input.hasChargingOutlet,
      odometerWorking: input.odometerWorking,
      speedometerWorking: input.speedometerWorking,
      actualMaxSpeedKmh: input.actualMaxSpeedKmh,
      notes: input.notes,
    };
  }

  private toUpdateData(
    input: v1.scooters.UpdateScooterInput,
    existing: Scooter & {
      civDocument?:
        | import("../generated/prisma/client").VehicleCivDocument
        | null;
    },
  ): Prisma.ScooterUpdateInput {
    const civData = civMetadataWrite(input);
    return {
      maxAxle3MassKg: input.maxAxle3MassKg,
      maxAxle4MassKg: input.maxAxle4MassKg,
      maxAxle5MassKg: input.maxAxle5MassKg,
      brakedTrailerMassKg: input.brakedTrailerMassKg,
      unbrakedTrailerMassKg: input.unbrakedTrailerMassKg,
      couplingPointMassKg: input.couplingPointMassKg,
      standingCapacity: input.standingCapacity,
      noiseMeasurementRpm: input.noiseMeasurementRpm,
      stationaryNoiseDb: input.stationaryNoiseDb,
      drivingNoiseDb: input.drivingNoiseDb,
      co2EmissionsGKm: input.co2EmissionsGKm,
      vehicleClass: input.vehicleClass,
      driveType: input.driveType,
      civDocument: civData
        ? { upsert: { create: civData, update: civData } }
        : undefined,
      vin: input.vin,
      brand:
        input.brandId === undefined
          ? undefined
          : { connect: { id: input.brandId } },
      vehicleType: input.vehicleType,
      civNumber: input.civNumber,
      civAvailability: civAvailabilityWrite(input, existing),
      nationalEmissionsCode: input.nationalEmissionsCode,
      variant: input.variant,
      version: input.version,
      commercialName: input.commercialName,
      vehicleCategory: input.vehicleCategory,
      vehicleCategoryOther: input.vehicleCategoryOther,
      nationalCategory: input.nationalCategory,
      nationalCategoryOther: input.nationalCategoryOther,
      bodyType: input.bodyType,
      bodyTypeOther: input.bodyTypeOther,
      typeApprovalNumber: input.typeApprovalNumber,
      nationalRegistryNumber: input.nationalRegistryNumber,
      seatsCount: input.seatsCount,
      engineSerialNumber: input.engineSerialNumber,
      ratedEngineRpm: input.ratedEngineRpm,
      fuelType: input.fuelType,
      fuelTypeOther: input.fuelTypeOther,
      propulsionSystem: input.propulsionSystem,
      electricMotorPowerKw: input.electricMotorPowerKw,
      powerToWeightRatioKwKg: input.powerToWeightRatioKwKg,
      maxSpeedKmh: input.maxSpeedKmh,
      emissionsStandard: input.emissionsStandard,
      curbWeightKg: input.curbWeightKg,
      actualWeightKg: input.actualWeightKg,
      maxTechnicallyPermissibleMassKg: input.maxTechnicallyPermissibleMassKg,
      maxTrainMassKg: input.maxTrainMassKg,
      maxAxle1MassKg: input.maxAxle1MassKg,
      maxAxle2MassKg: input.maxAxle2MassKg,
      axlesCount: input.axlesCount,
      lengthMm: input.lengthMm,
      widthMm: input.widthMm,
      heightMm: input.heightMm,
      wheelbaseMm: input.wheelbaseMm,
      frontTyreSpecification: input.frontTyreSpecification,
      rearTyreSpecification: input.rearTyreSpecification,
      frontSuspension: input.frontSuspension,
      rearSuspension: input.rearSuspension,
      fuelTankCapacityLiters: input.fuelTankCapacityLiters,
      registrationCertificateNumber: input.registrationCertificateNumber,
      model: input.model,
      color: input.color,
      manufactureYear: input.manufactureYear,
      powertrainType: input.powertrainType,
      fuelSystem: input.fuelSystem,
      engineCode: input.engineCode,
      engineDisplacementCc: input.engineDisplacementCc,
      powerKw: input.powerKw,
      ...this.toRegistrationWriteData(
        this.toNextRegistrationState(existing, input),
      ),
      currentMileageKm: input.currentMileageKm,
      hasGps: input.hasGps,
      hasPhoneStand: input.hasPhoneStand,
      hasChargingOutlet: input.hasChargingOutlet,
      odometerWorking: input.odometerWorking,
      speedometerWorking: input.speedometerWorking,
      actualMaxSpeedKmh: input.actualMaxSpeedKmh,
      notes: input.notes,
    };
  }

  private toNextRegistrationState(
    existing: Scooter,
    input: v1.scooters.UpdateScooterInput,
  ): RegistrationState {
    const registrationType =
      input.registrationType ?? existing.registrationType;

    if (registrationType === "unregistered") {
      return {
        registrationType,
        registrationNumber: null,
        registrationDate: null,
        temporaryRegistrationExpiresAt: null,
        requiredLicenseCategory: "none",
      };
    }

    return {
      registrationType,
      registrationNumber:
        input.registrationNumber !== undefined
          ? input.registrationNumber
          : existing.registrationNumber,
      registrationDate:
        input.registrationDate !== undefined
          ? input.registrationDate
          : toDateOnlyString(existing.registrationDate),
      temporaryRegistrationExpiresAt:
        input.temporaryRegistrationExpiresAt !== undefined
          ? input.temporaryRegistrationExpiresAt
          : toDateOnlyString(existing.temporaryRegistrationExpiresAt),
      requiredLicenseCategory:
        input.requiredLicenseCategory ?? existing.requiredLicenseCategory,
    };
  }

  private toRegistrationWriteData(
    state: RegistrationState,
  ): Pick<
    Prisma.ScooterCreateInput,
    | "registrationType"
    | "registrationNumber"
    | "registrationNumberNormalized"
    | "registrationDate"
    | "temporaryRegistrationExpiresAt"
    | "requiredLicenseCategory"
  > {
    if (state.registrationType === "unregistered") {
      return {
        registrationType: "unregistered",
        registrationNumber: null,
        registrationNumberNormalized: null,
        registrationDate: null,
        temporaryRegistrationExpiresAt: null,
        requiredLicenseCategory: "none",
      };
    }

    if (!state.registrationNumber) {
      throw new BadRequestException(
        "Plate number is required for registered scooters",
      );
    }

    if (
      state.registrationDate &&
      (state.registrationDate > v1.common.dateOnlyToday() ||
        (state.registrationType === "temporary" &&
          state.temporaryRegistrationExpiresAt &&
          state.temporaryRegistrationExpiresAt < state.registrationDate))
    ) {
      throw new BadRequestException("Registration dates are invalid");
    }

    const normalized = v1.scooters.validatePlateForRegistrationType(
      state.registrationType,
      state.registrationNumber,
    );
    if (!normalized) {
      throw new BadRequestException(
        "Plate number does not match the selected registration type",
      );
    }

    return {
      registrationType: state.registrationType,
      registrationNumber: normalized.displayValue,
      registrationNumberNormalized: normalized.compactValue,
      registrationDate: toDateOnlyDate(state.registrationDate),
      temporaryRegistrationExpiresAt:
        state.registrationType === "temporary" &&
        state.temporaryRegistrationExpiresAt
          ? toDateOnlyDate(state.temporaryRegistrationExpiresAt)!
          : null,
      requiredLicenseCategory: state.requiredLicenseCategory,
    };
  }

  private toListWhere(
    query: v1.scooters.ListScootersQuery,
  ): Prisma.ScooterWhereInput {
    const and: Prisma.ScooterWhereInput[] = [];

    if (!query.includeDeleted) {
      and.push({ deletedAt: null });
    }

    if (query.powertrainType) {
      and.push({ powertrainType: query.powertrainType });
    }

    if (query.registrationType) {
      and.push({ registrationType: query.registrationType });
    }

    if (query.requiredLicenseCategory) {
      and.push({
        requiredLicenseCategory: query.requiredLicenseCategory,
      });
    }

    return and.length > 0 ? { AND: and } : {};
  }

  private toSearchCte(query: v1.scooters.ListScootersQuery): PrismaRuntime.Sql {
    const term = query.search!.replace(/\s+/g, " ").trim().toLowerCase();
    const pattern = `%${term}%`;
    const fleetNumberText = PrismaRuntime.sql`s."fleetNumber"::text`;
    // PostgreSQL lpad truncates strings longer than its width: preserve 1000+.
    const fleetCode = PrismaRuntime.sql`lower(lpad(${fleetNumberText}, greatest(3, length(${fleetNumberText})), '0') || ' ' || sb.code)`;
    const exactFleetMatch = PrismaRuntime.sql`(
      ${fleetNumberText} = ${term.replace(/^0+(?=\d)/, "")} OR
      ${fleetCode} = ${term} OR
      lower(${fleetNumberText} || ' ' || sb.code) = ${term.replace(/^0+(?=\d)/, "")}
    )`;
    const scooterText = PrismaRuntime.sql`lower(
      ${fleetCode} || ' ' ||
      coalesce(s.vin, '') || ' ' ||
      coalesce(sb.name, '') || ' ' ||
      coalesce(s.model, '') || ' ' ||
      coalesce(s.color, '') || ' ' ||
      coalesce(s."manufactureYear"::text, '') || ' ' ||
      coalesce(s."powertrainType"::text, '') || ' ' ||
      coalesce(s."engineDisplacementCc"::text, '') || ' ' ||
      coalesce((s."powerKw"::numeric(10, 2))::text, '') || ' ' ||
      coalesce(s."registrationType"::text, '') || ' ' ||
      coalesce(s."registrationNumber", '') || ' ' ||
      coalesce(s."registrationNumberNormalized", '') || ' ' ||
      coalesce(s."requiredLicenseCategory"::text, '') || ' ' ||
      coalesce(s.notes, '')
    )`;

    return PrismaRuntime.sql`
      WITH base AS (
        SELECT
          s.id,
          s."fleetNumber",
          ${exactFleetMatch} AS exact_fleet_match,
          s.vin,
          sb.name AS brand,
          s.model,
          s."manufactureYear",
          s."createdAt",
          s."updatedAt",
          ${scooterText} AS scooter_text
        FROM "Scooter" s
        JOIN "ScooterBrand" sb ON sb.id = s."brandId"
        WHERE ${this.toScooterFilterSql(query)}
      ),
      scored AS (
        SELECT
          b.id,
          b."fleetNumber",
          b.exact_fleet_match,
          b.vin,
          b.brand,
          b.model,
          b."manufactureYear",
          b."createdAt",
          b."updatedAt",
          word_similarity(${term}, b.scooter_text) AS score
        FROM base b
        WHERE ${this.toSearchPredicateSql(term, pattern)}
      )
    `;
  }

  private toScooterFilterSql(
    query: v1.scooters.ListScootersQuery,
  ): PrismaRuntime.Sql {
    const clauses: PrismaRuntime.Sql[] = [];

    if (!query.includeDeleted) {
      clauses.push(PrismaRuntime.sql`s."deletedAt" IS NULL`);
    }

    if (query.powertrainType) {
      clauses.push(
        PrismaRuntime.sql`s."powertrainType"::text = ${query.powertrainType}`,
      );
    }

    if (query.registrationType) {
      clauses.push(
        PrismaRuntime.sql`s."registrationType"::text = ${query.registrationType}`,
      );
    }

    if (query.requiredLicenseCategory) {
      clauses.push(
        PrismaRuntime.sql`s."requiredLicenseCategory"::text = ${query.requiredLicenseCategory}`,
      );
    }

    return sqlAnd(clauses);
  }

  private toSearchPredicateSql(
    term: string,
    pattern: string,
  ): PrismaRuntime.Sql {
    const clauses = [
      PrismaRuntime.sql`b.exact_fleet_match`,
      PrismaRuntime.sql`b.scooter_text ILIKE ${pattern}`,
    ];

    if (term.length >= 3) {
      clauses.push(PrismaRuntime.sql`${term} <% b.scooter_text`);
    }

    return PrismaRuntime.sql`(${PrismaRuntime.join(clauses, " OR ")})`;
  }

  private toScooterOrderBy(
    query: v1.scooters.ListScootersQuery,
  ): Prisma.ScooterOrderByWithRelationInput[] {
    switch (this.resolveListSort(query)) {
      case "fleetNumberAsc":
      case "relevance":
        return [{ fleetNumber: "asc" }];
      case "fleetNumberDesc":
        return [{ fleetNumber: "desc" }];
      case "vinDesc":
        return [{ vin: "desc" }, { id: "asc" }];
      case "brandAsc":
        return [{ brand: { name: "asc" } }, { model: "asc" }, { vin: "asc" }];
      case "brandDesc":
        return [{ brand: { name: "desc" } }, { model: "desc" }, { vin: "asc" }];
      case "manufactureYearDesc":
        return [{ manufactureYear: "desc" }, { vin: "asc" }];
      case "manufactureYearAsc":
        return [{ manufactureYear: "asc" }, { vin: "asc" }];
      case "createdAtDesc":
        return [{ createdAt: "desc" }, { id: "asc" }];
      case "createdAtAsc":
        return [{ createdAt: "asc" }, { id: "asc" }];
      case "updatedAtDesc":
        return [{ updatedAt: "desc" }, { id: "asc" }];
      case "updatedAtAsc":
        return [{ updatedAt: "asc" }, { id: "asc" }];
      case "vinAsc":
        return [{ vin: "asc" }, { id: "asc" }];
    }
  }

  private toSearchOrderBy(
    query: v1.scooters.ListScootersQuery,
  ): PrismaRuntime.Sql {
    switch (this.resolveListSort(query)) {
      case "fleetNumberAsc":
        return PrismaRuntime.sql`"fleetNumber" ASC`;
      case "fleetNumberDesc":
        return PrismaRuntime.sql`"fleetNumber" DESC`;
      case "vinAsc":
        return PrismaRuntime.sql`vin ASC, score DESC, id ASC`;
      case "vinDesc":
        return PrismaRuntime.sql`vin DESC, score DESC, id ASC`;
      case "brandAsc":
        return PrismaRuntime.sql`brand ASC, model ASC, score DESC, id ASC`;
      case "brandDesc":
        return PrismaRuntime.sql`brand DESC, model DESC, score DESC, id ASC`;
      case "manufactureYearDesc":
        return PrismaRuntime.sql`"manufactureYear" DESC, score DESC, id ASC`;
      case "manufactureYearAsc":
        return PrismaRuntime.sql`"manufactureYear" ASC, score DESC, id ASC`;
      case "createdAtDesc":
        return PrismaRuntime.sql`"createdAt" DESC, score DESC, id ASC`;
      case "createdAtAsc":
        return PrismaRuntime.sql`"createdAt" ASC, score DESC, id ASC`;
      case "updatedAtDesc":
        return PrismaRuntime.sql`"updatedAt" DESC, score DESC, id ASC`;
      case "updatedAtAsc":
        return PrismaRuntime.sql`"updatedAt" ASC, score DESC, id ASC`;
      case "relevance":
        return PrismaRuntime.sql`exact_fleet_match DESC, score DESC, "fleetNumber" ASC`;
    }
  }

  private resolveListSort(
    query: v1.scooters.ListScootersQuery,
  ): v1.scooters.ScooterListSort {
    if (query.sort === "relevance" && !query.search) {
      return "fleetNumberAsc";
    }

    return query.sort ?? (query.search ? "relevance" : "fleetNumberAsc");
  }

  private assertValidPowertrain(
    powertrainType: v1.scooters.ScooterPowertrainType,
    values: object,
  ): void {
    const fuel = (values as { fuelType?: v1.scooters.Scooter["fuelType"] })
      .fuelType;
    if (!v1.scooters.fuelMatchesPowertrain(powertrainType, fuel)) {
      throw new BadRequestException({
        message: "Fuel does not match the selected powertrain.",
        details: { field: "fuelType" },
      });
    }
    for (const field of v1.scooters.inactivePowertrainFields(powertrainType)) {
      if ((values as Record<string, unknown>)[field] != null) {
        throw new BadRequestException({
          message:
            "Clear incompatible fields explicitly when changing powertrain.",
          details: { field },
        });
      }
    }
  }

  private async assertActivePlateAvailable(
    registrationNumberNormalized: string | null | undefined,
    excludeId?: string,
  ): Promise<void> {
    if (!registrationNumberNormalized) {
      return;
    }

    const existing = await this.prisma.scooter.findFirst({
      where: {
        registrationNumberNormalized,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        code: SCOOTER_PLATE_CONFLICT_CODE,
        message: "Scooter plate number already exists",
        details: { field: "registrationNumber" },
      });
    }
  }

  private handleWriteError(error: unknown): never {
    if (
      error instanceof PrismaRuntime.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = error.meta?.target;
      const fields = Array.isArray(target)
        ? target.map(String)
        : typeof target === "string"
          ? [target]
          : [];

      if (
        fields.includes("fleetNumber") ||
        fields.includes("Scooter_fleetNumber_key")
      ) {
        throw new ConflictException({
          code: "SCOOTER_FLEET_NUMBER_CONFLICT",
          message: "Scooter internal number already exists",
          details: { field: "fleetNumber" },
        });
      }

      if (
        fields.includes("registrationNumberNormalized") ||
        fields.includes("Scooter_active_registrationNumberNormalized_key")
      ) {
        throw new ConflictException({
          code: SCOOTER_PLATE_CONFLICT_CODE,
          message: "Scooter plate number already exists",
          details: { field: "registrationNumber" },
        });
      }

      throw new ConflictException({
        code: SCOOTER_VIN_CONFLICT_CODE,
        message: "Scooter VIN already exists",
        details: { field: "vin" },
      });
    }
    throw error;
  }
}

function sqlAnd(clauses: PrismaRuntime.Sql[]): PrismaRuntime.Sql {
  if (clauses.length === 0) {
    return PrismaRuntime.sql`TRUE`;
  }

  return PrismaRuntime.sql`(${PrismaRuntime.join(clauses, " AND ")})`;
}
