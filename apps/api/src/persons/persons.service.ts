import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { toDateOnlyDate } from "../common/dates/date-only";
import type { Person, Prisma } from "../generated/prisma/client";
import { Prisma as PrismaRuntime } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PersonsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: v1.persons.CreatePersonInput): Promise<Person> {
    try {
      return await this.prisma.person.create({
        data: this.toCreateData(input),
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async list(query: v1.persons.ListPersonsQuery): Promise<{
    items: Person[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const where = this.toListWhere(query);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.person.count({ where }),
      this.prisma.person.findMany({
        where,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async findActiveById(id: string): Promise<Person | null> {
    return this.prisma.person.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async update(
    id: string,
    input: v1.persons.UpdatePersonInput,
  ): Promise<Person> {
    const existing = await this.findActiveById(id);
    if (!existing) {
      throw new NotFoundException("Person not found");
    }

    try {
      return await this.prisma.person.update({
        where: { id },
        data: this.toUpdateData(input),
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.prisma.person.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException("Person not found");
    }
  }

  private toCreateData(
    input: v1.persons.CreatePersonInput,
  ): Prisma.PersonCreateInput {
    return {
      email: input.email,
      phone: input.phone,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: toDateOnlyDate(input.dateOfBirth),
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      region: input.region,
      postalCode: input.postalCode,
      countryCode: input.countryCode,
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      documentIssuingCountryCode: input.documentIssuingCountryCode,
      documentExpiresOn: toDateOnlyDate(input.documentExpiresOn),
      documentStatus: input.documentStatus ?? "unverified",
      notes: input.notes,
    };
  }

  private toUpdateData(
    input: v1.persons.UpdatePersonInput,
  ): Prisma.PersonUpdateInput {
    return {
      email: input.email,
      phone: input.phone,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: toDateOnlyDate(input.dateOfBirth),
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      region: input.region,
      postalCode: input.postalCode,
      countryCode: input.countryCode,
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      documentIssuingCountryCode: input.documentIssuingCountryCode,
      documentExpiresOn: toDateOnlyDate(input.documentExpiresOn),
      documentStatus: input.documentStatus,
      notes: input.notes,
    };
  }

  private toListWhere(
    query: v1.persons.ListPersonsQuery,
  ): Prisma.PersonWhereInput {
    return {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search, mode: "insensitive" } },
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
              {
                documentNumber: {
                  contains: query.search,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    };
  }

  private handleWriteError(error: unknown): never {
    if (
      error instanceof PrismaRuntime.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException("Person email or phone already exists");
    }
    throw error;
  }
}
