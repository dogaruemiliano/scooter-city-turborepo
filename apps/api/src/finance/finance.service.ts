import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { AuditService } from "../audit/audit.service";
import { AuditEventType } from "../audit/audit.types";
import type { AuthPrincipal } from "../auth/auth.types";
import type { RequestMetadata } from "../common/http/request-metadata";
import type {
  FinancialCategory,
  Prisma,
  WalletBalanceChange,
} from "../generated/prisma/client";
import {
  BillingStatus,
  MoneyTransactionScope,
  MoneyTransactionStatus,
  MoneyTransactionType,
  Prisma as PrismaRuntime,
  WalletBalanceBucket,
  WalletType,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type {
  MoneyTransactionWithDetails,
  WalletWithDetails,
} from "./finance.mapper";

const FINANCIAL_TRANSACTION_AUDIT_TARGET = "moneyTransaction";
const FINANCIAL_WALLET_AUDIT_TARGET = "wallet";
const FINANCIAL_CATEGORY_AUDIT_TARGET = "financialCategory";
const SERIALIZABLE_ATTEMPTS = 3;

type FinancialContext = RequestMetadata & { actor: AuthPrincipal };

interface ClaimAggregate {
  debtorUserId: string;
  creditorUserId: string;
  currency: string;
  amount: Prisma.Decimal;
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createCompanyWallet(
    input: v1.finance.CreateCompanyWalletInput,
    context: FinancialContext,
  ): Promise<WalletWithDetails> {
    const wallet = await this.prisma.$transaction(async (tx) => {
      const created = await tx.wallet.create({
        data: {
          type: input.type,
          name: input.name,
        },
        include: this.walletInclude(),
      });
      await this.audit.recordRequired(tx, {
        type: AuditEventType.FINANCIAL_WALLET_CREATED,
        userId: context.actor.id,
        targetType: FINANCIAL_WALLET_AUDIT_TARGET,
        targetId: created.id,
        ip: context.ip,
        userAgent: context.userAgent,
        meta: { walletType: created.type, name: created.name },
      });
      return created;
    });
    return wallet;
  }

  listWallets(): Promise<WalletWithDetails[]> {
    return this.prisma.wallet.findMany({
      include: this.walletInclude(),
      orderBy: [{ type: "asc" }, { name: "asc" }, { id: "asc" }],
    });
  }

  async getWallet(id: string): Promise<WalletWithDetails> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id },
      include: this.walletInclude(),
    });
    if (!wallet) throw new NotFoundException("Wallet not found");
    return wallet;
  }

  async getUserWallet(userId: string): Promise<WalletWithDetails> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { ownerUserId: userId },
      include: this.walletInclude(),
    });
    if (!wallet) throw new NotFoundException("User wallet not found");
    return wallet;
  }

  listCategories(): Promise<FinancialCategory[]> {
    return this.prisma.financialCategory.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  async createCategory(
    input: v1.finance.CreateFinancialCategoryInput,
    context: FinancialContext,
  ): Promise<FinancialCategory> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertCategoryParent(tx, input.parentCategoryId ?? null);
        const category = await tx.financialCategory.create({
          data: {
            code: input.code,
            name: input.name,
            kind: input.kind,
            parentCategoryId: input.parentCategoryId ?? null,
          },
        });
        await this.audit.recordRequired(tx, {
          type: AuditEventType.FINANCIAL_CATEGORY_CREATED,
          userId: context.actor.id,
          targetType: FINANCIAL_CATEGORY_AUDIT_TARGET,
          targetId: category.id,
          ip: context.ip,
          userAgent: context.userAgent,
          meta: { code: category.code, kind: category.kind },
        });
        return category;
      });
    } catch (error) {
      this.handleCategoryWriteError(error);
    }
  }

  async updateCategory(
    id: string,
    input: v1.finance.UpdateFinancialCategoryInput,
    context: FinancialContext,
  ): Promise<FinancialCategory> {
    const category = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.financialCategory.findUnique({
        where: { id },
      });
      if (!existing)
        throw new NotFoundException("Financial category not found");
      if (input.parentCategoryId === id) {
        throw new BadRequestException("A category cannot be its own parent");
      }
      if (input.parentCategoryId !== undefined) {
        await this.assertCategoryParent(tx, input.parentCategoryId);
      }

      const updated = await tx.financialCategory.update({
        where: { id },
        data: input,
      });
      await this.audit.recordRequired(tx, {
        type: AuditEventType.FINANCIAL_CATEGORY_UPDATED,
        userId: context.actor.id,
        targetType: FINANCIAL_CATEGORY_AUDIT_TARGET,
        targetId: id,
        ip: context.ip,
        userAgent: context.userAgent,
        meta: { code: updated.code },
      });
      return updated;
    });
    return category;
  }

  async createTransaction(
    input: v1.finance.CreateMoneyTransactionInput,
    context: FinancialContext,
  ): Promise<MoneyTransactionWithDetails> {
    const existing = await this.findTransactionByIdempotencyKey(
      input.idempotencyKey,
    );
    if (existing) return existing;

    try {
      return await this.runSerializable(async (tx) => {
        await this.validateTransactionInput(tx, input);
        const created = await tx.moneyTransaction.create({
          data: {
            type: input.type,
            status: MoneyTransactionStatus.DRAFT,
            amount: new PrismaRuntime.Decimal(input.amount),
            currency: input.currency,
            financialScope: input.financialScope,
            paymentMethod: input.paymentMethod ?? null,
            billingStatus: input.billingStatus,
            categoryId: input.categoryId ?? null,
            counterpartyUserId: input.counterpartyUserId ?? null,
            recipientUserId: input.recipientUserId ?? null,
            debtorUserId: input.debtorUserId ?? null,
            creditorUserId: input.creditorUserId ?? null,
            recordedByUserId: context.actor.id,
            occurredAt: input.occurredAt
              ? new Date(input.occurredAt)
              : new Date(),
            description: input.description ?? null,
            idempotencyKey: input.idempotencyKey,
            balanceChanges: {
              create: input.balanceChanges.map((change) => ({
                walletId: change.walletId,
                bucket: change.bucket,
                currency: change.currency,
                amountDelta: new PrismaRuntime.Decimal(change.amountDelta),
              })),
            },
            references: {
              create: input.references.map((reference) => ({
                referenceType: reference.referenceType,
                referenceId: reference.referenceId,
                isPrimary: reference.isPrimary,
              })),
            },
          },
          include: this.transactionInclude(),
        });

        if (!input.postImmediately) {
          await this.recordTransactionAudit(
            tx,
            AuditEventType.MONEY_TRANSACTION_CREATED,
            created,
            context,
          );
          return created;
        }

        return this.postTransactionInTx(tx, created.id, context);
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const duplicate = await this.findTransactionByIdempotencyKey(
          input.idempotencyKey,
        );
        if (duplicate) return duplicate;
      }
      throw error;
    }
  }

  async postTransaction(
    id: string,
    context: FinancialContext,
  ): Promise<MoneyTransactionWithDetails> {
    return this.runSerializable((tx) =>
      this.postTransactionInTx(tx, id, context),
    );
  }

  async reverseTransaction(
    id: string,
    input: v1.finance.ReverseMoneyTransactionInput,
    context: FinancialContext,
  ): Promise<MoneyTransactionWithDetails> {
    const duplicate = await this.findTransactionByIdempotencyKey(
      input.idempotencyKey,
    );
    if (duplicate) {
      if (
        duplicate.type !== MoneyTransactionType.REVERSAL ||
        duplicate.reversalOfTransactionId !== id
      ) {
        throw new ConflictException(
          "Idempotency key belongs to a different transaction",
        );
      }
      return duplicate;
    }

    return this.runSerializable(async (tx) => {
      const original = await tx.moneyTransaction.findUnique({
        where: { id },
        include: this.transactionInclude(),
      });
      if (!original) throw new NotFoundException("Money transaction not found");
      if (original.status !== MoneyTransactionStatus.POSTED) {
        throw new ConflictException(
          "Only a posted transaction can be reversed",
        );
      }
      if (original.type === MoneyTransactionType.PERSONAL_FUNDS_CLAIM) {
        throw new BadRequestException(
          "Generated personal claims are reversed through their origin",
        );
      }
      if (
        original.type === MoneyTransactionType.INCOME &&
        original.financialScope === MoneyTransactionScope.ADMIN_PERSONAL
      ) {
        await this.assertPersonalIncomeCanBeReversed(tx, original);
      }

      const reversal = await tx.moneyTransaction.create({
        data: {
          type: MoneyTransactionType.REVERSAL,
          status: MoneyTransactionStatus.DRAFT,
          amount: original.amount,
          currency: original.currency,
          financialScope: original.financialScope,
          billingStatus: BillingStatus.NOT_APPLICABLE,
          recordedByUserId: context.actor.id,
          occurredAt: new Date(),
          description:
            input.description ?? `Reversal of transaction ${original.id}`,
          idempotencyKey: input.idempotencyKey,
          reversalOfTransactionId: original.id,
          balanceChanges: {
            create: original.balanceChanges.map((change) => ({
              walletId: change.walletId,
              bucket: change.bucket,
              currency: change.currency,
              amountDelta: change.amountDelta.negated(),
            })),
          },
        },
      });

      const postedReversal = await this.postTransactionInTx(
        tx,
        reversal.id,
        context,
        false,
      );
      await tx.moneyTransaction.update({
        where: { id: original.id },
        data: { status: MoneyTransactionStatus.REVERSED },
      });
      await tx.moneyTransaction.updateMany({
        where: {
          originTransactionId: original.id,
          type: MoneyTransactionType.PERSONAL_FUNDS_CLAIM,
          status: MoneyTransactionStatus.POSTED,
        },
        data: { status: MoneyTransactionStatus.REVERSED },
      });
      await this.recordTransactionAudit(
        tx,
        AuditEventType.MONEY_TRANSACTION_REVERSED,
        original,
        context,
        { reversalTransactionId: postedReversal.id },
      );
      return postedReversal;
    });
  }

  async getTransaction(id: string): Promise<MoneyTransactionWithDetails> {
    const transaction = await this.prisma.moneyTransaction.findUnique({
      where: { id },
      include: this.transactionInclude(),
    });
    if (!transaction) {
      throw new NotFoundException("Money transaction not found");
    }
    return transaction;
  }

  async listTransactions(
    query: v1.finance.ListMoneyTransactionsQuery,
  ): Promise<{
    items: MoneyTransactionWithDetails[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const where = this.transactionWhere(query);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.moneyTransaction.count({ where }),
      this.prisma.moneyTransaction.findMany({
        where,
        include: this.transactionInclude(),
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async listOutstandingClaims(): Promise<
    v1.finance.OutstandingPersonalClaim[]
  > {
    const [claims, settlements] = await Promise.all([
      this.claimAggregates(MoneyTransactionType.PERSONAL_FUNDS_CLAIM),
      this.settlementAggregates(),
    ]);
    const netByPair = new Map<
      string,
      {
        firstUserId: string;
        secondUserId: string;
        currency: string;
        amount: Prisma.Decimal;
      }
    >();

    const add = (row: ClaimAggregate, multiplier: 1 | -1): void => {
      const [firstUserId, secondUserId] = [
        row.debtorUserId,
        row.creditorUserId,
      ].sort();
      const key = `${firstUserId}:${secondUserId}:${row.currency}`;
      const direction = row.debtorUserId === firstUserId ? 1 : -1;
      const signedAmount = row.amount.times(direction * multiplier);
      const existing = netByPair.get(key);
      if (existing) {
        existing.amount = existing.amount.plus(signedAmount);
        return;
      }
      netByPair.set(key, {
        firstUserId,
        secondUserId,
        currency: row.currency,
        amount: signedAmount,
      });
    };

    claims.forEach((claim) => add(claim, 1));
    settlements.forEach((settlement) => add(settlement, -1));

    return [...netByPair.entries()]
      .filter(([, balance]) => !balance.amount.isZero())
      .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
      .map(([, balance]) => {
        const firstOwesSecond = balance.amount.greaterThan(0);
        return {
          debtorUserId: firstOwesSecond
            ? balance.firstUserId
            : balance.secondUserId,
          creditorUserId: firstOwesSecond
            ? balance.secondUserId
            : balance.firstUserId,
          currency: balance.currency,
          amount: balance.amount.abs().toFixed(2),
        };
      });
  }

  private async postTransactionInTx(
    tx: Prisma.TransactionClient,
    id: string,
    context: FinancialContext,
    generateClaims = true,
  ): Promise<MoneyTransactionWithDetails> {
    const transaction = await tx.moneyTransaction.findUnique({
      where: { id },
      include: this.transactionInclude(),
    });
    if (!transaction)
      throw new NotFoundException("Money transaction not found");
    if (transaction.status === MoneyTransactionStatus.POSTED)
      return transaction;
    if (transaction.status !== MoneyTransactionStatus.DRAFT) {
      throw new ConflictException("Transaction cannot be posted");
    }
    if (transaction.type === MoneyTransactionType.PERSONAL_FUNDS_SPLIT) {
      await this.assertSplitDoesNotExceedOutstanding(tx, transaction);
    }

    for (const change of this.sortedBalanceChanges(
      transaction.balanceChanges,
    )) {
      await tx.walletBalance.upsert({
        where: {
          walletId_bucket_currency: {
            walletId: change.walletId,
            bucket: change.bucket,
            currency: change.currency,
          },
        },
        create: {
          walletId: change.walletId,
          bucket: change.bucket,
          currency: change.currency,
          balance: change.amountDelta,
        },
        update: {
          balance: { increment: change.amountDelta },
        },
      });
    }

    const posted = await tx.moneyTransaction.update({
      where: { id },
      data: { status: MoneyTransactionStatus.POSTED },
      include: this.transactionInclude(),
    });

    const generatedClaimIds =
      generateClaims &&
      posted.type === MoneyTransactionType.INCOME &&
      posted.financialScope === MoneyTransactionScope.ADMIN_PERSONAL
        ? await this.generatePersonalClaims(tx, posted)
        : [];

    await this.recordTransactionAudit(
      tx,
      AuditEventType.MONEY_TRANSACTION_POSTED,
      posted,
      context,
      { generatedClaimIds },
    );
    return posted;
  }

  private async generatePersonalClaims(
    tx: Prisma.TransactionClient,
    origin: MoneyTransactionWithDetails,
  ): Promise<string[]> {
    const personalChange = origin.balanceChanges.find(
      (change) =>
        change.bucket === WalletBalanceBucket.ADMIN_PERSONAL_FUNDS &&
        change.amountDelta.greaterThan(0),
    );
    if (!personalChange) {
      throw new BadRequestException(
        "Personal income must increase an admin personal-funds balance",
      );
    }

    const collectorWallet = await tx.wallet.findUnique({
      where: { id: personalChange.walletId },
      select: {
        ownerUserId: true,
        owner: { select: { roles: true, deletedAt: true } },
      },
    });
    const collectorId = collectorWallet?.ownerUserId;
    const collectorOwner = collectorWallet?.owner;
    if (
      !collectorId ||
      !collectorOwner ||
      collectorOwner.deletedAt ||
      !collectorOwner.roles.includes("ADMIN")
    ) {
      throw new BadRequestException(
        "Personal income must be collected into an active admin wallet",
      );
    }

    const admins = await tx.user.findMany({
      where: { roles: { has: "ADMIN" }, deletedAt: null },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    if (!admins.some((admin) => admin.id === collectorId)) {
      throw new BadRequestException("Collector is not an active admin");
    }
    if (admins.length <= 1) return [];

    const totalMinor = this.toMinorUnits(origin.amount);
    const equalShareMinor = totalMinor / BigInt(admins.length);
    if (equalShareMinor === 0n) return [];

    const generatedIds: string[] = [];
    for (const admin of admins) {
      if (admin.id === collectorId) continue;
      const claim = await tx.moneyTransaction.create({
        data: {
          type: MoneyTransactionType.PERSONAL_FUNDS_CLAIM,
          status: MoneyTransactionStatus.POSTED,
          amount: this.fromMinorUnits(equalShareMinor),
          currency: origin.currency,
          financialScope: MoneyTransactionScope.ADMIN_PERSONAL,
          billingStatus: BillingStatus.NOT_APPLICABLE,
          debtorUserId: collectorId,
          creditorUserId: admin.id,
          recordedByUserId: origin.recordedByUserId,
          occurredAt: origin.occurredAt,
          description: `Automatic personal-funds share from ${origin.id}`,
          idempotencyKey: `auto-claim:${origin.id}:${admin.id}`,
          originTransactionId: origin.id,
        },
      });
      generatedIds.push(claim.id);
    }
    return generatedIds;
  }

  private async validateTransactionInput(
    tx: Prisma.TransactionClient,
    input: v1.finance.CreateMoneyTransactionInput,
  ): Promise<void> {
    const amount = new PrismaRuntime.Decimal(input.amount);
    const wallets = await tx.wallet.findMany({
      where: {
        id: {
          in: [...new Set(input.balanceChanges.map((item) => item.walletId))],
        },
      },
      include: { owner: { select: { roles: true, deletedAt: true } } },
    });
    const walletById = new Map(wallets.map((wallet) => [wallet.id, wallet]));
    if (
      wallets.length !==
      new Set(input.balanceChanges.map((item) => item.walletId)).size
    ) {
      throw new BadRequestException("One or more wallets do not exist");
    }

    for (const change of input.balanceChanges) {
      const wallet = walletById.get(change.walletId)!;
      if (!wallet.isActive) {
        throw new BadRequestException("Inactive wallets cannot be changed");
      }
      if (change.currency !== input.currency) {
        throw new BadRequestException(
          "Transaction and balance-change currencies must match",
        );
      }
      if (!new PrismaRuntime.Decimal(change.amountDelta).abs().equals(amount)) {
        throw new BadRequestException(
          "Every balance change must equal the transaction amount",
        );
      }
      this.assertBucketAllowed(wallet.type, wallet.owner, change.bucket);
    }

    if (input.categoryId) {
      const category = await tx.financialCategory.findUnique({
        where: { id: input.categoryId },
      });
      if (!category || !category.isActive) {
        throw new BadRequestException("Financial category is not active");
      }
      if (
        (input.type === MoneyTransactionType.INCOME &&
          category.kind === "EXPENSE") ||
        (input.type === MoneyTransactionType.EXPENSE &&
          category.kind === "INCOME")
      ) {
        throw new BadRequestException(
          "Financial category kind does not match the transaction type",
        );
      }
    }

    this.assertTransactionShape(input);
    this.assertTransactionWalletOwnership(input, walletById);
  }

  private assertTransactionShape(
    input: v1.finance.CreateMoneyTransactionInput,
  ): void {
    const deltas = input.balanceChanges.map(
      (change) => new PrismaRuntime.Decimal(change.amountDelta),
    );
    const positive = deltas.filter((delta) => delta.greaterThan(0)).length;
    const negative = deltas.filter((delta) => delta.lessThan(0)).length;

    if (
      input.type === MoneyTransactionType.TRANSFER ||
      input.type === MoneyTransactionType.PERSONAL_FUNDS_SPLIT
    ) {
      if (
        input.balanceChanges.length !== 2 ||
        positive !== 1 ||
        negative !== 1
      ) {
        throw new BadRequestException(
          "A transfer requires one source and one destination balance change",
        );
      }
      if (input.balanceChanges[0].bucket !== input.balanceChanges[1].bucket) {
        throw new BadRequestException(
          "A transfer must preserve its balance bucket",
        );
      }
    }

    if (
      input.financialScope === MoneyTransactionScope.ADMIN_PERSONAL &&
      input.type === MoneyTransactionType.INCOME
    ) {
      if (
        input.paymentMethod !== "CASH" ||
        input.billingStatus !== "NOT_BILLED" ||
        input.balanceChanges.length !== 1 ||
        positive !== 1 ||
        input.balanceChanges[0].bucket !==
          WalletBalanceBucket.ADMIN_PERSONAL_FUNDS
      ) {
        throw new BadRequestException(
          "Personal income must be unbilled cash entering one admin personal-funds balance",
        );
      }
    }

    if (
      input.type === MoneyTransactionType.PERSONAL_FUNDS_SPLIT &&
      (!input.debtorUserId ||
        !input.creditorUserId ||
        input.debtorUserId === input.creditorUserId)
    ) {
      throw new BadRequestException(
        "A personal-funds split requires different debtor and creditor users",
      );
    }
    if (
      input.type === MoneyTransactionType.PERSONAL_FUNDS_SPLIT &&
      input.balanceChanges.some(
        (change) => change.bucket !== WalletBalanceBucket.ADMIN_PERSONAL_FUNDS,
      )
    ) {
      throw new BadRequestException(
        "A personal-funds split must move admin personal funds",
      );
    }

    if (input.type === MoneyTransactionType.PERSONAL_EXTRACTION) {
      if (
        input.balanceChanges.length !== 1 ||
        negative !== 1 ||
        input.balanceChanges[0].bucket !==
          WalletBalanceBucket.ADMIN_PERSONAL_FUNDS ||
        !input.recipientUserId
      ) {
        throw new BadRequestException(
          "A personal extraction requires one personal-funds debit and a recipient",
        );
      }
    }

    if (
      input.type === MoneyTransactionType.COMPANY_DISTRIBUTION &&
      (!input.recipientUserId ||
        input.financialScope !== MoneyTransactionScope.COMPANY ||
        negative === 0 ||
        input.balanceChanges.some(
          (change) => change.bucket !== WalletBalanceBucket.BUSINESS_FUNDS,
        ))
    ) {
      throw new BadRequestException(
        "A company distribution requires a recipient and a business-funds debit",
      );
    }

    if (
      input.type !== MoneyTransactionType.ADJUSTMENT &&
      input.balanceChanges.length === 0
    ) {
      throw new BadRequestException(
        "This transaction type requires at least one balance change",
      );
    }
  }

  private assertTransactionWalletOwnership(
    input: v1.finance.CreateMoneyTransactionInput,
    wallets: Map<string, { ownerUserId: string | null }>,
  ): void {
    if (input.type !== MoneyTransactionType.PERSONAL_FUNDS_SPLIT) return;

    const source = input.balanceChanges.find((change) =>
      new PrismaRuntime.Decimal(change.amountDelta).isNegative(),
    );
    const destination = input.balanceChanges.find((change) =>
      new PrismaRuntime.Decimal(change.amountDelta).isPositive(),
    );
    if (
      !source ||
      !destination ||
      wallets.get(source.walletId)?.ownerUserId !== input.debtorUserId ||
      wallets.get(destination.walletId)?.ownerUserId !== input.creditorUserId
    ) {
      throw new BadRequestException(
        "Split source and destination wallets must belong to the debtor and creditor",
      );
    }
  }

  private assertBucketAllowed(
    walletType: WalletType,
    owner: { roles: string[]; deletedAt: Date | null } | null,
    bucket: WalletBalanceBucket,
  ): void {
    if (walletType !== WalletType.USER) {
      if (
        bucket === WalletBalanceBucket.USER_SETTLEMENT ||
        bucket === WalletBalanceBucket.ADMIN_PERSONAL_FUNDS
      ) {
        throw new BadRequestException(
          "Company wallets cannot use user or admin-personal balance buckets",
        );
      }
      return;
    }

    if (!owner || owner.deletedAt) {
      throw new BadRequestException("User wallet owner is not active");
    }
    if (
      (bucket === WalletBalanceBucket.BUSINESS_FUNDS ||
        bucket === WalletBalanceBucket.ADMIN_PERSONAL_FUNDS) &&
      !owner.roles.includes("ADMIN")
    ) {
      throw new BadRequestException(
        "Only admin wallets can hold business or admin-personal funds",
      );
    }
  }

  private transactionWhere(
    query: v1.finance.ListMoneyTransactionsQuery,
  ): Prisma.MoneyTransactionWhereInput {
    return {
      status: query.status,
      type: query.type,
      financialScope: query.financialScope,
      paymentMethod: query.paymentMethod,
      billingStatus: query.billingStatus,
      categoryId: query.categoryId,
      ...(query.walletId
        ? { balanceChanges: { some: { walletId: query.walletId } } }
        : {}),
      ...(query.userId
        ? {
            OR: [
              { counterpartyUserId: query.userId },
              { recipientUserId: query.userId },
              { debtorUserId: query.userId },
              { creditorUserId: query.userId },
              { recordedByUserId: query.userId },
            ],
          }
        : {}),
      occurredAt:
        query.from || query.to
          ? {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            }
          : undefined,
    };
  }

  private async claimAggregates(
    type: MoneyTransactionType,
  ): Promise<ClaimAggregate[]> {
    const rows = await this.prisma.moneyTransaction.groupBy({
      by: ["debtorUserId", "creditorUserId", "currency"],
      where: {
        type,
        status: MoneyTransactionStatus.POSTED,
        debtorUserId: { not: null },
        creditorUserId: { not: null },
      },
      _sum: { amount: true },
    });
    return rows.flatMap((row) =>
      row.debtorUserId && row.creditorUserId && row._sum.amount
        ? [
            {
              debtorUserId: row.debtorUserId,
              creditorUserId: row.creditorUserId,
              currency: row.currency,
              amount: row._sum.amount,
            },
          ]
        : [],
    );
  }

  private async settlementAggregates(): Promise<ClaimAggregate[]> {
    const rows = await this.prisma.moneyTransaction.groupBy({
      by: ["debtorUserId", "creditorUserId", "currency"],
      where: {
        type: MoneyTransactionType.PERSONAL_FUNDS_SPLIT,
        status: MoneyTransactionStatus.POSTED,
        debtorUserId: { not: null },
        creditorUserId: { not: null },
      },
      _sum: { amount: true },
    });
    return rows.flatMap((row) =>
      row.debtorUserId && row.creditorUserId && row._sum.amount
        ? [
            {
              debtorUserId: row.debtorUserId,
              creditorUserId: row.creditorUserId,
              currency: row.currency,
              amount: row._sum.amount,
            },
          ]
        : [],
    );
  }

  private async assertSplitDoesNotExceedOutstanding(
    tx: Prisma.TransactionClient,
    transaction: MoneyTransactionWithDetails,
  ): Promise<void> {
    const debtorUserId = transaction.debtorUserId;
    const creditorUserId = transaction.creditorUserId;
    if (!debtorUserId || !creditorUserId) {
      throw new BadRequestException(
        "A personal-funds split requires a debtor and creditor",
      );
    }

    const rows = await tx.moneyTransaction.groupBy({
      by: ["type", "debtorUserId", "creditorUserId"],
      where: {
        type: {
          in: [
            MoneyTransactionType.PERSONAL_FUNDS_CLAIM,
            MoneyTransactionType.PERSONAL_FUNDS_SPLIT,
          ],
        },
        status: MoneyTransactionStatus.POSTED,
        currency: transaction.currency,
        OR: [
          { debtorUserId, creditorUserId },
          {
            debtorUserId: creditorUserId,
            creditorUserId: debtorUserId,
          },
        ],
      },
      _sum: { amount: true },
    });

    let outstanding = new PrismaRuntime.Decimal(0);
    for (const row of rows) {
      if (!row.debtorUserId || !row.creditorUserId || !row._sum.amount) {
        continue;
      }
      const sameDirection = row.debtorUserId === debtorUserId ? 1 : -1;
      const eventDirection =
        row.type === MoneyTransactionType.PERSONAL_FUNDS_CLAIM ? 1 : -1;
      outstanding = outstanding.plus(
        row._sum.amount.times(sameDirection * eventDirection),
      );
    }

    if (
      !outstanding.greaterThan(0) ||
      transaction.amount.greaterThan(outstanding)
    ) {
      throw new ConflictException(
        "Personal-funds split exceeds the outstanding claim",
      );
    }
  }

  private async assertPersonalIncomeCanBeReversed(
    tx: Prisma.TransactionClient,
    transaction: MoneyTransactionWithDetails,
  ): Promise<void> {
    const claims = await tx.moneyTransaction.findMany({
      where: {
        originTransactionId: transaction.id,
        type: MoneyTransactionType.PERSONAL_FUNDS_CLAIM,
      },
      select: {
        debtorUserId: true,
        creditorUserId: true,
      },
    });
    const claimPairs = claims.flatMap((claim) =>
      claim.debtorUserId && claim.creditorUserId
        ? [
            {
              OR: [
                {
                  debtorUserId: claim.debtorUserId,
                  creditorUserId: claim.creditorUserId,
                },
                {
                  debtorUserId: claim.creditorUserId,
                  creditorUserId: claim.debtorUserId,
                },
              ],
            },
          ]
        : [],
    );
    if (claimPairs.length === 0) return;

    const settlementExists = await tx.moneyTransaction.findFirst({
      where: {
        type: MoneyTransactionType.PERSONAL_FUNDS_SPLIT,
        status: MoneyTransactionStatus.POSTED,
        currency: transaction.currency,
        OR: claimPairs,
      },
      select: { id: true },
    });
    if (settlementExists) {
      throw new ConflictException(
        "Reverse personal-funds splits before reversing their income",
      );
    }
  }

  private toMinorUnits(amount: Prisma.Decimal): bigint {
    return BigInt(amount.toFixed(2).replace(".", ""));
  }

  private fromMinorUnits(amount: bigint): Prisma.Decimal {
    const absolute = amount < 0n ? -amount : amount;
    const digits = absolute.toString().padStart(3, "0");
    const value = `${amount < 0n ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
    return new PrismaRuntime.Decimal(value);
  }

  private sortedBalanceChanges(
    changes: WalletBalanceChange[],
  ): WalletBalanceChange[] {
    return [...changes].sort((first, second) =>
      `${first.walletId}:${first.bucket}:${first.currency}`.localeCompare(
        `${second.walletId}:${second.bucket}:${second.currency}`,
      ),
    );
  }

  private async findTransactionByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<MoneyTransactionWithDetails | null> {
    return this.prisma.moneyTransaction.findUnique({
      where: { idempotencyKey },
      include: this.transactionInclude(),
    });
  }

  private async assertCategoryParent(
    tx: Prisma.TransactionClient,
    parentCategoryId: string | null,
  ): Promise<void> {
    if (!parentCategoryId) return;
    const parent = await tx.financialCategory.findUnique({
      where: { id: parentCategoryId },
      select: { isActive: true },
    });
    if (!parent?.isActive) {
      throw new BadRequestException("Parent financial category is not active");
    }
  }

  private async recordTransactionAudit(
    tx: Prisma.TransactionClient,
    type:
      | typeof AuditEventType.MONEY_TRANSACTION_CREATED
      | typeof AuditEventType.MONEY_TRANSACTION_POSTED
      | typeof AuditEventType.MONEY_TRANSACTION_REVERSED,
    transaction: MoneyTransactionWithDetails,
    context: FinancialContext,
    extraMeta: Prisma.InputJsonObject = {},
  ): Promise<void> {
    await this.audit.recordRequired(tx, {
      type,
      userId: context.actor.id,
      targetType: FINANCIAL_TRANSACTION_AUDIT_TARGET,
      targetId: transaction.id,
      ip: context.ip,
      userAgent: context.userAgent,
      meta: {
        transactionType: transaction.type,
        amount: transaction.amount.toFixed(2),
        currency: transaction.currency,
        financialScope: transaction.financialScope,
        ...extraMeta,
      },
    });
  }

  private walletInclude() {
    return {
      owner: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      balances: {
        orderBy: [{ bucket: "asc" }, { currency: "asc" }],
      },
    } satisfies Prisma.WalletInclude;
  }

  private transactionInclude() {
    return {
      balanceChanges: {
        orderBy: [{ walletId: "asc" }, { bucket: "asc" }],
      },
      references: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
    } satisfies Prisma.MoneyTransactionInclude;
  }

  private async runSerializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: PrismaRuntime.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 10_000,
        });
      } catch (error) {
        if (
          !(
            error instanceof PrismaRuntime.PrismaClientKnownRequestError &&
            error.code === "P2034" &&
            attempt < SERIALIZABLE_ATTEMPTS
          )
        ) {
          throw error;
        }
      }
    }
    throw new ConflictException("Financial transaction could not be posted");
  }

  private isUniqueConflict(error: unknown): boolean {
    return (
      error instanceof PrismaRuntime.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  private handleCategoryWriteError(error: unknown): never {
    if (this.isUniqueConflict(error)) {
      throw new ConflictException("Financial category code already exists");
    }
    throw error;
  }
}
