import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import {
  CounterpartyType,
  MoneyTransactionStatus,
  MoneyTransactionType,
  Prisma,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeTaxIdentifier } from "./tax-identifier";

const companyInclude = {
  counterparty: { select: { id: true } },
  businessLegalEntity: { select: { id: true } },
} as const;

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

  async softDelete(id: string): Promise<void> {
    await this.get(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      // Keep the counterparty out of pickers, mirroring the isActive cascade
      // in update(). Counterparty rows are never deleted: transactions,
      // expenses and sales reference them with onDelete: Restrict.
      await tx.counterparty.update({
        where: { companyId: id },
        data: { isActive: false },
      });
    });
  }

  async stats(id: string, query: v1.finance.CompanyStatsQuery) {
    const company = await this.get(id);
    if (!company.counterparty) {
      throw new NotFoundException("Company counterparty not found");
    }
    const to = new Date();
    const from = activityPeriodStart(query.period, to);
    const rows = await this.prisma.moneyTransaction.groupBy({
      by: ["type", "currency"],
      where: {
        ...(company.businessLegalEntity
          ? {
              balanceChanges: {
                some: {
                  wallet: {
                    businessLegalEntities: {
                      some: { legalEntityId: company.businessLegalEntity.id },
                    },
                  },
                },
              },
            }
          : { counterpartyId: company.counterparty.id }),
        status: MoneyTransactionStatus.POSTED,
        type: {
          in: [MoneyTransactionType.INCOME, MoneyTransactionType.EXPENSE],
        },
        occurredAt: {
          ...(from ? { gte: from } : {}),
          lt: to,
        },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const totals = new Map<
      string,
      { income: Prisma.Decimal; expenses: Prisma.Decimal }
    >();
    let transactionCount = 0;

    for (const row of rows) {
      transactionCount += row._count._all;
      const total = totals.get(row.currency) ?? {
        income: new Prisma.Decimal(0),
        expenses: new Prisma.Decimal(0),
      };
      const amount = row._sum.amount ?? new Prisma.Decimal(0);
      if (row.type === MoneyTransactionType.INCOME) total.income = amount;
      if (row.type === MoneyTransactionType.EXPENSE) total.expenses = amount;
      totals.set(row.currency, total);
    }

    return {
      period: query.period,
      from: from?.toISOString() ?? null,
      to: to.toISOString(),
      transactionCount,
      totals: [...totals.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, total]) => ({
          currency,
          income: total.income.toFixed(2),
          expenses: total.expenses.toFixed(2),
          net: total.income.minus(total.expenses).toFixed(2),
        })),
    } satisfies v1.finance.CompanyStats;
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

function activityPeriodStart(
  period: v1.finance.CompanyActivityPeriod,
  now: Date,
): Date | null {
  if (period === "ALL") return null;
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  if (period === "WEEK") {
    const dayFromMonday = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - dayFromMonday);
  } else if (period === "MONTH") {
    start.setUTCDate(1);
  } else if (period === "YEAR") {
    start.setUTCMonth(0, 1);
  }
  return start;
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
