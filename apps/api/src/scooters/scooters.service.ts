import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { toDateOnlyDate } from "../common/dates/date-only";
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

@Injectable()
export class ScootersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: v1.scooters.CreateScooterInput): Promise<Scooter> {
    this.assertValidPowertrain(input.powertrainType, input.cylinderCapacityCc);

    try {
      return await this.prisma.scooter.create({
        data: this.toCreateData(input),
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
      const nextCylinderCapacityCc =
        nextPowertrainType === "electric"
          ? null
          : input.cylinderCapacityCc !== undefined
            ? input.cylinderCapacityCc
            : existing.cylinderCapacityCc;
      this.assertValidPowertrain(
        nextPowertrainType as v1.scooters.ScooterPowertrainType,
        nextCylinderCapacityCc,
      );

      return await this.prisma.scooter.update({
        where: { id },
        data: this.toUpdateData(input, nextPowertrainType),
      });
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
      cylinderCapacityCc:
        input.powertrainType === "electric" ? null : input.cylinderCapacityCc,
      purchasedOn: toDateOnlyDate(input.purchasedOn)!,
      registrationStatus: "unregistered",
      notes: input.notes,
    };
  }

  private toUpdateData(
    input: v1.scooters.UpdateScooterInput,
    nextPowertrainType: string,
  ): Prisma.ScooterUpdateInput {
    return {
      vin: input.vin,
      brand: input.brand,
      model: input.model,
      color: input.color,
      manufactureYear: input.manufactureYear,
      powertrainType: input.powertrainType,
      cylinderCapacityCc:
        nextPowertrainType === "electric" ? null : input.cylinderCapacityCc,
      purchasedOn:
        input.purchasedOn === undefined
          ? undefined
          : toDateOnlyDate(input.purchasedOn)!,
      notes: input.notes,
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

    if (query.registrationStatus) {
      and.push({ registrationStatus: query.registrationStatus });
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
      coalesce(s."cylinderCapacityCc"::text, '') || ' ' ||
      coalesce(s."registrationStatus", '') || ' ' ||
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

    if (query.registrationStatus) {
      clauses.push(
        PrismaRuntime.sql`s."registrationStatus" = ${query.registrationStatus}`,
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
    cylinderCapacityCc: number | null | undefined,
  ): void {
    if (powertrainType === "combustion" && !cylinderCapacityCc) {
      throw new BadRequestException(
        "Cylinder capacity is required for combustion scooters",
      );
    }

    if (powertrainType === "electric" && cylinderCapacityCc) {
      throw new BadRequestException(
        "Cylinder capacity is only allowed for combustion scooters",
      );
    }
  }

  private handleWriteError(error: unknown): never {
    if (
      error instanceof PrismaRuntime.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
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
