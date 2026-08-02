import { Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import type { Prisma } from "../generated/prisma/client";
import {
  ExpensePostingRole,
  ExpenseStatus,
  MoneyTransactionStatus,
  MoneyTransactionType,
  Prisma as PrismaRuntime,
  WalletBalanceBucket,
  WalletType,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const REPORTING_TRANSACTION_MAX_WAIT_MS = 5_000;
const REPORTING_TRANSACTION_TIMEOUT_MS = 10_000;
const DEFAULT_REPORTING_CURRENCY = "RON";
const CURRENT_ADMIN_DEFAULT_BUCKETS = [
  WalletBalanceBucket.BUSINESS_FUNDS,
  WalletBalanceBucket.ADMIN_PERSONAL_FUNDS,
  WalletBalanceBucket.USER_SETTLEMENT,
] as const;
const USER_FUNDS_BUCKETS = [
  WalletBalanceBucket.BUSINESS_FUNDS,
  WalletBalanceBucket.ADMIN_PERSONAL_FUNDS,
] as const;

const FINANCE_USER_SUMMARY_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

const REPORTING_WALLET_SELECT = {
  id: true,
  type: true,
  ownerUserId: true,
  name: true,
  owner: {
    select: {
      ...FINANCE_USER_SUMMARY_SELECT,
      roles: true,
      deletedAt: true,
    },
  },
  balances: {
    select: {
      bucket: true,
      currency: true,
      balance: true,
    },
  },
} satisfies Prisma.WalletSelect;

@Injectable()
export class FinanceReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    query: v1.finance.FinanceSummaryQuery,
  ): Promise<v1.finance.FinanceSummary> {
    const from = new Date(query.from);
    const to = new Date(query.to);

    return this.prisma.$transaction(
      async (tx) => {
        const [snapshot] = await tx.$queryRaw<Array<{ generatedAt: Date }>>`
          SELECT CURRENT_TIMESTAMP AS "generatedAt"
        `;
        const postedInPeriod = {
          status: MoneyTransactionStatus.POSTED,
          occurredAt: {
            gte: from,
            lt: to,
          },
        } as const;

        const totals = await tx.moneyTransaction.groupBy({
          by: ["type", "currency"],
          where: {
            ...postedInPeriod,
            OR: [
              { type: MoneyTransactionType.INCOME },
              {
                type: MoneyTransactionType.EXPENSE,
                expensePostings: {
                  none: { role: ExpensePostingRole.EXPENSE_PAYMENT },
                },
              },
            ],
          },
          _sum: { amount: true },
        });
        const specializedExpenseTotals = await tx.expense.groupBy({
          by: ["currency"],
          where: {
            status: ExpenseStatus.POSTED,
            occurredOn: { gte: from, lt: to },
          },
          _sum: { grossAmount: true },
        });
        const paymentMethods = await tx.moneyTransaction.groupBy({
          by: ["paymentMethod", "currency"],
          where: {
            ...postedInPeriod,
            type: MoneyTransactionType.INCOME,
          },
          _sum: { amount: true },
        });
        const expenseCategories = await tx.moneyTransaction.groupBy({
          by: ["categoryId", "currency"],
          where: {
            ...postedInPeriod,
            type: MoneyTransactionType.EXPENSE,
            expensePostings: {
              none: { role: ExpensePostingRole.EXPENSE_PAYMENT },
            },
          },
          _sum: { amount: true },
        });
        const specializedExpenseCategories = await tx.expense.groupBy({
          by: ["categoryId", "currency"],
          where: {
            status: ExpenseStatus.POSTED,
            occurredOn: { gte: from, lt: to },
          },
          _sum: { grossAmount: true },
        });
        const billingStatuses = await tx.moneyTransaction.groupBy({
          by: ["billingStatus", "currency"],
          where: {
            ...postedInPeriod,
            type: MoneyTransactionType.INCOME,
          },
          _sum: { amount: true },
        });
        const incomeScopes = await tx.moneyTransaction.groupBy({
          by: ["financialScope", "currency"],
          where: {
            ...postedInPeriod,
            type: MoneyTransactionType.INCOME,
          },
          _sum: { amount: true },
        });

        const mergedExpenseCategories = new Map<
          string,
          {
            categoryId: string | null;
            currency: string;
            amount: Prisma.Decimal;
          }
        >();
        const addExpenseCategory = (
          categoryId: string | null,
          currency: string,
          value: Prisma.Decimal | null,
        ) => {
          const key = `${categoryId ?? ""}:${currency}`;
          const current = mergedExpenseCategories.get(key);
          mergedExpenseCategories.set(key, {
            categoryId,
            currency,
            amount: (current?.amount ?? new PrismaRuntime.Decimal(0)).plus(
              value ?? 0,
            ),
          });
        };
        expenseCategories.forEach((row) =>
          addExpenseCategory(row.categoryId, row.currency, row._sum.amount),
        );
        specializedExpenseCategories.forEach((row) =>
          addExpenseCategory(
            row.categoryId,
            row.currency,
            row._sum.grossAmount,
          ),
        );
        const combinedExpenseCategories = [...mergedExpenseCategories.values()];

        const categoryIds = combinedExpenseCategories.flatMap((row) =>
          row.categoryId ? [row.categoryId] : [],
        );
        const categories = await tx.financialCategory.findMany({
          where: { id: { in: categoryIds } },
          select: {
            id: true,
            code: true,
            name: true,
            kind: true,
          },
        });
        const categoryById = new Map(
          categories.map((category) => [category.id, category]),
        );

        const companyWallets = await tx.wallet.findMany({
          where: {
            type: { not: WalletType.USER },
          },
          select: REPORTING_WALLET_SELECT,
        });
        const relevantUserWallets = await tx.wallet.findMany({
          where: {
            type: WalletType.USER,
            OR: [
              {
                owner: {
                  is: {
                    deletedAt: null,
                    roles: { has: "ADMIN" },
                  },
                },
              },
              {
                balances: {
                  some: {
                    bucket: { in: [...USER_FUNDS_BUCKETS] },
                  },
                },
              },
            ],
          },
          select: REPORTING_WALLET_SELECT,
        });

        const amount = (value: Prisma.Decimal | null): string =>
          value?.toFixed(2) ?? "0.00";
        const byCurrency = (
          first: { currency: string },
          second: { currency: string },
        ): number => first.currency.localeCompare(second.currency);
        const toWalletSummary = (wallet: (typeof companyWallets)[number]) => ({
          id: wallet.id,
          type: wallet.type,
          ownerUserId: wallet.ownerUserId,
          name: wallet.name,
          owner: wallet.owner
            ? {
                id: wallet.owner.id,
                email: wallet.owner.email,
                firstName: wallet.owner.firstName,
                lastName: wallet.owner.lastName,
              }
            : null,
        });
        const balanceKey = (
          bucket: WalletBalanceBucket,
          currency: string,
        ): string => `${bucket}:${currency}`;
        const toWalletBalanceSnapshots = (
          wallet: (typeof companyWallets)[number],
          defaultBuckets: readonly WalletBalanceBucket[],
          ownerStatus: {
            ownerIsActive: boolean | null;
            ownerIsAdmin: boolean | null;
          },
        ) => {
          const walletSummary = toWalletSummary(wallet);
          const snapshots = wallet.balances.map((balance) => ({
            wallet: walletSummary,
            bucket: balance.bucket,
            currency: balance.currency,
            balance: balance.balance.toFixed(2),
            ...ownerStatus,
          }));
          const existingBalances = new Set(
            wallet.balances.map((balance) =>
              balanceKey(balance.bucket, balance.currency),
            ),
          );

          for (const bucket of defaultBuckets) {
            if (
              existingBalances.has(
                balanceKey(bucket, DEFAULT_REPORTING_CURRENCY),
              )
            ) {
              continue;
            }
            snapshots.push({
              wallet: walletSummary,
              bucket,
              currency: DEFAULT_REPORTING_CURRENCY,
              balance: "0.00",
              ...ownerStatus,
            });
          }
          return snapshots;
        };
        const companyBalances = companyWallets.flatMap((wallet) =>
          toWalletBalanceSnapshots(
            wallet,
            [WalletBalanceBucket.BUSINESS_FUNDS],
            {
              ownerIsActive: null,
              ownerIsAdmin: null,
            },
          ),
        );
        const adminBalances = relevantUserWallets.flatMap((wallet) => {
          const ownerIsActive =
            wallet.owner !== null && wallet.owner.deletedAt === null;
          const ownerIsAdmin = wallet.owner?.roles.includes("ADMIN") ?? false;
          const isCurrentAdmin = ownerIsActive && ownerIsAdmin;
          return toWalletBalanceSnapshots(
            wallet,
            isCurrentAdmin ? CURRENT_ADMIN_DEFAULT_BUCKETS : [],
            { ownerIsActive, ownerIsAdmin },
          );
        });
        const byBalanceSnapshot = (
          first: (typeof companyBalances)[number],
          second: (typeof companyBalances)[number],
        ): number =>
          [
            first.wallet.type,
            first.wallet.name,
            first.wallet.id,
            first.bucket,
            first.currency,
          ]
            .join(":")
            .localeCompare(
              [
                second.wallet.type,
                second.wallet.name,
                second.wallet.id,
                second.bucket,
                second.currency,
              ].join(":"),
            );
        const income = totals
          .filter((row) => row.type === MoneyTransactionType.INCOME)
          .map((row) => ({
            currency: row.currency,
            amount: amount(row._sum.amount),
          }))
          .sort(byCurrency);
        const expenseAmounts = new Map<string, Prisma.Decimal>();
        const addExpenseAmount = (
          currency: string,
          value: Prisma.Decimal | null,
        ) => {
          expenseAmounts.set(
            currency,
            (expenseAmounts.get(currency) ?? new PrismaRuntime.Decimal(0)).plus(
              value ?? 0,
            ),
          );
        };
        totals
          .filter((row) => row.type === MoneyTransactionType.EXPENSE)
          .forEach((row) => addExpenseAmount(row.currency, row._sum.amount));
        specializedExpenseTotals.forEach((row) =>
          addExpenseAmount(row.currency, row._sum.grossAmount),
        );
        const expenses = [...expenseAmounts.entries()]
          .map(([currency, value]) => ({
            currency,
            amount: amount(value),
          }))
          .sort(byCurrency);
        const totalCurrencies = [
          ...new Set([
            ...income.map((row) => row.currency),
            ...expenses.map((row) => row.currency),
          ]),
        ].sort();
        const incomeByCurrency = new Map(
          income.map((row) => [row.currency, row.amount]),
        );
        const expensesByCurrency = new Map(
          expenses.map((row) => [row.currency, row.amount]),
        );
        const currencyTotals = totalCurrencies.map((currency) => ({
          currency,
          income: incomeByCurrency.get(currency) ?? "0.00",
          expenses: expensesByCurrency.get(currency) ?? "0.00",
        }));
        const companyMoney = companyBalances.flatMap((balance) =>
          balance.bucket === WalletBalanceBucket.BUSINESS_FUNDS &&
          balance.wallet.type !== WalletType.USER
            ? [
                {
                  walletId: balance.wallet.id,
                  walletType: balance.wallet.type,
                  walletName: balance.wallet.name,
                  currency: balance.currency,
                  amount: balance.balance,
                },
              ]
            : [],
        );
        const adminMoneyByKey = new Map<
          string,
          v1.finance.FinanceSummary["adminMoney"][number]
        >();
        for (const balance of adminBalances) {
          const admin = balance.wallet.owner;
          if (!admin) continue;

          const key = `${admin.id}:${balance.currency}`;
          const adminMoney = adminMoneyByKey.get(key) ?? {
            admin,
            currency: balance.currency,
            businessFunds: "0.00",
            personalFunds: "0.00",
            customerGuaranteeFunds: "0.00",
          };
          if (balance.bucket === WalletBalanceBucket.BUSINESS_FUNDS) {
            adminMoney.businessFunds = balance.balance;
          } else if (
            balance.bucket === WalletBalanceBucket.ADMIN_PERSONAL_FUNDS
          ) {
            adminMoney.personalFunds = balance.balance;
          } else if (
            balance.bucket === WalletBalanceBucket.CUSTOMER_GUARANTEE_FUNDS
          ) {
            adminMoney.customerGuaranteeFunds = balance.balance;
          }
          adminMoneyByKey.set(key, adminMoney);
        }
        const adminMoney = [...adminMoneyByKey.values()].sort((first, second) =>
          [
            first.admin.lastName ?? "",
            first.admin.firstName ?? "",
            first.admin.email,
            first.admin.id,
            first.currency,
          ]
            .join(":")
            .localeCompare(
              [
                second.admin.lastName ?? "",
                second.admin.firstName ?? "",
                second.admin.email,
                second.admin.id,
                second.currency,
              ].join(":"),
            ),
        );

        return {
          from: query.from,
          to: query.to,
          period: {
            from: query.from,
            to: query.to,
          },
          income,
          expenses,
          totals: currencyTotals,
          incomeByPaymentMethod: paymentMethods
            .map((row) => ({
              paymentMethod: row.paymentMethod,
              currency: row.currency,
              amount: amount(row._sum.amount),
            }))
            .sort((first, second) =>
              `${first.currency}:${first.paymentMethod ?? ""}`.localeCompare(
                `${second.currency}:${second.paymentMethod ?? ""}`,
              ),
            ),
          expensesByCategory: combinedExpenseCategories
            .map((row) => ({
              category: row.categoryId
                ? (categoryById.get(row.categoryId) ?? null)
                : null,
              currency: row.currency,
              amount: amount(row.amount),
            }))
            .sort((first, second) =>
              [
                first.currency,
                first.category?.name ?? "",
                first.category?.id ?? "",
              ]
                .join(":")
                .localeCompare(
                  [
                    second.currency,
                    second.category?.name ?? "",
                    second.category?.id ?? "",
                  ].join(":"),
                ),
            ),
          incomeByBillingStatus: billingStatuses
            .map((row) => ({
              billingStatus: row.billingStatus,
              currency: row.currency,
              amount: amount(row._sum.amount),
            }))
            .sort((first, second) =>
              `${first.currency}:${first.billingStatus}`.localeCompare(
                `${second.currency}:${second.billingStatus}`,
              ),
            ),
          incomeByScope: incomeScopes
            .map((row) => ({
              financialScope: row.financialScope,
              currency: row.currency,
              amount: amount(row._sum.amount),
            }))
            .sort((first, second) =>
              `${first.currency}:${first.financialScope}`.localeCompare(
                `${second.currency}:${second.financialScope}`,
              ),
            ),
          companyMoney,
          adminMoney,
          currentBalances: {
            company: companyBalances.sort(byBalanceSnapshot),
            admins: adminBalances.sort(byBalanceSnapshot),
          },
          generatedAt: snapshot.generatedAt.toISOString(),
        };
      },
      {
        isolationLevel: PrismaRuntime.TransactionIsolationLevel.RepeatableRead,
        maxWait: REPORTING_TRANSACTION_MAX_WAIT_MS,
        timeout: REPORTING_TRANSACTION_TIMEOUT_MS,
      },
    );
  }
}
