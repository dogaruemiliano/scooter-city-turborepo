import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  buildExpenseAttributionReport,
  buildExpenseDocumentReviewReport,
  buildExpensePaymentSourceReport,
  buildExpenseReimbursementReport,
  expenseClaimOutstandingAmount,
  expenseReportPeriodWhere,
  type ExpenseReportFact,
} from "./expense-reporting.aggregator";

const REPORT_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

const EXPENSE_REPORT_SELECT = {
  id: true,
  currency: true,
  payment: {
    select: {
      source: true,
    },
  },
  costPool: {
    select: {
      grossAmount: true,
      recognizedCostAmount: true,
      attribution: {
        select: {
          target: true,
          businessOwnerId: true,
          allocatedGrossAmount: true,
          allocatedRecognizedCostAmount: true,
          businessOwner: {
            select: {
              userId: true,
              user: { select: REPORT_USER_SELECT },
            },
          },
        },
      },
    },
  },
  documents: {
    select: {
      reviewStatus: true,
      buyerCuiStatus: true,
    },
  },
} satisfies Prisma.ExpenseSelect;

type ExpenseReportRow = Prisma.ExpenseGetPayload<{
  select: typeof EXPENSE_REPORT_SELECT;
}>;

const REIMBURSEMENT_REPORT_SELECT = {
  currency: true,
  status: true,
  originalAmount: true,
  settledAmount: true,
} satisfies Prisma.ExpenseReimbursementClaimSelect;

@Injectable()
export class ExpenseReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async getAttributionReport(
    query: v1.finance.ExpenseReportQuery,
  ): Promise<v1.finance.ExpenseAttributionReport> {
    return buildExpenseAttributionReport(
      await this.getExpenseFacts(query),
      this.context(query),
    );
  }

  async getPaymentSourceReport(
    query: v1.finance.ExpenseReportQuery,
  ): Promise<v1.finance.ExpensePaymentSourceReport> {
    return buildExpensePaymentSourceReport(
      await this.getExpenseFacts(query),
      this.context(query),
    );
  }

  async getDocumentReviewReport(
    query: v1.finance.ExpenseReportQuery,
  ): Promise<v1.finance.ExpenseDocumentReviewReport> {
    return buildExpenseDocumentReviewReport(
      await this.getExpenseFacts(query),
      this.context(query),
    );
  }

  async getReimbursementReport(
    query: v1.finance.ExpenseReportQuery,
  ): Promise<v1.finance.ExpenseReimbursementReport> {
    const claims = await this.prisma.expenseReimbursementClaim.findMany({
      where: {
        expense: { is: expenseReportPeriodWhere(query) },
      },
      select: REIMBURSEMENT_REPORT_SELECT,
    });

    return buildExpenseReimbursementReport(
      claims.map((claim) => ({
        ...claim,
        outstandingAmount: expenseClaimOutstandingAmount(claim),
      })),
      this.context(query),
    );
  }

  private async getExpenseFacts(
    query: v1.finance.ExpenseReportQuery,
  ): Promise<ExpenseReportFact[]> {
    const rows = await this.prisma.expense.findMany({
      where: expenseReportPeriodWhere(query),
      select: EXPENSE_REPORT_SELECT,
    });
    return rows.map(toExpenseReportFact);
  }

  private context(query: v1.finance.ExpenseReportQuery) {
    return {
      from: query.from,
      to: query.to,
      generatedAt: new Date().toISOString(),
    };
  }
}

function toExpenseReportFact(row: ExpenseReportRow): ExpenseReportFact {
  if (!row.payment || !row.costPool || !row.costPool.attribution) {
    throw new InternalServerErrorException(
      `Posted expense ${row.id} is missing its reporting snapshot`,
    );
  }

  const attribution = row.costPool.attribution;
  return {
    id: row.id,
    currency: row.currency,
    grossAmount: row.costPool.grossAmount,
    recognizedCostAmount: row.costPool.recognizedCostAmount,
    payment: { source: row.payment.source },
    attribution: {
      target: attribution.target,
      businessOwnerId: attribution.businessOwnerId,
      allocatedGrossAmount: attribution.allocatedGrossAmount,
      allocatedRecognizedCostAmount: attribution.allocatedRecognizedCostAmount,
      owner: attribution.businessOwner
        ? {
            userId: attribution.businessOwner.userId,
            user: attribution.businessOwner.user,
          }
        : null,
    },
    documents: row.documents,
  };
}
