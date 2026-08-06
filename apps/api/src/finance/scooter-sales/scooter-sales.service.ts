import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import {
  BillingStatus,
  CounterpartyType,
  MoneyTransactionScope,
  MoneyTransactionStatus,
  MoneyTransactionType,
  Prisma,
  ScooterSaleStatus,
  WalletBalanceBucket,
  WalletType,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  scooterSaleInclude,
  toScooterSale,
  type ScooterSaleRecord,
} from "./scooter-sale.mapper";

const SERIALIZABLE_ATTEMPTS = 3;
const SCOOTER_SALE_REFERENCE_TYPE = "SCOOTER_SALE";

interface ScooterSaleContext {
  actorUserId: string;
}

interface ResolvedBuyer {
  userId: string;
  walletId: string;
}

@Injectable()
export class ScooterSalesService {
  constructor(private readonly prisma: PrismaService) {}

  async createSale(
    input: v1.finance.CreateScooterSaleInput,
    context: ScooterSaleContext,
  ): Promise<v1.finance.ScooterSale> {
    try {
      const created = await this.runSerializable(async (tx) => {
        const scooter = await tx.scooter.findFirst({
          where: { id: input.scooterId, deletedAt: null },
          select: { id: true },
        });
        if (!scooter) {
          throw new BadRequestException(
            "Scooter is not active and cannot be sold",
          );
        }

        // The schema allows at most one ScooterSale row per scooter, ever
        // (scooterId is a hard-unique column, not scoped to active status).
        // A cancelled sale still occupies that slot, so it blocks a re-sale
        // in this compact v1 rather than freeing the scooter back up.
        const existingSale = await tx.scooterSale.findUnique({
          where: { scooterId: input.scooterId },
          select: { status: true },
        });
        if (existingSale) {
          throw new ConflictException(
            existingSale.status === ScooterSaleStatus.CANCELLED
              ? "This scooter already has a cancelled sale record; it cannot be sold again"
              : "This scooter already has an active sale",
          );
        }

        const buyer = await this.resolveBuyer(tx, input.buyerCounterpartyId);
        const saleAmount = new Prisma.Decimal(input.saleAmount);

        const sale = await tx.scooterSale.create({
          data: {
            scooterId: input.scooterId,
            buyerCounterpartyId: input.buyerCounterpartyId,
            saleAmount,
            currency: input.currency,
            soldOn: date(input.soldOn),
            notes: input.notes ?? null,
            createdByUserId: context.actorUserId,
          },
          include: scooterSaleInclude,
        });

        await tx.moneyTransaction.create({
          data: {
            type: MoneyTransactionType.USER_CHARGE,
            status: MoneyTransactionStatus.POSTED,
            amount: saleAmount,
            currency: sale.currency,
            financialScope: MoneyTransactionScope.COMPANY,
            billingStatus: BillingStatus.BILLED,
            counterpartyUserId: buyer.userId,
            recordedByUserId: context.actorUserId,
            occurredAt: sale.soldOn,
            description: input.notes ?? `Scooter sale ${sale.id}`,
            idempotencyKey: `scooter-sale:${sale.id}:charge`,
            balanceChanges: {
              create: {
                walletId: buyer.walletId,
                bucket: WalletBalanceBucket.USER_SETTLEMENT,
                currency: sale.currency,
                amountDelta: saleAmount.negated(),
              },
            },
            references: {
              create: {
                referenceType: SCOOTER_SALE_REFERENCE_TYPE,
                referenceId: sale.id,
                isPrimary: true,
              },
            },
          },
        });
        await this.applyWalletDelta(
          tx,
          buyer.walletId,
          WalletBalanceBucket.USER_SETTLEMENT,
          sale.currency,
          saleAmount.negated(),
        );

        return sale;
      });
      return toScooterSale(created);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async recordPayment(
    scooterSaleId: string,
    input: v1.finance.RecordScooterSalePaymentInput,
    context: ScooterSaleContext,
  ): Promise<v1.finance.ScooterSale> {
    const duplicate = await this.prisma.moneyTransaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { references: true },
    });
    if (duplicate) {
      const belongsToSale = duplicate.references.some(
        (reference) =>
          reference.referenceType === SCOOTER_SALE_REFERENCE_TYPE &&
          reference.referenceId === scooterSaleId,
      );
      if (!belongsToSale) {
        throw new ConflictException(
          "Idempotency key belongs to a different scooter sale payment",
        );
      }
      return this.get(scooterSaleId);
    }

    try {
      const updated = await this.runSerializable(async (tx) => {
        const current = await this.getRecord(tx, scooterSaleId);
        if (current.status === ScooterSaleStatus.CANCELLED) {
          throw new ConflictException(
            "Cannot record a payment against a cancelled sale",
          );
        }
        if (current.status === ScooterSaleStatus.PAID) {
          throw new ConflictException("Sale is already fully paid");
        }

        const amount = new Prisma.Decimal(input.amount);
        const outstanding = current.saleAmount.minus(current.paidAmount);
        if (amount.greaterThan(outstanding)) {
          throw new BadRequestException(
            "Payment amount exceeds the outstanding sale balance",
          );
        }

        const wallet = await tx.wallet.findFirst({
          where: {
            id: input.companyWalletId,
            isActive: true,
            type: { not: WalletType.USER },
          },
          select: { id: true },
        });
        if (!wallet) {
          throw new BadRequestException(
            "Payment wallet must be an active company wallet",
          );
        }

        const buyer = await this.resolveBuyer(tx, current.buyerCounterpartyId);

        await tx.moneyTransaction.create({
          data: {
            type: MoneyTransactionType.USER_PAYMENT,
            status: MoneyTransactionStatus.POSTED,
            amount,
            currency: current.currency,
            financialScope: MoneyTransactionScope.COMPANY,
            paymentMethod: input.paymentMethod,
            billingStatus: BillingStatus.NOT_APPLICABLE,
            counterpartyUserId: buyer.userId,
            recordedByUserId: context.actorUserId,
            occurredAt: date(input.paidOn),
            description:
              input.notes ?? `Payment for scooter sale ${current.id}`,
            idempotencyKey: input.idempotencyKey,
            balanceChanges: {
              create: [
                {
                  walletId: wallet.id,
                  bucket: WalletBalanceBucket.BUSINESS_FUNDS,
                  currency: current.currency,
                  amountDelta: amount,
                },
                {
                  walletId: buyer.walletId,
                  bucket: WalletBalanceBucket.USER_SETTLEMENT,
                  currency: current.currency,
                  amountDelta: amount,
                },
              ],
            },
            references: {
              create: {
                referenceType: SCOOTER_SALE_REFERENCE_TYPE,
                referenceId: current.id,
                isPrimary: true,
              },
            },
          },
        });
        await this.applyWalletDelta(
          tx,
          wallet.id,
          WalletBalanceBucket.BUSINESS_FUNDS,
          current.currency,
          amount,
        );
        await this.applyWalletDelta(
          tx,
          buyer.walletId,
          WalletBalanceBucket.USER_SETTLEMENT,
          current.currency,
          amount,
        );

        const paidAmount = current.paidAmount.plus(amount);
        return tx.scooterSale.update({
          where: { id: current.id },
          data: {
            paidAmount,
            status: paidAmount.greaterThanOrEqualTo(current.saleAmount)
              ? ScooterSaleStatus.PAID
              : ScooterSaleStatus.PARTIALLY_PAID,
          },
          include: scooterSaleInclude,
        });
      });
      return toScooterSale(updated);
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const existing = await this.prisma.moneyTransaction.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: { references: true },
        });
        const belongsToSale = existing?.references.some(
          (reference) =>
            reference.referenceType === SCOOTER_SALE_REFERENCE_TYPE &&
            reference.referenceId === scooterSaleId,
        );
        if (belongsToSale) return this.get(scooterSaleId);
      }
      this.handleWriteError(error);
    }
  }

  async cancelSale(
    scooterSaleId: string,
    input: v1.finance.CancelScooterSaleInput,
    _context: ScooterSaleContext,
  ): Promise<v1.finance.ScooterSale> {
    try {
      const updated = await this.runSerializable(async (tx) => {
        const current = await this.getRecord(tx, scooterSaleId);
        if (current.status === ScooterSaleStatus.CANCELLED) return current;
        if (current.paidAmount.greaterThan(0)) {
          throw new ConflictException(
            "Cannot cancel a scooter sale that already has recorded payments",
          );
        }
        return tx.scooterSale.update({
          where: { id: current.id },
          data: {
            status: ScooterSaleStatus.CANCELLED,
            notes: input.reason
              ? [current.notes, input.reason].filter(Boolean).join(" — ")
              : current.notes,
          },
          include: scooterSaleInclude,
        });
      });
      return toScooterSale(updated);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async get(id: string): Promise<v1.finance.ScooterSale> {
    return toScooterSale(await this.getRecord(this.prisma, id));
  }

  async list(
    query: v1.finance.ListScooterSalesQuery,
  ): Promise<v1.finance.ScooterSaleList> {
    const where: Prisma.ScooterSaleWhereInput = {
      scooterId: query.scooterIds ? { in: query.scooterIds } : query.scooterId,
      buyerCounterpartyId: query.buyerCounterpartyId,
      status: query.status,
    };
    const [total, records] = await this.prisma.$transaction([
      this.prisma.scooterSale.count({ where }),
      this.prisma.scooterSale.findMany({
        where,
        include: scooterSaleInclude,
        orderBy: [{ soldOn: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: records.map(toScooterSale),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getScooterFinancials(
    scooterId: string,
  ): Promise<v1.finance.ScooterFinancials> {
    const scooter = await this.prisma.scooter.findUnique({
      where: { id: scooterId },
      select: { id: true },
    });
    if (!scooter) throw new NotFoundException("Scooter not found");

    const allocations = await this.prisma.expenseScooterAllocation.findMany({
      where: { scooterId, expense: { status: "POSTED" } },
      select: {
        allocatedGrossAmount: true,
        expense: {
          select: {
            currency: true,
            categoryId: true,
            category: { select: { name: true } },
          },
        },
      },
    });

    const breakdown = new Map<
      string,
      {
        categoryId: string | null;
        categoryName: string | null;
        currency: string;
        amount: Prisma.Decimal;
      }
    >();
    for (const allocation of allocations) {
      const key = `${allocation.expense.categoryId ?? ""}:${allocation.expense.currency}`;
      const existing = breakdown.get(key);
      if (existing) {
        existing.amount = existing.amount.plus(allocation.allocatedGrossAmount);
        continue;
      }
      breakdown.set(key, {
        categoryId: allocation.expense.categoryId,
        categoryName: allocation.expense.category?.name ?? null,
        currency: allocation.expense.currency,
        amount: allocation.allocatedGrossAmount,
      });
    }

    const totalsByCurrency = new Map<string, Prisma.Decimal>();
    for (const row of breakdown.values()) {
      totalsByCurrency.set(
        row.currency,
        (totalsByCurrency.get(row.currency) ?? new Prisma.Decimal(0)).plus(
          row.amount,
        ),
      );
    }

    const sale = await this.prisma.scooterSale.findUnique({
      where: { scooterId },
      include: scooterSaleInclude,
    });

    return {
      scooterId,
      costBreakdown: [...breakdown.values()]
        .sort((a, b) =>
          (a.categoryName ?? "").localeCompare(b.categoryName ?? ""),
        )
        .map((row) => ({
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          currency: row.currency,
          totalAllocatedGrossAmount: money(row.amount),
        })),
      totalCost: [...totalsByCurrency.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, amount]) => ({ currency, amount: money(amount) })),
      sale: sale ? toScooterSale(sale) : null,
    };
  }

  private async resolveBuyer(
    tx: Prisma.TransactionClient,
    buyerCounterpartyId: string,
  ): Promise<ResolvedBuyer> {
    const counterparty = await tx.counterparty.findFirst({
      where: {
        id: buyerCounterpartyId,
        type: CounterpartyType.PERSON,
        isActive: true,
        person: { deletedAt: null },
      },
      select: { person: { select: { userId: true } } },
    });
    if (!counterparty?.person) {
      throw new BadRequestException(
        "Buyer must be an active person counterparty",
      );
    }

    const wallet = await tx.wallet.findFirst({
      where: { ownerUserId: counterparty.person.userId, isActive: true },
      select: { id: true },
    });
    if (!wallet) {
      throw new BadRequestException("Buyer does not have an active wallet");
    }

    return { userId: counterparty.person.userId, walletId: wallet.id };
  }

  private async applyWalletDelta(
    tx: Prisma.TransactionClient,
    walletId: string,
    bucket: WalletBalanceBucket,
    currency: string,
    amountDelta: Prisma.Decimal,
  ): Promise<void> {
    await tx.walletBalance.upsert({
      where: { walletId_bucket_currency: { walletId, bucket, currency } },
      create: { walletId, bucket, currency, balance: amountDelta },
      update: { balance: { increment: amountDelta } },
    });
  }

  private async getRecord(
    tx: Prisma.TransactionClient | PrismaService,
    id: string,
  ): Promise<ScooterSaleRecord> {
    const sale = await tx.scooterSale.findUnique({
      where: { id },
      include: scooterSaleInclude,
    });
    if (!sale) throw new NotFoundException("Scooter sale not found");
    return sale;
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
    throw new ConflictException("Could not serialize scooter sale operation");
  }

  private isUniqueConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  private handleWriteError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2004")
    ) {
      throw new ConflictException(
        "Scooter sale operation conflicts with existing data",
      );
    }
    throw error;
  }
}

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}
