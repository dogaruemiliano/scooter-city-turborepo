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
  plateNumber: string | null;
  registeredOn: string | null;
  registrationExpiresOn: string | null;
  requiredDriverLicenseType: v1.scooters.ScooterRequiredDriverLicenseType;
}

@Injectable()
export class ScootersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: v1.scooters.CreateScooterInput): Promise<Scooter> {
    this.assertValidPowertrain(input.powertrainType, input.engineCc);

    try {
      const data = this.toCreateData(input);
      await this.assertActivePlateAvailable(data.plateNumberNormalized);

      return await this.prisma.scooter.create({
        data,
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async list(query: v1.scooters.ListScootersQuery): Promise<{
    items: Scooter[];
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
        orderBy: this.toScooterOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  private async search(query: v1.scooters.ListScootersQuery): Promise<{
    items: Scooter[];
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
    });
    items.sort((first, second) => order.get(first.id)! - order.get(second.id)!);

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total: countRows[0]?.total ?? 0,
    };
  }

  async findActiveById(id: string): Promise<Scooter | null> {
    return this.prisma.scooter.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async update(
    id: string,
    input: v1.scooters.UpdateScooterInput,
  ): Promise<Scooter> {
    try {
      const existing = await this.prisma.scooter.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException("Scooter not found");
      }

      const nextPowertrainType =
        input.powertrainType ?? existing.powertrainType;
      const nextEngineCc =
        nextPowertrainType === "electric"
          ? null
          : input.engineCc !== undefined
            ? input.engineCc
            : existing.engineCc;
      this.assertValidPowertrain(
        nextPowertrainType as v1.scooters.ScooterPowertrainType,
        nextEngineCc,
      );

      const data = this.toUpdateData(
        input,
        existing,
        nextPowertrainType,
        nextEngineCc,
      );
      await this.assertActivePlateAvailable(
        typeof data.plateNumberNormalized === "string"
          ? data.plateNumberNormalized
          : null,
        id,
      );

      return await this.prisma.scooter.update({ where: { id }, data });
    } catch (error) {
      this.handleWriteError(error);
    }
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
  ): Prisma.ScooterCreateInput {
    return {
      vin: input.vin,
      brand: input.brand,
      model: input.model,
      color: input.color,
      manufactureYear: input.manufactureYear,
      powertrainType: input.powertrainType,
      engineCc: input.powertrainType === "electric" ? null : input.engineCc,
      powerKw: input.powerKw ?? null,
      purchasedOn: toDateOnlyDate(input.purchasedOn)!,
      ...this.toRegistrationWriteData({
        registrationType: input.registrationType ?? "unregistered",
        plateNumber: input.plateNumber ?? null,
        registeredOn: input.registeredOn ?? null,
        registrationExpiresOn: input.registrationExpiresOn ?? null,
        requiredDriverLicenseType: input.requiredDriverLicenseType ?? "none",
      }),
      notes: input.notes,
    };
  }

  private toUpdateData(
    input: v1.scooters.UpdateScooterInput,
    existing: Scooter,
    nextPowertrainType: string,
    nextEngineCc: number | null,
  ): Prisma.ScooterUpdateInput {
    return {
      vin: input.vin,
      brand: input.brand,
      model: input.model,
      color: input.color,
      manufactureYear: input.manufactureYear,
      powertrainType: input.powertrainType,
      engineCc: nextPowertrainType === "electric" ? null : nextEngineCc,
      powerKw: input.powerKw,
      purchasedOn:
        input.purchasedOn === undefined
          ? undefined
          : toDateOnlyDate(input.purchasedOn)!,
      ...this.toRegistrationWriteData(
        this.toNextRegistrationState(existing, input),
      ),
      notes: input.notes,
    };
  }

  private toNextRegistrationState(
    existing: Scooter,
    input: v1.scooters.UpdateScooterInput,
  ): RegistrationState {
    const registrationType =
      input.registrationType ??
      (existing.registrationType as v1.scooters.ScooterRegistrationType);

    if (registrationType === "unregistered") {
      return {
        registrationType,
        plateNumber: null,
        registeredOn: null,
        registrationExpiresOn: null,
        requiredDriverLicenseType: "none",
      };
    }

    return {
      registrationType,
      plateNumber:
        input.plateNumber !== undefined
          ? input.plateNumber
          : existing.plateNumber,
      registeredOn:
        input.registeredOn !== undefined
          ? input.registeredOn
          : toDateOnlyString(existing.registeredOn),
      registrationExpiresOn:
        input.registrationExpiresOn !== undefined
          ? input.registrationExpiresOn
          : toDateOnlyString(existing.registrationExpiresOn),
      requiredDriverLicenseType:
        input.requiredDriverLicenseType ??
        (existing.requiredDriverLicenseType as v1.scooters.ScooterRequiredDriverLicenseType),
    };
  }

  private toRegistrationWriteData(
    state: RegistrationState,
  ): Pick<
    Prisma.ScooterCreateInput,
    | "registrationType"
    | "plateNumber"
    | "plateNumberNormalized"
    | "registeredOn"
    | "registrationExpiresOn"
    | "requiredDriverLicenseType"
  > {
    if (state.registrationType === "unregistered") {
      return {
        registrationType: "unregistered",
        plateNumber: null,
        plateNumberNormalized: null,
        registeredOn: null,
        registrationExpiresOn: null,
        requiredDriverLicenseType: "none",
      };
    }

    if (!state.plateNumber) {
      throw new BadRequestException(
        "Plate number is required for registered scooters",
      );
    }

    if (!state.registeredOn) {
      throw new BadRequestException(
        "Registration date is required for registered scooters",
      );
    }

    if (
      state.registeredOn > v1.common.dateOnlyToday() ||
      (state.registrationType === "temporary" &&
        state.registrationExpiresOn &&
        state.registrationExpiresOn < state.registeredOn)
    ) {
      throw new BadRequestException("Registration dates are invalid");
    }

    if (
      state.registrationType === "temporary" &&
      !state.registrationExpiresOn
    ) {
      throw new BadRequestException(
        "Registration expiry date is required for temporary plates",
      );
    }

    const normalized = v1.scooters.validatePlateForRegistrationType(
      state.registrationType,
      state.plateNumber,
    );
    if (!normalized) {
      throw new BadRequestException(
        "Plate number does not match the selected registration type",
      );
    }

    return {
      registrationType: state.registrationType,
      plateNumber: normalized.displayValue,
      plateNumberNormalized: normalized.compactValue,
      registeredOn: toDateOnlyDate(state.registeredOn)!,
      registrationExpiresOn:
        state.registrationType === "temporary" && state.registrationExpiresOn
          ? toDateOnlyDate(state.registrationExpiresOn)!
          : null,
      requiredDriverLicenseType: state.requiredDriverLicenseType,
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

    if (query.requiredDriverLicenseType) {
      and.push({
        requiredDriverLicenseType: query.requiredDriverLicenseType,
      });
    }

    return and.length > 0 ? { AND: and } : {};
  }

  private toSearchCte(query: v1.scooters.ListScootersQuery): PrismaRuntime.Sql {
    const term = query.search!.toLowerCase();
    const pattern = `%${term}%`;
    const scooterText = PrismaRuntime.sql`lower(
      coalesce(s.vin, '') || ' ' ||
      coalesce(s.brand, '') || ' ' ||
      coalesce(s.model, '') || ' ' ||
      coalesce(s.color, '') || ' ' ||
      coalesce(s."manufactureYear"::text, '') || ' ' ||
      coalesce(s."powertrainType", '') || ' ' ||
      coalesce(s."engineCc"::text, '') || ' ' ||
      coalesce((s."powerKw"::numeric(10, 2))::text, '') || ' ' ||
      coalesce(s."registrationType", '') || ' ' ||
      coalesce(s."plateNumber", '') || ' ' ||
      coalesce(s."plateNumberNormalized", '') || ' ' ||
      coalesce(s."requiredDriverLicenseType", '') || ' ' ||
      coalesce(s.notes, '')
    )`;

    return PrismaRuntime.sql`
      WITH base AS (
        SELECT
          s.id,
          s.vin,
          s.brand,
          s.model,
          s."manufactureYear",
          s."purchasedOn",
          s."createdAt",
          s."updatedAt",
          ${scooterText} AS scooter_text
        FROM "Scooter" s
        WHERE ${this.toScooterFilterSql(query)}
      ),
      scored AS (
        SELECT
          b.id,
          b.vin,
          b.brand,
          b.model,
          b."manufactureYear",
          b."purchasedOn",
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
        PrismaRuntime.sql`s."powertrainType" = ${query.powertrainType}`,
      );
    }

    if (query.registrationType) {
      clauses.push(
        PrismaRuntime.sql`s."registrationType" = ${query.registrationType}`,
      );
    }

    if (query.requiredDriverLicenseType) {
      clauses.push(
        PrismaRuntime.sql`s."requiredDriverLicenseType" = ${query.requiredDriverLicenseType}`,
      );
    }

    return sqlAnd(clauses);
  }

  private toSearchPredicateSql(
    term: string,
    pattern: string,
  ): PrismaRuntime.Sql {
    const clauses = [PrismaRuntime.sql`b.scooter_text ILIKE ${pattern}`];

    if (term.length >= 3) {
      clauses.push(PrismaRuntime.sql`${term} <% b.scooter_text`);
    }

    return PrismaRuntime.sql`(${PrismaRuntime.join(clauses, " OR ")})`;
  }

  private toScooterOrderBy(
    query: v1.scooters.ListScootersQuery,
  ): Prisma.ScooterOrderByWithRelationInput[] {
    switch (this.resolveListSort(query)) {
      case "vinDesc":
        return [{ vin: "desc" }, { id: "asc" }];
      case "brandAsc":
        return [{ brand: "asc" }, { model: "asc" }, { vin: "asc" }];
      case "brandDesc":
        return [{ brand: "desc" }, { model: "desc" }, { vin: "asc" }];
      case "manufactureYearDesc":
        return [{ manufactureYear: "desc" }, { vin: "asc" }];
      case "manufactureYearAsc":
        return [{ manufactureYear: "asc" }, { vin: "asc" }];
      case "purchasedOnDesc":
        return [{ purchasedOn: "desc" }, { vin: "asc" }];
      case "purchasedOnAsc":
        return [{ purchasedOn: "asc" }, { vin: "asc" }];
      case "createdAtDesc":
        return [{ createdAt: "desc" }, { id: "asc" }];
      case "createdAtAsc":
        return [{ createdAt: "asc" }, { id: "asc" }];
      case "updatedAtDesc":
        return [{ updatedAt: "desc" }, { id: "asc" }];
      case "updatedAtAsc":
        return [{ updatedAt: "asc" }, { id: "asc" }];
      case "relevance":
      case "vinAsc":
        return [{ vin: "asc" }, { id: "asc" }];
    }
  }

  private toSearchOrderBy(
    query: v1.scooters.ListScootersQuery,
  ): PrismaRuntime.Sql {
    switch (this.resolveListSort(query)) {
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
      case "purchasedOnDesc":
        return PrismaRuntime.sql`"purchasedOn" DESC, score DESC, id ASC`;
      case "purchasedOnAsc":
        return PrismaRuntime.sql`"purchasedOn" ASC, score DESC, id ASC`;
      case "createdAtDesc":
        return PrismaRuntime.sql`"createdAt" DESC, score DESC, id ASC`;
      case "createdAtAsc":
        return PrismaRuntime.sql`"createdAt" ASC, score DESC, id ASC`;
      case "updatedAtDesc":
        return PrismaRuntime.sql`"updatedAt" DESC, score DESC, id ASC`;
      case "updatedAtAsc":
        return PrismaRuntime.sql`"updatedAt" ASC, score DESC, id ASC`;
      case "relevance":
        return PrismaRuntime.sql`score DESC, vin ASC, id ASC`;
    }
  }

  private resolveListSort(
    query: v1.scooters.ListScootersQuery,
  ): v1.scooters.ScooterListSort {
    if (query.sort === "relevance" && !query.search) {
      return "vinAsc";
    }

    return query.sort ?? (query.search ? "relevance" : "vinAsc");
  }

  private assertValidPowertrain(
    powertrainType: v1.scooters.ScooterPowertrainType,
    engineCc: number | null | undefined,
  ): void {
    if (powertrainType === "combustion" && !engineCc) {
      throw new BadRequestException(
        "Engine cc is required for combustion scooters",
      );
    }

    if (powertrainType === "electric" && engineCc) {
      throw new BadRequestException(
        "Engine cc is only allowed for combustion scooters",
      );
    }
  }

  private async assertActivePlateAvailable(
    plateNumberNormalized: string | null | undefined,
    excludeId?: string,
  ): Promise<void> {
    if (!plateNumberNormalized) {
      return;
    }

    const existing = await this.prisma.scooter.findFirst({
      where: {
        plateNumberNormalized,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        code: SCOOTER_PLATE_CONFLICT_CODE,
        message: "Scooter plate number already exists",
        details: { field: "plateNumber" },
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
        fields.includes("plateNumberNormalized") ||
        fields.includes("Scooter_active_plateNumberNormalized_key")
      ) {
        throw new ConflictException({
          code: SCOOTER_PLATE_CONFLICT_CODE,
          message: "Scooter plate number already exists",
          details: { field: "plateNumber" },
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
