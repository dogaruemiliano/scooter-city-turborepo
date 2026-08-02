import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import {
  CounterpartyType,
  Prisma,
  WalletType,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { normalizeTaxIdentifier } from "../tax-identifier";
import {
  businessLegalEntityInclude,
  businessOwnerInclude,
  toBusinessLegalEntity,
  toBusinessOwner,
  toVatRegistrationPeriod,
} from "./expense.mapper";

const SERIALIZABLE_ATTEMPTS = 3;

@Injectable()
export class BusinessLegalEntitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: v1.finance.CreateBusinessLegalEntityInput,
  ): Promise<v1.finance.BusinessLegalEntity> {
    try {
      const entity = await this.runSerializable(async (tx) => {
        await this.assertWalletAssignments(tx, input.walletIds);
        await this.assertCardHolders(
          tx,
          input.bankAccounts.map((account) => account.cardHolderUserId),
        );
        const companyId = input.companyId
          ? await this.assertLinkableCompany(tx, input.companyId)
          : await this.createCompany(tx, input.company!);

        return tx.businessLegalEntity.create({
          data: {
            companyId,
            defaultCurrency: input.defaultCurrency,
            wallets: {
              create: [
                ...[...new Set(input.walletIds)].map((walletId) => ({
                  wallet: { connect: { id: walletId } },
                })),
                {
                  wallet: {
                    create: {
                      type: WalletType.COMPANY_CASH,
                      name: "Caserie",
                    },
                  },
                },
                ...input.bankAccounts.map((account) => ({
                  wallet: {
                    create: {
                      type: WalletType.COMPANY_BANK,
                      name: account.name,
                      cardHolderUserId: account.cardHolderUserId,
                    },
                  },
                })),
              ],
            },
          },
          include: businessLegalEntityInclude,
        });
      });
      return toBusinessLegalEntity(entity);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async list(
    includeInactive = false,
  ): Promise<v1.finance.BusinessLegalEntityList> {
    const entities = await this.prisma.businessLegalEntity.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: businessLegalEntityInclude,
      orderBy: [{ company: { legalName: "asc" } }, { id: "asc" }],
    });
    return { items: entities.map(toBusinessLegalEntity) };
  }

  async get(id: string): Promise<v1.finance.BusinessLegalEntity> {
    return toBusinessLegalEntity(await this.getRecord(this.prisma, id));
  }

  async update(
    id: string,
    input: v1.finance.UpdateBusinessLegalEntityInput,
  ): Promise<v1.finance.BusinessLegalEntity> {
    try {
      const entity = await this.runSerializable(async (tx) => {
        await this.getRecord(tx, id);
        if (input.walletIds) {
          await this.assertWalletAssignments(tx, input.walletIds, id);
          await this.assertReferencedWalletsRetained(tx, id, input.walletIds);
          await tx.businessLegalEntityWallet.deleteMany({
            where: { legalEntityId: id },
          });
          if (input.walletIds.length > 0) {
            await tx.businessLegalEntityWallet.createMany({
              data: [...new Set(input.walletIds)].map((walletId) => ({
                legalEntityId: id,
                walletId,
              })),
            });
          }
        }
        return tx.businessLegalEntity.update({
          where: { id },
          data: {
            defaultCurrency: input.defaultCurrency,
            isActive: input.isActive,
          },
          include: businessLegalEntityInclude,
        });
      });
      return toBusinessLegalEntity(entity);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async listUserOptions(
    query: v1.finance.ListExpenseUserOptionsQuery,
  ): Promise<v1.finance.ExpenseUserOptionList> {
    const search = query.search;
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(query.purpose === "PAYMENT_ACTOR"
          ? { roles: { has: "ADMIN" } }
          : {}),
        ...(search
          ? {
              OR: [
                { email: { contains: search, mode: "insensitive" as const } },
                {
                  firstName: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
                {
                  lastName: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              ],
            }
          : {}),
      },
      select: { id: true, email: true, firstName: true, lastName: true },
      orderBy: [
        { lastName: "asc" },
        { firstName: "asc" },
        { email: "asc" },
        { id: "asc" },
      ],
      take: query.pageSize + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = users.length > query.pageSize;
    const items = hasMore ? users.slice(0, query.pageSize) : users;
    return {
      items,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    };
  }

  private async assertCardHolders(
    tx: Prisma.TransactionClient,
    userIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length === 0) return;
    const count = await tx.user.count({
      where: { id: { in: uniqueIds }, deletedAt: null },
    });
    if (count !== uniqueIds.length) {
      throw new BadRequestException(
        "One or more card holders are not active application users",
      );
    }
  }

  async createOwner(
    legalEntityId: string,
    input: v1.finance.CreateBusinessOwnerInput,
  ): Promise<v1.finance.BusinessOwner> {
    try {
      const owner = await this.runSerializable(async (tx) => {
        await this.assertEntityAndUser(tx, legalEntityId, input.userId);
        const from = date(input.effectiveFrom);
        const to = input.effectiveTo ? date(input.effectiveTo) : null;
        await this.assertOwnerRangeAvailable(
          tx,
          legalEntityId,
          input.userId,
          from,
          to,
        );
        return tx.businessOwner.create({
          data: {
            legalEntityId,
            userId: input.userId,
            effectiveFrom: from,
            effectiveTo: to,
          },
          include: businessOwnerInclude,
        });
      });
      return toBusinessOwner(owner);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async listOwners(
    legalEntityId: string,
    on?: string,
    includeInactive = false,
  ): Promise<v1.finance.BusinessOwnerList> {
    await this.getRecord(this.prisma, legalEntityId);
    const effectiveOn = on ? date(on) : null;
    const owners = await this.prisma.businessOwner.findMany({
      where: {
        legalEntityId,
        ...(effectiveOn
          ? {
              effectiveFrom: { lte: effectiveOn },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveOn } }],
            }
          : {}),
        ...(!includeInactive ? { user: { deletedAt: null } } : {}),
      },
      include: businessOwnerInclude,
      orderBy: [
        { user: { lastName: "asc" } },
        { user: { firstName: "asc" } },
        { effectiveFrom: "desc" },
      ],
    });
    return { items: owners.map(toBusinessOwner) };
  }

  async updateOwner(
    legalEntityId: string,
    ownerId: string,
    input: v1.finance.UpdateBusinessOwnerInput,
  ): Promise<v1.finance.BusinessOwner> {
    try {
      const owner = await this.runSerializable(async (tx) => {
        const current = await tx.businessOwner.findFirst({
          where: { id: ownerId, legalEntityId },
        });
        if (!current) throw new NotFoundException("Business owner not found");
        const from = input.effectiveFrom
          ? date(input.effectiveFrom)
          : current.effectiveFrom;
        const to =
          input.effectiveTo === undefined
            ? current.effectiveTo
            : input.effectiveTo
              ? date(input.effectiveTo)
              : null;
        if (to && to <= from) {
          throw new BadRequestException(
            "Owner effectiveTo must be after effectiveFrom",
          );
        }
        await this.assertOwnerRangeAvailable(
          tx,
          legalEntityId,
          current.userId,
          from,
          to,
          ownerId,
        );
        await this.assertOwnerHistoryPreserved(tx, ownerId, from, to);
        return tx.businessOwner.update({
          where: { id: ownerId },
          data: { effectiveFrom: from, effectiveTo: to },
          include: businessOwnerInclude,
        });
      });
      return toBusinessOwner(owner);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async deleteOwner(legalEntityId: string, ownerId: string): Promise<void> {
    await this.runSerializable(async (tx) => {
      const owner = await tx.businessOwner.findFirst({
        where: { id: ownerId, legalEntityId },
        select: { id: true },
      });
      if (!owner) throw new NotFoundException("Business owner not found");
      const attribution = await tx.expenseCostAttribution.findFirst({
        where: { businessOwnerId: ownerId },
        select: { id: true },
      });
      if (attribution) {
        throw new ConflictException(
          "A business owner used by an expense cannot be deleted",
        );
      }
      await tx.businessOwner.delete({ where: { id: ownerId } });
    });
  }

  async createVatPeriod(
    legalEntityId: string,
    input: v1.finance.CreateVatRegistrationPeriodInput,
  ): Promise<v1.finance.VatRegistrationPeriod> {
    try {
      const period = await this.runSerializable(async (tx) => {
        await this.getRecord(tx, legalEntityId);
        const from = date(input.effectiveFrom);
        const to = input.effectiveTo ? date(input.effectiveTo) : null;
        await this.assertVatRangeAvailable(tx, legalEntityId, from, to);
        await this.assertVatHistoryPreserved(
          tx,
          legalEntityId,
          null,
          from,
          to,
          input.countryCode,
          input.vatNumber,
        );
        return tx.vatRegistrationPeriod.create({
          data: {
            legalEntityId,
            countryCode: input.countryCode,
            vatNumber: input.vatNumber,
            effectiveFrom: from,
            effectiveTo: to,
          },
        });
      });
      return toVatRegistrationPeriod(period);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async listVatPeriods(
    legalEntityId: string,
    on?: string,
  ): Promise<v1.finance.VatRegistrationPeriodList> {
    await this.getRecord(this.prisma, legalEntityId);
    const effectiveOn = on ? date(on) : null;
    const periods = await this.prisma.vatRegistrationPeriod.findMany({
      where: {
        legalEntityId,
        ...(effectiveOn
          ? {
              effectiveFrom: { lte: effectiveOn },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveOn } }],
            }
          : {}),
      },
      orderBy: [{ effectiveFrom: "desc" }, { id: "asc" }],
    });
    return { items: periods.map(toVatRegistrationPeriod) };
  }

  async updateVatPeriod(
    legalEntityId: string,
    periodId: string,
    input: v1.finance.UpdateVatRegistrationPeriodInput,
  ): Promise<v1.finance.VatRegistrationPeriod> {
    try {
      const period = await this.runSerializable(async (tx) => {
        const current = await tx.vatRegistrationPeriod.findFirst({
          where: { id: periodId, legalEntityId },
        });
        if (!current)
          throw new NotFoundException("VAT registration period not found");
        const from = input.effectiveFrom
          ? date(input.effectiveFrom)
          : current.effectiveFrom;
        const to =
          input.effectiveTo === undefined
            ? current.effectiveTo
            : input.effectiveTo
              ? date(input.effectiveTo)
              : null;
        if (to && to <= from) {
          throw new BadRequestException(
            "VAT effectiveTo must be after effectiveFrom",
          );
        }
        await this.assertVatRangeAvailable(
          tx,
          legalEntityId,
          from,
          to,
          periodId,
        );
        await this.assertVatHistoryPreserved(
          tx,
          legalEntityId,
          periodId,
          from,
          to,
          input.countryCode ?? current.countryCode,
          input.vatNumber ?? current.vatNumber,
        );
        return tx.vatRegistrationPeriod.update({
          where: { id: periodId },
          data: {
            countryCode: input.countryCode,
            vatNumber: input.vatNumber,
            effectiveFrom: from,
            effectiveTo: to,
          },
        });
      });
      return toVatRegistrationPeriod(period);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async deleteVatPeriod(
    legalEntityId: string,
    periodId: string,
  ): Promise<void> {
    await this.runSerializable(async (tx) => {
      const period = await tx.vatRegistrationPeriod.findFirst({
        where: { id: periodId, legalEntityId },
        select: { id: true },
      });
      if (!period) {
        throw new NotFoundException("VAT registration period not found");
      }
      const snapshot = await tx.expenseTaxSnapshot.findFirst({
        where: { vatRegistrationPeriodId: periodId },
        select: { id: true },
      });
      if (snapshot) {
        throw new ConflictException(
          "A VAT period used by an expense snapshot cannot be deleted",
        );
      }
      await tx.vatRegistrationPeriod.delete({ where: { id: periodId } });
    });
  }

  private async getRecord(
    tx: Prisma.TransactionClient | PrismaService,
    id: string,
  ) {
    const entity = await tx.businessLegalEntity.findUnique({
      where: { id },
      include: businessLegalEntityInclude,
    });
    if (!entity) throw new NotFoundException("Business legal entity not found");
    return entity;
  }

  private async assertLinkableCompany(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<string> {
    const company = await tx.company.findFirst({
      where: { id: companyId, deletedAt: null, isActive: true },
      select: {
        id: true,
        taxIdentifier: true,
        businessLegalEntity: { select: { id: true } },
      },
    });
    if (!company) throw new BadRequestException("Company is not active");
    if (!normalizeTaxIdentifier(company.taxIdentifier)) {
      throw new BadRequestException(
        "A business legal entity company requires a tax identifier",
      );
    }
    if (company.businessLegalEntity) {
      throw new ConflictException("Company is already a business legal entity");
    }
    return company.id;
  }

  private async createCompany(
    tx: Prisma.TransactionClient,
    input: v1.finance.CreateCompanyInput,
  ): Promise<string> {
    if (!normalizeTaxIdentifier(input.taxIdentifier)) {
      throw new BadRequestException(
        "A business legal entity company requires a tax identifier",
      );
    }
    const company = await tx.company.create({
      data: {
        ...input,
        phoneNormalized: normalizePhone(input.phone),
        taxIdentifierNormalized: normalizeTaxIdentifier(input.taxIdentifier),
        counterparty: { create: { type: CounterpartyType.COMPANY } },
      },
      select: { id: true },
    });
    return company.id;
  }

  private async assertWalletAssignments(
    tx: Prisma.TransactionClient,
    walletIds: string[],
    currentEntityId?: string,
  ): Promise<void> {
    const uniqueIds = [...new Set(walletIds)];
    if (uniqueIds.length !== walletIds.length) {
      throw new BadRequestException("Wallet assignments must be unique");
    }
    const wallets = await tx.wallet.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        type: true,
        isActive: true,
        businessLegalEntities: { select: { legalEntityId: true } },
      },
    });
    if (wallets.length !== uniqueIds.length) {
      throw new BadRequestException("One or more wallets do not exist");
    }
    for (const wallet of wallets) {
      if (!wallet.isActive || wallet.type === WalletType.USER) {
        throw new BadRequestException(
          "Only active company wallets can be assigned",
        );
      }
      const foreignAssignment = wallet.businessLegalEntities.find(
        (assignment) => assignment.legalEntityId !== currentEntityId,
      );
      if (foreignAssignment) {
        throw new ConflictException(
          "A company wallet can belong to only one business legal entity",
        );
      }
    }
  }

  private async assertReferencedWalletsRetained(
    tx: Prisma.TransactionClient,
    legalEntityId: string,
    requestedWalletIds: string[],
  ): Promise<void> {
    const retainedWalletIds = [...new Set(requestedWalletIds)];
    const referencedPayment = await tx.expensePayment.findFirst({
      where: {
        expense: { legalEntityId },
        companyWalletId: {
          not: null,
          ...(retainedWalletIds.length > 0 ? { notIn: retainedWalletIds } : {}),
        },
      },
      select: { companyWalletId: true },
    });
    const referencedSettlement =
      await tx.expenseReimbursementSettlement.findFirst({
        where: {
          claim: { legalEntityId },
          companyWalletId:
            retainedWalletIds.length > 0
              ? { notIn: retainedWalletIds }
              : undefined,
        },
        select: { companyWalletId: true },
      });
    if (referencedPayment || referencedSettlement) {
      throw new ConflictException(
        "A wallet referenced by an expense payment cannot be removed or reassigned",
      );
    }
  }

  private async assertEntityAndUser(
    tx: Prisma.TransactionClient,
    legalEntityId: string,
    userId: string,
  ): Promise<void> {
    const [entity, user] = await Promise.all([
      tx.businessLegalEntity.findUnique({
        where: { id: legalEntityId },
        select: { id: true },
      }),
      tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (!entity) throw new NotFoundException("Business legal entity not found");
    if (!user)
      throw new BadRequestException("Business owner user is not active");
  }

  private async assertOwnerRangeAvailable(
    tx: Prisma.TransactionClient,
    legalEntityId: string,
    userId: string,
    from: Date,
    to: Date | null,
    excludeId?: string,
  ): Promise<void> {
    const overlap = await tx.businessOwner.findFirst({
      where: {
        legalEntityId,
        userId,
        id: excludeId ? { not: excludeId } : undefined,
        effectiveFrom: to ? { lt: to } : undefined,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: from } }],
      },
      select: { id: true },
    });
    if (overlap) {
      throw new ConflictException("Business owner periods cannot overlap");
    }
  }

  private async assertVatRangeAvailable(
    tx: Prisma.TransactionClient,
    legalEntityId: string,
    from: Date,
    to: Date | null,
    excludeId?: string,
  ): Promise<void> {
    const overlap = await tx.vatRegistrationPeriod.findFirst({
      where: {
        legalEntityId,
        id: excludeId ? { not: excludeId } : undefined,
        effectiveFrom: to ? { lt: to } : undefined,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: from } }],
      },
      select: { id: true },
    });
    if (overlap) {
      throw new ConflictException("VAT registration periods cannot overlap");
    }
  }

  private async assertOwnerHistoryPreserved(
    tx: Prisma.TransactionClient,
    ownerId: string,
    from: Date,
    to: Date | null,
  ): Promise<void> {
    const usedDates = await tx.expenseCostAttribution.findMany({
      where: {
        businessOwnerId: ownerId,
        costPool: {
          expense: { status: { in: ["POSTED", "REVERSED"] } },
        },
      },
      select: {
        costPool: { select: { expense: { select: { occurredOn: true } } } },
      },
    });
    const invalid = usedDates.some(({ costPool }) => {
      const occurredOn = costPool.expense.occurredOn;
      return occurredOn < from || (to !== null && occurredOn >= to);
    });
    if (invalid) {
      throw new ConflictException(
        "Owner effective dates cannot invalidate a posted expense",
      );
    }
  }

  private async assertVatHistoryPreserved(
    tx: Prisma.TransactionClient,
    legalEntityId: string,
    periodId: string | null,
    from: Date,
    to: Date | null,
    countryCode: string,
    vatNumber: string,
  ): Promise<void> {
    const historicalInRange = await tx.expense.findMany({
      where: {
        legalEntityId,
        status: { in: ["POSTED", "REVERSED"] },
        taxPointOn: { gte: from, ...(to ? { lt: to } : {}) },
      },
      select: {
        taxSnapshot: {
          select: {
            vatRegistrationPeriodId: true,
            vatRegistrationCountryCode: true,
            vatRegistrationNumber: true,
          },
        },
      },
    });
    if (
      (periodId === null && historicalInRange.length > 0) ||
      historicalInRange.some(
        ({ taxSnapshot }) => taxSnapshot?.vatRegistrationPeriodId !== periodId,
      )
    ) {
      throw new ConflictException(
        "VAT period changes cannot alter a posted expense's registration status",
      );
    }

    if (!periodId) return;
    const referenced = await tx.expenseTaxSnapshot.findMany({
      where: {
        vatRegistrationPeriodId: periodId,
        expense: { status: { in: ["POSTED", "REVERSED"] } },
      },
      select: {
        taxPointOn: true,
        vatRegistrationCountryCode: true,
        vatRegistrationNumber: true,
      },
    });
    const invalidReference = referenced.some(
      (snapshot) =>
        snapshot.taxPointOn < from ||
        (to !== null && snapshot.taxPointOn >= to) ||
        snapshot.vatRegistrationCountryCode !== countryCode ||
        snapshot.vatRegistrationNumber !== vatNumber,
    );
    if (invalidReference) {
      throw new ConflictException(
        "VAT period changes cannot invalidate a posted tax snapshot",
      );
    }
  }

  private async runSerializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 10_000,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < SERIALIZABLE_ATTEMPTS
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException("Could not serialize legal entity update");
  }

  private handleWriteError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2004")
    ) {
      throw new ConflictException(
        "Legal entity configuration conflicts with existing data",
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      throw new ConflictException("Referenced configuration is already in use");
    }
    throw error;
  }
}

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/\D/gu, "") || null;
}
