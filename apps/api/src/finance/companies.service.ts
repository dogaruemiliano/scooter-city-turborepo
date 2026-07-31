import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { CounterpartyType, Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const companyInclude = { counterparty: { select: { id: true } } } as const;

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: v1.finance.CreateCompanyInput) {
    try {
      return await this.prisma.company.create({
        data: {
          ...createCompanyData(input),
          counterparty: {
            create: { type: CounterpartyType.COMPANY },
          },
        },
        include: companyInclude,
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async list(query: v1.finance.ListCompaniesQuery) {
    const search = query.search?.trim();
    const where: Prisma.CompanyWhereInput = {
      deletedAt: null,
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(search
        ? {
            OR: [
              { legalName: { contains: search, mode: "insensitive" } },
              { tradingName: { contains: search, mode: "insensitive" } },
              { taxIdentifier: { contains: search, mode: "insensitive" } },
              { registrationNumber: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              {
                phoneNormalized: { contains: normalizePhone(search) ?? search },
              },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        include: companyInclude,
        orderBy: [{ legalName: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
      include: companyInclude,
    });
    if (!company) throw new NotFoundException("Company not found");
    return company;
  }

  async update(id: string, input: v1.finance.UpdateCompanyInput) {
    await this.get(id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.update({
          where: { id },
          data: companyData(input),
          include: companyInclude,
        });
        if (input.isActive !== undefined) {
          await tx.counterparty.update({
            where: { companyId: id },
            data: { isActive: input.isActive },
          });
        }
        return company;
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  private handleWriteError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException(
        "A company with this tax identifier already exists",
      );
    }
    throw error;
  }
}

function createCompanyData(input: v1.finance.CreateCompanyInput) {
  return { ...companyData(input), legalName: input.legalName };
}

function companyData(
  input: v1.finance.UpdateCompanyInput | v1.finance.CreateCompanyInput,
) {
  const data = { ...input };
  return {
    ...data,
    ...(input.phone !== undefined
      ? { phone: input.phone, phoneNormalized: normalizePhone(input.phone) }
      : {}),
    ...(input.taxIdentifier !== undefined
      ? {
          taxIdentifier: input.taxIdentifier,
          taxIdentifierNormalized: normalizeTaxIdentifier(input.taxIdentifier),
        }
      : {}),
  };
}

function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits || null;
}

function normalizeTaxIdentifier(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized || null;
}
