/**
 * Calculates what associates owe each other for a period, without saving it.
 *
 * Phase 1 supports `COMPANY_SPECIFIC_BENEFIT` only. Pool-cash settlement and
 * persisted settlement runs arrive with the associate-pool phase; asking for
 * them now gets an explicit refusal rather than a silently wrong number.
 */
import { Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import {
  FinanceNotFoundError,
  FinanceValidationError,
} from "../../domain/finance.errors";
import { CompanyBenefitSettlementCalculator } from "../../domain/settlement/company-benefit-settlement.calculator";
import { toFinanceAssociate } from "../../finance.mapper";
import { PrismaFinanceRepository } from "../../infrastructure/prisma-finance.repository";
import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class PreviewSettlementUseCase {
  constructor(
    private readonly calculator: CompanyBenefitSettlementCalculator,
    private readonly repository: PrismaFinanceRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    input: v1.finance.PreviewSettlementInput,
  ): Promise<v1.finance.SettlementPreview> {
    if (input.kind !== "COMPANY_SPECIFIC_BENEFIT") {
      throw new FinanceValidationError(
        "Associate-pool cash settlement is not available yet. Only company specific-benefit settlement can be previewed.",
        { kind: input.kind },
      );
    }

    const book = await this.repository.findBookById(input.bookId);

    if (!book) {
      throw new FinanceNotFoundError("That finance book does not exist.", {
        bookId: input.bookId,
      });
    }

    const periodStart = new Date(input.periodStart);
    const periodEnd = new Date(input.periodEnd);

    // Shares are read as at the end of the period: the split that applied
    // while the costs were being incurred, not today's.
    const shares = await this.repository.listActiveShares(
      input.bookId,
      periodEnd,
    );

    const benefits = await this.repository.listSettleableSpecificBenefits(
      input.bookId,
      periodStart,
      periodEnd,
    );

    const settlement = this.calculator.calculate(shares, benefits);
    const associates = await this.loadAssociates(
      settlement.lines.map((line) => line.associateId),
    );

    return {
      bookId: input.bookId,
      kind: input.kind,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      totalAmountMinor: settlement.totalAmountMinor,
      shares: shares.map((share) => ({
        associateId: share.associateId,
        associate: associates.get(share.associateId) ?? null,
        shareBasisPoints: share.shareBasisPoints,
      })),
      lines: settlement.lines.map((line) => ({
        associateId: line.associateId,
        associate: associates.get(line.associateId) ?? null,
        shareBasisPoints: line.shareBasisPoints,
        actualAmountMinor: line.actualAmountMinor,
        expectedAmountMinor: line.expectedAmountMinor,
        adjustmentMinor: line.adjustmentMinor,
      })),
      transfers: settlement.transfers.map((transfer) => ({
        fromAssociateId: transfer.fromAssociateId,
        fromAssociate: associates.get(transfer.fromAssociateId) ?? null,
        toAssociateId: transfer.toAssociateId,
        toAssociate: associates.get(transfer.toAssociateId) ?? null,
        amountMinor: transfer.amountMinor,
      })),
      operationIds: settlement.operationIds,
      calculatedAt: new Date().toISOString(),
    };
  }

  private async loadAssociates(
    associateIds: string[],
  ): Promise<Map<string, v1.finance.FinanceAssociate>> {
    if (associateIds.length === 0) return new Map();

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(associateIds)] } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    return new Map(users.map((user) => [user.id, toFinanceAssociate(user)]));
  }
}
