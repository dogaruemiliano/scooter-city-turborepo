import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { createHash } from "node:crypto";

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
import { categoryCodeFromPath } from "./category-code";
import { sortFinancialCategories } from "./category-sort";
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

type BalanceDirection = "POSITIVE" | "NEGATIVE";

interface RequiredBalanceChange {
  bucket: WalletBalanceBucket;
  direction: BalanceDirection;
}

interface WalletFilterQuery {
  search?: string;
  type?: v1.finance.WalletType;
  companyOnly?: boolean;
  ownerRole?: "ADMIN";
  ownerUserId?: string;
  ownerIsActive?: boolean;
  isActive?: boolean;
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
          cardHolderUserId: input.cardHolderUserId,
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

  async listWallets(query: v1.finance.ListWalletsQuery): Promise<{
    items: WalletWithDetails[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const where = this.walletWhere(query);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.wallet.count({ where }),
      this.prisma.wallet.findMany({
        where,
        include: this.walletInclude(),
        orderBy: this.walletOrderBy(),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async listWalletOptions(
    query: v1.finance.ListWalletOptionsQuery,
  ): Promise<v1.finance.WalletOptionList> {
    const where = this.walletWhere(query, true);
    const filters = this.walletOptionCursorFilters(query);
    const cursor = query.cursor
      ? this.parseWalletOptionCursor(query.cursor)
      : null;

    if (cursor && !this.walletOptionCursorFiltersMatch(cursor, filters)) {
      throw new BadRequestException("Invalid or stale wallet options cursor");
    }

    const pageQuery = this.prisma.wallet.findMany({
      where,
      select: this.walletOptionSelect(),
      orderBy: this.walletOrderBy(),
      take: query.pageSize + 1,
      ...(cursor
        ? {
            cursor: { id: cursor.id },
            skip: 1,
          }
        : {}),
    });

    let rows: Awaited<typeof pageQuery>;
    if (cursor) {
      const [cursorWallet, cursorRows] = await this.prisma.$transaction([
        this.prisma.wallet.findFirst({
          where: { AND: [where, { id: cursor.id }] },
          select: this.walletOptionSelect(),
        }),
        pageQuery,
      ]);
      if (
        !cursorWallet ||
        !this.walletOptionSortMatches(cursor, cursorWallet)
      ) {
        throw new BadRequestException("Invalid or stale wallet options cursor");
      }
      rows = cursorRows;
    } else {
      rows = await pageQuery;
    }

    const hasNextPage = rows.length > query.pageSize;
    const items = rows.slice(0, query.pageSize);
    const lastItem = items.at(-1);

    return {
      items,
      nextCursor:
        hasNextPage && lastItem
          ? this.encodeWalletOptionCursor(lastItem, filters)
          : null,
    };
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

  async listCategories(): Promise<FinancialCategory[]> {
    const categories = await this.prisma.financialCategory.findMany();
    return sortFinancialCategories(categories);
  }

  async createCategory(
    input: v1.finance.CreateFinancialCategoryInput,
    context: FinancialContext,
  ): Promise<FinancialCategory> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const parent = await this.assertCategoryParent(
          tx,
          input.parentCategoryId ?? null,
        );
        const category = await tx.financialCategory.create({
          data: {
            code: categoryCodeFromPath({
              kind: input.kind,
              name: input.name,
              parentCode: parent?.code,
            }),
            name: input.name,
            kind: input.kind,
            icon: input.icon ?? null,
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
      const pathChanged =
        input.name !== undefined ||
        input.kind !== undefined ||
        input.parentCategoryId !== undefined;
      const parent = pathChanged
        ? await this.assertCategoryParent(
            tx,
            input.parentCategoryId !== undefined
              ? input.parentCategoryId
              : existing.parentCategoryId,
          )
        : null;

      const updated = await tx.financialCategory.update({
        where: { id },
        data: {
          ...input,
          ...(pathChanged
            ? {
                code: categoryCodeFromPath({
                  kind: input.kind ?? existing.kind,
                  name: input.name ?? existing.name,
                  parentCode: parent?.code,
                }),
              }
            : {}),
        },
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
            counterpartyId: input.counterpartyId ?? null,
            counterpartyUserId: input.counterpartyUserId ?? null,
            recipientCounterpartyId: input.recipientCounterpartyId ?? null,
            recipientUserId: input.recipientUserId ?? null,
            debtorCounterpartyId: input.debtorCounterpartyId ?? null,
            debtorUserId: input.debtorUserId ?? null,
            creditorCounterpartyId: input.creditorCounterpartyId ?? null,
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
      const expensePosting = await tx.expensePosting.findUnique({
        where: { moneyTransactionId: original.id },
        select: { expenseId: true, role: true },
      });
      if (expensePosting) {
        throw new ConflictException(
          "Expense-generated transactions must be reversed through the expense lifecycle",
        );
      }
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
    return this.prisma.$transaction(
      async (tx) => {
        const claims = await this.claimAggregates(
          tx,
          MoneyTransactionType.PERSONAL_FUNDS_CLAIM,
        );
        const settlements = await this.settlementAggregates(tx);
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

        const outstanding = [...netByPair.entries()]
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
        if (outstanding.length === 0) return [];

        const participantIds = [
          ...new Set(
            outstanding.flatMap((claim) => [
              claim.debtorUserId,
              claim.creditorUserId,
            ]),
          ),
        ].sort();
        const participants = await tx.user.findMany({
          where: { id: { in: participantIds } },
          select: this.userSummarySelect(),
          orderBy: { id: "asc" },
        });
        const participantById = new Map(
          participants.map((participant) => [participant.id, participant]),
        );

        return outstanding.map((claim) => {
          const debtor = participantById.get(claim.debtorUserId);
          const creditor = participantById.get(claim.creditorUserId);
          if (!debtor || !creditor) {
            throw new ConflictException(
              "Outstanding claim participants could not be resolved",
            );
          }
          return { ...claim, debtor, creditor };
        });
      },
      {
        isolationLevel: PrismaRuntime.TransactionIsolationLevel.RepeatableRead,
        maxWait: 5_000,
        timeout: 10_000,
      },
    );
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
        ((input.type === MoneyTransactionType.INCOME ||
          input.type === MoneyTransactionType.USER_CHARGE) &&
          category.kind === "EXPENSE") ||
        (input.type === MoneyTransactionType.EXPENSE &&
          category.kind === "INCOME")
      ) {
        throw new BadRequestException(
          "Financial category kind does not match the transaction type",
        );
      }
    }

    const counterpartyIds = [
      input.counterpartyId,
      input.recipientCounterpartyId,
      input.debtorCounterpartyId,
      input.creditorCounterpartyId,
    ].filter((id): id is string => Boolean(id));
    if (counterpartyIds.length > 0) {
      const uniqueCounterpartyIds = [...new Set(counterpartyIds)];
      const counterparties = await tx.counterparty.findMany({
        where: {
          id: { in: uniqueCounterpartyIds },
        },
        select: {
          isActive: true,
          person: { select: { deletedAt: true } },
          company: { select: { isActive: true, deletedAt: true } },
        },
      });
      const allActive = counterparties.every(
        (counterparty) =>
          counterparty.isActive &&
          (counterparty.person
            ? counterparty.person.deletedAt === null
            : counterparty.company?.isActive === true &&
              counterparty.company.deletedAt === null),
      );
      if (
        counterparties.length !== uniqueCounterpartyIds.length ||
        !allActive
      ) {
        throw new BadRequestException(
          "One or more financial counterparties are not active",
        );
      }
    }

    this.assertTransactionShape(input);
    this.assertTransactionWalletOwnership(input, walletById);
  }

  private assertTransactionShape(
    input: v1.finance.CreateMoneyTransactionInput,
  ): void {
    switch (input.type) {
      case MoneyTransactionType.INCOME:
        this.assertIncomeShape(input);
        return;
      case MoneyTransactionType.EXPENSE:
        this.assertExpenseShape(input);
        return;
      case MoneyTransactionType.TRANSFER:
        this.assertTransferShape(input);
        this.assertAllowedPartyFields(input, []);
        this.assertNotApplicableBilling(input);
        this.assertPaymentMethodAbsent(input);
        this.assertCategoryAbsent(input);
        return;
      case MoneyTransactionType.USER_CHARGE:
        this.assertScope(input, MoneyTransactionScope.COMPANY);
        this.assertExactBalanceChanges(input, [
          {
            bucket: WalletBalanceBucket.USER_SETTLEMENT,
            direction: "NEGATIVE",
          },
        ]);
        this.assertRequiredPartyField(input, "counterpartyUserId");
        this.assertAllowedPartyFields(input, ["counterpartyUserId"]);
        if (input.paymentMethod != null || input.billingStatus !== "BILLED") {
          throw new BadRequestException(
            "A user charge must be billed and cannot have a payment method",
          );
        }
        return;
      case MoneyTransactionType.USER_PAYMENT:
        this.assertCustomerCashMovement(input, "POSITIVE");
        return;
      case MoneyTransactionType.GUARANTEE_RECEIVED:
        this.assertGuaranteeMovement(input, "POSITIVE");
        return;
      case MoneyTransactionType.GUARANTEE_REFUNDED:
        this.assertGuaranteeMovement(input, "NEGATIVE");
        return;
      case MoneyTransactionType.REIMBURSEMENT:
        this.assertScope(input, MoneyTransactionScope.COMPANY);
        this.assertExactBalanceChanges(input, [
          {
            bucket: WalletBalanceBucket.BUSINESS_FUNDS,
            direction: "NEGATIVE",
          },
          {
            bucket: WalletBalanceBucket.ADMIN_PERSONAL_FUNDS,
            direction: "POSITIVE",
          },
        ]);
        this.assertRequiredPartyField(input, "recipientUserId");
        this.assertAllowedPartyFields(input, ["recipientUserId"]);
        this.assertNotApplicableBilling(input);
        this.assertPaymentMethodRequired(input);
        this.assertCategoryAbsent(input);
        return;
      case MoneyTransactionType.PERSONAL_EXTRACTION:
        this.assertScope(input, MoneyTransactionScope.ADMIN_PERSONAL);
        this.assertExactBalanceChanges(input, [
          {
            bucket: WalletBalanceBucket.ADMIN_PERSONAL_FUNDS,
            direction: "NEGATIVE",
          },
        ]);
        this.assertRequiredPartyField(input, "recipientUserId");
        this.assertAllowedPartyFields(input, ["recipientUserId"]);
        this.assertNotApplicableBilling(input);
        this.assertPaymentMethodRequired(input);
        this.assertCategoryAbsent(input);
        return;
      case MoneyTransactionType.PERSONAL_FUNDS_SPLIT:
        this.assertScope(input, MoneyTransactionScope.ADMIN_PERSONAL);
        this.assertExactBalanceChanges(input, [
          {
            bucket: WalletBalanceBucket.ADMIN_PERSONAL_FUNDS,
            direction: "NEGATIVE",
          },
          {
            bucket: WalletBalanceBucket.ADMIN_PERSONAL_FUNDS,
            direction: "POSITIVE",
          },
        ]);
        this.assertRequiredPartyField(input, "debtorUserId");
        this.assertRequiredPartyField(input, "creditorUserId");
        if (input.debtorUserId === input.creditorUserId) {
          throw new BadRequestException(
            "A personal-funds split requires different debtor and creditor users",
          );
        }
        this.assertAllowedPartyFields(input, [
          "debtorUserId",
          "creditorUserId",
        ]);
        this.assertNotApplicableBilling(input);
        if (input.paymentMethod !== "CASH") {
          throw new BadRequestException(
            "A personal-funds split requires the CASH payment method",
          );
        }
        this.assertCategoryAbsent(input);
        return;
      case MoneyTransactionType.COMPANY_DISTRIBUTION:
        this.assertScope(input, MoneyTransactionScope.COMPANY);
        if (input.balanceChanges.length === 2) {
          this.assertExactBalanceChanges(input, [
            {
              bucket: WalletBalanceBucket.BUSINESS_FUNDS,
              direction: "NEGATIVE",
            },
            {
              bucket: WalletBalanceBucket.USER_SETTLEMENT,
              direction: "NEGATIVE",
            },
          ]);
        } else {
          this.assertExactBalanceChanges(input, [
            {
              bucket: WalletBalanceBucket.BUSINESS_FUNDS,
              direction: "NEGATIVE",
            },
          ]);
        }
        this.assertRequiredPartyField(input, "recipientUserId");
        this.assertAllowedPartyFields(input, ["recipientUserId"]);
        this.assertNotApplicableBilling(input);
        this.assertPaymentMethodRequired(input);
        this.assertCategoryAbsent(input);
        return;
      case MoneyTransactionType.CAPITAL_CONTRIBUTION:
        this.assertScope(input, MoneyTransactionScope.COMPANY);
        this.assertExactBalanceChanges(input, [
          {
            bucket: WalletBalanceBucket.ADMIN_PERSONAL_FUNDS,
            direction: "NEGATIVE",
          },
          {
            bucket: WalletBalanceBucket.BUSINESS_FUNDS,
            direction: "POSITIVE",
          },
          {
            bucket: WalletBalanceBucket.USER_SETTLEMENT,
            direction: "POSITIVE",
          },
        ]);
        this.assertRequiredPartyField(input, "counterpartyUserId");
        this.assertAllowedPartyFields(input, ["counterpartyUserId"]);
        this.assertNotApplicableBilling(input);
        this.assertPaymentMethodRequired(input);
        this.assertCategoryAbsent(input);
        return;
      case MoneyTransactionType.REFUND:
        this.assertCustomerCashMovement(input, "NEGATIVE");
        return;
      case MoneyTransactionType.ADJUSTMENT:
        if (input.balanceChanges.length !== 1) {
          throw new BadRequestException(
            "An adjustment requires exactly one balance change",
          );
        }
        this.assertScopeMatchesBucket(input, input.balanceChanges[0].bucket);
        this.assertNotApplicableBilling(input);
        this.assertPaymentMethodAbsent(input);
        this.assertCategoryAbsent(input);
        return;
      default:
        input.type satisfies never;
    }
  }

  private assertTransactionWalletOwnership(
    input: v1.finance.CreateMoneyTransactionInput,
    wallets: Map<string, { ownerUserId: string | null; type: WalletType }>,
  ): void {
    if (input.type === MoneyTransactionType.PERSONAL_FUNDS_SPLIT) {
      const source = this.findBalanceChange(
        input,
        WalletBalanceBucket.ADMIN_PERSONAL_FUNDS,
        "NEGATIVE",
      );
      const destination = this.findBalanceChange(
        input,
        WalletBalanceBucket.ADMIN_PERSONAL_FUNDS,
        "POSITIVE",
      );
      if (
        wallets.get(source.walletId)?.ownerUserId !== input.debtorUserId ||
        wallets.get(destination.walletId)?.ownerUserId !== input.creditorUserId
      ) {
        throw new BadRequestException(
          "Split source and destination wallets must belong to the debtor and creditor",
        );
      }
    }

    if (
      input.type === MoneyTransactionType.USER_CHARGE ||
      input.type === MoneyTransactionType.USER_PAYMENT ||
      input.type === MoneyTransactionType.GUARANTEE_RECEIVED ||
      input.type === MoneyTransactionType.GUARANTEE_REFUNDED ||
      input.type === MoneyTransactionType.REFUND
    ) {
      const settlement = this.findBalanceChange(
        input,
        WalletBalanceBucket.USER_SETTLEMENT,
        input.type === MoneyTransactionType.USER_CHARGE ||
          input.type === MoneyTransactionType.REFUND ||
          input.type === MoneyTransactionType.GUARANTEE_REFUNDED
          ? "NEGATIVE"
          : "POSITIVE",
      );
      const wallet = wallets.get(settlement.walletId);
      if (
        wallet?.type !== WalletType.USER ||
        wallet.ownerUserId !== input.counterpartyUserId
      ) {
        throw new BadRequestException(
          "The settlement wallet must belong to the transaction counterparty",
        );
      }
    }

    if (
      input.type === MoneyTransactionType.GUARANTEE_RECEIVED ||
      input.type === MoneyTransactionType.GUARANTEE_REFUNDED
    ) {
      const guarantee = this.findBalanceChange(
        input,
        WalletBalanceBucket.CUSTOMER_GUARANTEE_FUNDS,
        input.type === MoneyTransactionType.GUARANTEE_RECEIVED
          ? "POSITIVE"
          : "NEGATIVE",
      );
      if (wallets.get(guarantee.walletId)?.type === WalletType.USER) {
        throw new BadRequestException(
          "Customer guarantee funds must be held in a company wallet",
        );
      }
    }

    if (input.type === MoneyTransactionType.REIMBURSEMENT) {
      const destination = this.findBalanceChange(
        input,
        WalletBalanceBucket.ADMIN_PERSONAL_FUNDS,
        "POSITIVE",
      );
      const wallet = wallets.get(destination.walletId);
      if (
        wallet?.type !== WalletType.USER ||
        wallet.ownerUserId !== input.recipientUserId
      ) {
        throw new BadRequestException(
          "The reimbursement destination must be the recipient's admin wallet",
        );
      }
    }

    if (
      input.type === MoneyTransactionType.COMPANY_DISTRIBUTION &&
      input.balanceChanges.length === 2
    ) {
      const settlement = this.findBalanceChange(
        input,
        WalletBalanceBucket.USER_SETTLEMENT,
        "NEGATIVE",
      );
      const wallet = wallets.get(settlement.walletId);
      if (
        wallet?.type !== WalletType.USER ||
        wallet.ownerUserId !== input.recipientUserId
      ) {
        throw new BadRequestException(
          "The distribution's settlement wallet must belong to the recipient",
        );
      }
    }

    if (input.type === MoneyTransactionType.CAPITAL_CONTRIBUTION) {
      const personalSource = this.findBalanceChange(
        input,
        WalletBalanceBucket.ADMIN_PERSONAL_FUNDS,
        "NEGATIVE",
      );
      const settlementCredit = this.findBalanceChange(
        input,
        WalletBalanceBucket.USER_SETTLEMENT,
        "POSITIVE",
      );
      if (
        wallets.get(personalSource.walletId)?.ownerUserId !==
          input.counterpartyUserId ||
        wallets.get(settlementCredit.walletId)?.ownerUserId !==
          input.counterpartyUserId
      ) {
        throw new BadRequestException(
          "The capital contribution's personal and settlement wallets must belong to the contributing owner",
        );
      }
    }
  }

  private assertIncomeShape(
    input: v1.finance.CreateMoneyTransactionInput,
  ): void {
    this.assertAllowedPartyFields(input, [
      "counterpartyId",
      "counterpartyUserId",
    ]);
    this.assertSinglePartyIdentity(
      input,
      "counterpartyId",
      "counterpartyUserId",
    );
    if (!input.counterpartyId && !input.counterpartyUserId) {
      throw new BadRequestException("INCOME requires a payer");
    }
    this.assertPaymentMethodRequired(input);
    if (input.financialScope === MoneyTransactionScope.COMPANY) {
      this.assertExactBalanceChanges(input, [
        {
          bucket: WalletBalanceBucket.BUSINESS_FUNDS,
          direction: "POSITIVE",
        },
      ]);
      return;
    }
    if (input.financialScope === MoneyTransactionScope.ADMIN_PERSONAL) {
      this.assertExactBalanceChanges(input, [
        {
          bucket: WalletBalanceBucket.ADMIN_PERSONAL_FUNDS,
          direction: "POSITIVE",
        },
      ]);
      if (
        input.paymentMethod !== "CASH" ||
        input.billingStatus !== "NOT_BILLED"
      ) {
        throw new BadRequestException(
          "Personal income must be unbilled cash entering one admin personal-funds balance",
        );
      }
      return;
    }
    throw new BadRequestException(
      "Income must have company or admin-personal scope",
    );
  }

  private assertExpenseShape(
    input: v1.finance.CreateMoneyTransactionInput,
  ): void {
    this.assertCategoryRequired(input);
    this.assertAllowedPartyFields(input, [
      "counterpartyId",
      "counterpartyUserId",
    ]);
    this.assertSinglePartyIdentity(
      input,
      "counterpartyId",
      "counterpartyUserId",
    );
    if (
      !input.counterpartyId &&
      !input.counterpartyUserId &&
      !input.description
    ) {
      throw new BadRequestException(
        "An expense without a recipient requires a description",
      );
    }
    this.assertPaymentMethodRequired(input);
    if (input.financialScope === MoneyTransactionScope.COMPANY) {
      this.assertExactBalanceChanges(input, [
        {
          bucket: WalletBalanceBucket.BUSINESS_FUNDS,
          direction: "NEGATIVE",
        },
      ]);
      return;
    }
    if (input.financialScope === MoneyTransactionScope.ADMIN_PERSONAL) {
      this.assertExactBalanceChanges(input, [
        {
          bucket: WalletBalanceBucket.ADMIN_PERSONAL_FUNDS,
          direction: "NEGATIVE",
        },
      ]);
      return;
    }
    throw new BadRequestException(
      "An expense must have company or admin-personal scope",
    );
  }

  private assertTransferShape(
    input: v1.finance.CreateMoneyTransactionInput,
  ): void {
    if (
      input.balanceChanges.length !== 2 ||
      input.balanceChanges[0].walletId === input.balanceChanges[1].walletId
    ) {
      throw new BadRequestException(
        "A transfer requires different source and destination wallets",
      );
    }
    const bucket = input.balanceChanges[0].bucket;
    this.assertExactBalanceChanges(input, [
      { bucket, direction: "NEGATIVE" },
      { bucket, direction: "POSITIVE" },
    ]);
    this.assertScopeMatchesBucket(input, bucket);
  }

  private assertCustomerCashMovement(
    input: v1.finance.CreateMoneyTransactionInput,
    direction: BalanceDirection,
  ): void {
    this.assertScope(input, MoneyTransactionScope.COMPANY);
    this.assertExactBalanceChanges(input, [
      { bucket: WalletBalanceBucket.BUSINESS_FUNDS, direction },
      { bucket: WalletBalanceBucket.USER_SETTLEMENT, direction },
    ]);
    this.assertRequiredPartyField(input, "counterpartyUserId");
    this.assertAllowedPartyFields(input, ["counterpartyUserId"]);
    this.assertNotApplicableBilling(input);
    this.assertPaymentMethodRequired(input);
    this.assertCategoryAbsent(input);
  }

  private assertGuaranteeMovement(
    input: v1.finance.CreateMoneyTransactionInput,
    direction: BalanceDirection,
  ): void {
    this.assertScope(input, MoneyTransactionScope.CUSTOMER_HELD);
    this.assertExactBalanceChanges(input, [
      {
        bucket: WalletBalanceBucket.CUSTOMER_GUARANTEE_FUNDS,
        direction,
      },
      { bucket: WalletBalanceBucket.USER_SETTLEMENT, direction },
    ]);
    this.assertRequiredPartyField(input, "counterpartyUserId");
    this.assertAllowedPartyFields(input, ["counterpartyUserId"]);
    this.assertNotApplicableBilling(input);
    this.assertPaymentMethodRequired(input);
    this.assertCategoryAbsent(input);
  }

  private assertExactBalanceChanges(
    input: v1.finance.CreateMoneyTransactionInput,
    required: RequiredBalanceChange[],
  ): void {
    if (input.balanceChanges.length !== required.length) {
      throw new BadRequestException(
        `${input.type} requires exactly ${required.length} balance change${required.length === 1 ? "" : "s"}`,
      );
    }

    const unmatched = [...input.balanceChanges];
    for (const expected of required) {
      const index = unmatched.findIndex(
        (change) =>
          change.bucket === expected.bucket &&
          this.balanceDirection(change.amountDelta) === expected.direction,
      );
      if (index === -1) {
        throw new BadRequestException(
          `${input.type} has an invalid balance bucket or direction`,
        );
      }
      unmatched.splice(index, 1);
    }
  }

  private findBalanceChange(
    input: v1.finance.CreateMoneyTransactionInput,
    bucket: WalletBalanceBucket,
    direction: BalanceDirection,
  ): v1.finance.WalletBalanceChangeInput {
    const change = input.balanceChanges.find(
      (item) =>
        item.bucket === bucket &&
        this.balanceDirection(item.amountDelta) === direction,
    );
    if (!change) {
      throw new BadRequestException(
        `${input.type} is missing a required balance change`,
      );
    }
    return change;
  }

  private balanceDirection(amountDelta: string): BalanceDirection {
    return new PrismaRuntime.Decimal(amountDelta).isPositive()
      ? "POSITIVE"
      : "NEGATIVE";
  }

  private assertScope(
    input: v1.finance.CreateMoneyTransactionInput,
    expected: MoneyTransactionScope,
  ): void {
    if (input.financialScope !== expected) {
      throw new BadRequestException(
        `${input.type} requires ${expected} financial scope`,
      );
    }
  }

  private assertScopeMatchesBucket(
    input: v1.finance.CreateMoneyTransactionInput,
    bucket: WalletBalanceBucket,
  ): void {
    const expected =
      bucket === WalletBalanceBucket.ADMIN_PERSONAL_FUNDS
        ? MoneyTransactionScope.ADMIN_PERSONAL
        : bucket === WalletBalanceBucket.CUSTOMER_GUARANTEE_FUNDS
          ? MoneyTransactionScope.CUSTOMER_HELD
          : MoneyTransactionScope.COMPANY;
    this.assertScope(input, expected);
  }

  private assertNotApplicableBilling(
    input: v1.finance.CreateMoneyTransactionInput,
  ): void {
    if (input.billingStatus !== BillingStatus.NOT_APPLICABLE) {
      throw new BadRequestException(
        `${input.type} requires NOT_APPLICABLE billing status`,
      );
    }
  }

  private assertPaymentMethodRequired(
    input: v1.finance.CreateMoneyTransactionInput,
  ): void {
    if (!input.paymentMethod) {
      throw new BadRequestException(`${input.type} requires a payment method`);
    }
  }

  private assertPaymentMethodAbsent(
    input: v1.finance.CreateMoneyTransactionInput,
  ): void {
    if (input.paymentMethod != null) {
      throw new BadRequestException(
        `${input.type} cannot have a payment method`,
      );
    }
  }

  private assertCategoryAbsent(
    input: v1.finance.CreateMoneyTransactionInput,
  ): void {
    if (input.categoryId != null) {
      throw new BadRequestException(`${input.type} cannot have a category`);
    }
  }

  private assertCategoryRequired(
    input: v1.finance.CreateMoneyTransactionInput,
  ): void {
    if (!input.categoryId) {
      throw new BadRequestException(`${input.type} requires a category`);
    }
  }

  private assertRequiredPartyField(
    input: v1.finance.CreateMoneyTransactionInput,
    field:
      | "counterpartyId"
      | "counterpartyUserId"
      | "recipientCounterpartyId"
      | "recipientUserId"
      | "debtorCounterpartyId"
      | "debtorUserId"
      | "creditorCounterpartyId"
      | "creditorUserId",
  ): void {
    if (!input[field]) {
      throw new BadRequestException(`${input.type} requires ${field}`);
    }
  }

  private assertAllowedPartyFields(
    input: v1.finance.CreateMoneyTransactionInput,
    allowed: Array<
      | "counterpartyId"
      | "counterpartyUserId"
      | "recipientCounterpartyId"
      | "recipientUserId"
      | "debtorCounterpartyId"
      | "debtorUserId"
      | "creditorCounterpartyId"
      | "creditorUserId"
    >,
  ): void {
    const fields = [
      "counterpartyId",
      "counterpartyUserId",
      "recipientCounterpartyId",
      "recipientUserId",
      "debtorCounterpartyId",
      "debtorUserId",
      "creditorCounterpartyId",
      "creditorUserId",
    ] as const;
    const unexpected = fields.find(
      (field) => input[field] != null && !allowed.includes(field),
    );
    if (unexpected) {
      throw new BadRequestException(
        `${input.type} does not allow ${unexpected}`,
      );
    }
  }

  private assertSinglePartyIdentity(
    input: v1.finance.CreateMoneyTransactionInput,
    counterpartyField: "counterpartyId",
    legacyUserField: "counterpartyUserId",
  ): void {
    if (input[counterpartyField] && input[legacyUserField]) {
      throw new BadRequestException(
        `${input.type} cannot specify both ${counterpartyField} and ${legacyUserField}`,
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

  private escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, "\\$&");
  }

  private walletWhere(
    query: WalletFilterQuery,
    excludeInactiveUserOwners = false,
  ): Prisma.WalletWhereInput {
    const searchTokens =
      query.search
        ?.trim()
        .split(/\s+/u)
        .filter((token) => token.length > 0) ?? [];
    const and: Prisma.WalletWhereInput[] = searchTokens.map((token) => {
      const escapedToken = this.escapeLikePattern(token);
      return {
        OR: [
          { name: { contains: escapedToken, mode: "insensitive" } },
          {
            owner: {
              is: {
                OR: [
                  {
                    firstName: {
                      contains: escapedToken,
                      mode: "insensitive",
                    },
                  },
                  {
                    lastName: {
                      contains: escapedToken,
                      mode: "insensitive",
                    },
                  },
                  {
                    email: {
                      contains: escapedToken,
                      mode: "insensitive",
                    },
                  },
                ],
              },
            },
          },
        ],
      };
    });
    const ownerIsActive =
      query.ownerIsActive ??
      (excludeInactiveUserOwners && query.ownerRole ? true : undefined);
    const ownerFilter: Prisma.UserWhereInput = {
      ...(query.ownerRole ? { roles: { has: query.ownerRole } } : {}),
      ...(ownerIsActive !== undefined
        ? {
            deletedAt: ownerIsActive ? null : { not: null },
          }
        : {}),
    };
    if (query.ownerRole || ownerIsActive !== undefined) {
      and.push({ owner: { is: ownerFilter } });
    }
    if (excludeInactiveUserOwners) {
      and.push({
        OR: [
          { type: { not: WalletType.USER } },
          { owner: { is: { deletedAt: null } } },
        ],
      });
    }

    return {
      type:
        query.type ??
        (query.companyOnly ? { not: WalletType.USER } : undefined),
      ownerUserId: query.ownerUserId,
      isActive: query.isActive,
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private walletOrderBy(): Prisma.WalletOrderByWithRelationInput[] {
    return [
      { type: "asc" },
      {
        owner: {
          lastName: { sort: "asc", nulls: "last" },
        },
      },
      {
        owner: {
          firstName: { sort: "asc", nulls: "last" },
        },
      },
      { owner: { email: "asc" } },
      { name: "asc" },
      { id: "asc" },
    ];
  }

  private walletOptionCursorFilters(
    query: v1.finance.ListWalletOptionsQuery,
  ): v1.finance.WalletOptionCursorFilters {
    return {
      ...(query.search !== undefined ? { search: query.search } : {}),
      ...(query.type !== undefined ? { type: query.type } : {}),
      ...(query.companyOnly !== undefined
        ? { companyOnly: query.companyOnly }
        : {}),
      ...(query.ownerRole !== undefined ? { ownerRole: query.ownerRole } : {}),
      ...(query.ownerUserId !== undefined
        ? { ownerUserId: query.ownerUserId }
        : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };
  }

  private walletOptionCursorFiltersMatch(
    cursor: v1.finance.WalletOptionCursorPayload,
    filters: v1.finance.WalletOptionCursorFilters,
  ): boolean {
    return (
      cursor.filterFingerprint === this.walletOptionFilterFingerprint(filters)
    );
  }

  private walletOptionFilterFingerprint(
    filters: v1.finance.WalletOptionCursorFilters,
  ): string {
    return this.walletOptionFingerprint([
      filters.search ?? null,
      filters.type ?? null,
      filters.companyOnly ?? null,
      filters.ownerRole ?? null,
      filters.ownerUserId ?? null,
      filters.isActive ?? null,
    ]);
  }

  private walletOptionSortFingerprint(wallet: v1.finance.WalletOption): string {
    return this.walletOptionFingerprint([
      wallet.type,
      wallet.owner?.lastName ?? null,
      wallet.owner?.firstName ?? null,
      wallet.owner?.email ?? null,
      wallet.name,
      wallet.id,
    ]);
  }

  private walletOptionFingerprint(values: unknown[]): string {
    return createHash("sha256")
      .update(JSON.stringify(values))
      .digest("base64url");
  }

  private walletOptionSortMatches(
    cursor: v1.finance.WalletOptionCursorPayload,
    wallet: v1.finance.WalletOption,
  ): boolean {
    return (
      cursor.id === wallet.id &&
      cursor.sortFingerprint === this.walletOptionSortFingerprint(wallet)
    );
  }

  private encodeWalletOptionCursor(
    wallet: v1.finance.WalletOption,
    filters: v1.finance.WalletOptionCursorFilters,
  ): string {
    const payload = v1.finance.walletOptionCursorPayloadSchema.parse({
      version: 1,
      id: wallet.id,
      sortFingerprint: this.walletOptionSortFingerprint(wallet),
      filterFingerprint: this.walletOptionFilterFingerprint(filters),
    });
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  }

  private parseWalletOptionCursor(
    value: string,
  ): v1.finance.WalletOptionCursorPayload {
    try {
      const encoded = Buffer.from(value, "base64url");
      if (encoded.length === 0 || encoded.toString("base64url") !== value) {
        throw new Error("Non-canonical base64url");
      }
      const parsed: unknown = JSON.parse(encoded.toString("utf8"));
      return v1.finance.walletOptionCursorPayloadSchema.parse(parsed);
    } catch {
      throw new BadRequestException("Invalid or stale wallet options cursor");
    }
  }

  private transactionWhere(
    query: v1.finance.ListMoneyTransactionsQuery,
  ): Prisma.MoneyTransactionWhereInput {
    const participantFilters: Prisma.MoneyTransactionWhereInput[] = [];
    if (query.userId) {
      participantFilters.push({
        OR: [
          { counterpartyUserId: query.userId },
          { recipientUserId: query.userId },
          { debtorUserId: query.userId },
          { creditorUserId: query.userId },
          {
            balanceChanges: {
              some: { wallet: { ownerUserId: query.userId } },
            },
          },
        ],
      });
    }
    if (query.counterpartyId) {
      participantFilters.push({
        OR: [
          { counterpartyId: query.counterpartyId },
          { recipientCounterpartyId: query.counterpartyId },
          { debtorCounterpartyId: query.counterpartyId },
          { creditorCounterpartyId: query.counterpartyId },
        ],
      });
    }
    if (query.businessLegalEntityId) {
      participantFilters.push({
        balanceChanges: {
          some: {
            wallet: {
              businessLegalEntities: {
                some: { legalEntityId: query.businessLegalEntityId },
              },
            },
          },
        },
      });
    }

    return {
      status: query.status,
      type: query.types ? { in: query.types } : query.type,
      financialScope: query.financialScope,
      paymentMethod: query.paymentMethod,
      billingStatus: query.billingStatus,
      categoryId: query.categoryId,
      recordedByUserId: query.recordedByUserId,
      ...(query.walletId
        ? { balanceChanges: { some: { walletId: query.walletId } } }
        : {}),
      ...(participantFilters.length > 0 ? { AND: participantFilters } : {}),
      occurredAt:
        query.from || query.to
          ? {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            }
          : undefined,
    };
  }

  private async claimAggregates(
    tx: Prisma.TransactionClient,
    type: MoneyTransactionType,
  ): Promise<ClaimAggregate[]> {
    const rows = await tx.moneyTransaction.groupBy({
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

  private async settlementAggregates(
    tx: Prisma.TransactionClient,
  ): Promise<ClaimAggregate[]> {
    const rows = await tx.moneyTransaction.groupBy({
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
  ): Promise<{ code: string } | null> {
    if (!parentCategoryId) return null;
    const parent = await tx.financialCategory.findUnique({
      where: { id: parentCategoryId },
      select: { code: true, isActive: true },
    });
    if (!parent?.isActive) {
      throw new BadRequestException("Parent financial category is not active");
    }
    return parent;
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
      cardHolder: {
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

  private walletOptionSelect() {
    return {
      id: true,
      type: true,
      name: true,
      isActive: true,
      owner: { select: this.userSummarySelect() },
      cardHolderUserId: true,
      cardHolder: { select: this.userSummarySelect() },
    } satisfies Prisma.WalletSelect;
  }

  private transactionInclude() {
    return {
      category: {
        select: {
          id: true,
          code: true,
          name: true,
          kind: true,
        },
      },
      counterparty: { select: this.userSummarySelect() },
      counterpartyEntity: { select: this.counterpartySummarySelect() },
      recipient: { select: this.userSummarySelect() },
      recipientCounterparty: { select: this.counterpartySummarySelect() },
      debtor: { select: this.userSummarySelect() },
      debtorCounterparty: { select: this.counterpartySummarySelect() },
      creditor: { select: this.userSummarySelect() },
      creditorCounterparty: { select: this.counterpartySummarySelect() },
      recordedBy: { select: this.userSummarySelect() },
      balanceChanges: {
        include: {
          wallet: {
            select: {
              id: true,
              type: true,
              name: true,
              ownerUserId: true,
              owner: { select: this.userSummarySelect() },
            },
          },
        },
        orderBy: [{ walletId: "asc" }, { bucket: "asc" }],
      },
      references: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
      reversals: {
        select: { id: true },
        orderBy: { id: "asc" },
        take: 1,
      },
    } satisfies Prisma.MoneyTransactionInclude;
  }

  private counterpartySummarySelect() {
    return {
      id: true,
      type: true,
      person: {
        select: {
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      company: {
        select: {
          legalName: true,
          legalForm: true,
        },
      },
    } satisfies Prisma.CounterpartySelect;
  }

  private userSummarySelect() {
    return {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    } satisfies Prisma.UserSelect;
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
      throw new ConflictException(
        "A financial category with this or a similar name already exists",
      );
    }
    throw error;
  }
}
