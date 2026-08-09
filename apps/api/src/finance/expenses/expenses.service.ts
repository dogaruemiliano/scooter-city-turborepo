import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import {
  assertExpenseDocumentMetadataPolicy,
  normalizeTaxIdentifier,
} from "../../expense-documents/expense-document.policy";
import {
  BillingStatus,
  ExpenseAttributionTarget,
  ExpenseFundingTreatment,
  ExpensePaymentSource,
  ExpensePostingRole,
  ExpenseReimbursementStatus,
  ExpenseStatus,
  FinancialCategoryKind,
  MoneyTransactionScope,
  MoneyTransactionStatus,
  MoneyTransactionType,
  PaymentMethod,
  Prisma,
  WalletBalanceBucket,
  WalletType,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  dateOnly,
  expenseInclude,
  type ExpenseRecord,
  toExpense,
  toExpenseReimbursementClaim,
} from "./expense.mapper";

const SERIALIZABLE_ATTEMPTS = 3;
const FISCAL_EVIDENCE_TYPES = new Set<v1.finance.ExpenseDocumentType>([
  "FISCAL_RECEIPT",
  "INVOICE",
]);
/**
 * The seeded "Achiziție scuter" (scooter purchase) FinancialCategory id
 * (apps/api/prisma/seeds/finance.ts, financeCategorySeedId("SCOOTER_PURCHASE")).
 * A posted expense in this category links its allocated scooters'
 * `Scooter.purchaseAllocationId` — see postInTx/reverse below. Matched by id,
 * not by the generated `code` column, since `code` is regenerated from the
 * category's current name on every rename.
 */
const SCOOTER_PURCHASE_CATEGORY_ID = "seed-finance-category-scooter-purchase";

interface ExpensePostingEvidenceDocument {
  type: v1.finance.ExpenseDocumentType;
  buyerCuiStatus: v1.finance.ExpenseBuyerCuiStatus;
  buyerTaxIdentifier: string | null;
  reviewStatus: v1.finance.ExpenseDocumentReviewStatus;
  assets: ReadonlyArray<{
    role: v1.finance.ExpenseDocumentAssetRole;
    asset: { deletedAt: Date | null };
  }>;
}

/**
 * Locks the receipt policy only when an expense is posted. Drafts deliberately
 * remain incomplete while the browser uploads and confirms their private files.
 */
export function assertExpensePostingEvidence(input: {
  paymentSource: v1.finance.ExpensePaymentSource;
  expectedBuyerTaxIdentifier: string;
  documents: readonly ExpensePostingEvidenceDocument[];
}): void {
  if (input.paymentSource === "PERSONAL_FUNDS") {
    if (
      input.documents.some((document) => document.buyerCuiStatus === "MATCHED")
    ) {
      throw new BadRequestException(
        "Personal-funds expenses cannot claim matched company-buyer evidence",
      );
    }
    return;
  }

  const expectedBuyerTaxIdentifier = normalizeTaxIdentifier(
    input.expectedBuyerTaxIdentifier,
  );
  const hasUploadedOriginal = (document: ExpensePostingEvidenceDocument) =>
    document.assets.some(
      (link) => link.role === "ORIGINAL" && link.asset.deletedAt === null,
    );
  const hasFiscalEvidence = input.documents.some(
    (document) =>
      FISCAL_EVIDENCE_TYPES.has(document.type) &&
      document.reviewStatus === "CONFIRMED" &&
      document.buyerCuiStatus === "MATCHED" &&
      normalizeTaxIdentifier(document.buyerTaxIdentifier) ===
        expectedBuyerTaxIdentifier &&
      hasUploadedOriginal(document),
  );
  if (!hasFiscalEvidence) {
    throw new BadRequestException(
      "Company-funded expenses require a confirmed invoice or fiscal receipt with the legal entity's matched buyer CUI and an uploaded original file",
    );
  }

  if (
    input.paymentSource === "COMPANY_CARD" &&
    !input.documents.some(
      (document) =>
        document.type === "POS_RECEIPT" &&
        document.reviewStatus === "CONFIRMED" &&
        hasUploadedOriginal(document),
    )
  ) {
    throw new BadRequestException(
      "Company-card expenses additionally require a confirmed POS receipt with an uploaded original file",
    );
  }
}

interface ExpenseContext {
  actorUserId: string;
}

interface ExpenseFacts {
  legalEntityId: string;
  occurredOn: Date;
  taxPointOn: Date;
  grossAmount: Prisma.Decimal;
  currency: string;
  /** Absent for a quick-entry expense with no known recipient. */
  payeeId: string | null;
  /** Absent for a quick-entry expense not yet categorized. */
  categoryId: string | null;
  scooterAllocations: Array<{ scooterId: string; amount: Prisma.Decimal }>;
  payment: {
    source: v1.finance.ExpensePaymentSource;
    companyWalletId: string | null;
    fundedByUserId: string | null;
    paidByUserId: string;
    amount: Prisma.Decimal;
    paidOn: Date;
  };
  attribution: {
    target: v1.finance.ExpenseAttributionTarget;
    businessOwnerId: string | null;
  };
  taxLines: v1.finance.ExpenseTaxLineInput[];
  documents: Array<{
    type: v1.finance.ExpenseDocumentType;
    buyerCuiStatus: v1.finance.ExpenseBuyerCuiStatus;
    buyerTaxIdentifier?: string | null;
    reviewStatus: v1.finance.ExpenseDocumentReviewStatus;
  }>;
  requestedFiscalDeductibleAmount?: string;
}

interface TaxComputation {
  vatRegistrationPeriodId: string | null;
  vatRegistrationCountryCode: string | null;
  vatRegistrationNumber: string | null;
  legalEntityTaxIdentifier: string;
  isVatRegistered: boolean;
  grossAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  recoverableVatAmount: Prisma.Decimal;
  nonRecoverableVatAmount: Prisma.Decimal;
  recognizedCostAmount: Prisma.Decimal;
  fiscalDeductibleAmount: Prisma.Decimal;
  lines: Array<{
    vatRate: Prisma.Decimal;
    netAmount: Prisma.Decimal;
    vatAmount: Prisma.Decimal;
    grossAmount: Prisma.Decimal;
    deductiblePercent: Prisma.Decimal;
    recoverableVatAmount: Prisma.Decimal;
    nonRecoverableVatAmount: Prisma.Decimal;
  }>;
}

interface ValidatedFacts {
  treatment: ExpenseFundingTreatment;
  tax: TaxComputation;
}

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: v1.finance.CreateExpenseInput,
    context: ExpenseContext,
  ): Promise<v1.finance.Expense> {
    const duplicate = await this.findByCreateIdempotencyKey(
      input.idempotencyKey,
    );
    if (duplicate) return toExpense(duplicate);

    try {
      const expense = await this.runSerializable(async (tx) => {
        const inTransactionDuplicate = await tx.expense.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: expenseInclude,
        });
        if (inTransactionDuplicate) return inTransactionDuplicate;

        const facts = this.createFacts(input);
        const validated = await this.validateFacts(tx, facts);
        const created = await tx.expense.create({
          data: {
            legalEntityId: facts.legalEntityId,
            payeeId: facts.payeeId,
            categoryId: facts.categoryId,
            occurredOn: facts.occurredOn,
            taxPointOn: facts.taxPointOn,
            currency: facts.currency,
            grossAmount: facts.grossAmount,
            recognizedCostAmount: validated.tax.recognizedCostAmount,
            fiscalDeductibleAmount: validated.tax.fiscalDeductibleAmount,
            notes: input.notes ?? null,
            idempotencyKey: input.idempotencyKey,
            createdByUserId: context.actorUserId,
            updatedByUserId: context.actorUserId,
            payment: {
              create: {
                source: facts.payment.source,
                companyWalletId: facts.payment.companyWalletId,
                fundedByUserId: facts.payment.fundedByUserId,
                paidByUserId: facts.payment.paidByUserId,
                amount: facts.payment.amount,
                paidOn: facts.payment.paidOn,
                fundingTreatment: validated.treatment,
              },
            },
            costPool: {
              create: {
                grossAmount: facts.grossAmount,
                recognizedCostAmount: validated.tax.recognizedCostAmount,
                attribution: {
                  create: {
                    target: facts.attribution.target,
                    businessOwnerId: facts.attribution.businessOwnerId,
                    percentage: new Prisma.Decimal(100),
                    allocatedGrossAmount: facts.grossAmount,
                    allocatedRecognizedCostAmount:
                      validated.tax.recognizedCostAmount,
                  },
                },
              },
            },
            taxSnapshot: {
              create: this.taxSnapshotCreateData(facts, validated.tax),
            },
            references: {
              create: input.references.map((reference) => ({
                referenceType: reference.referenceType,
                referenceId: reference.referenceId,
                isPrimary: reference.isPrimary,
              })),
            },
            documents: {
              create: input.documents.map((document) => ({
                type: document.type,
                documentSeries: document.documentSeries ?? null,
                documentNumber: document.documentNumber ?? null,
                supplierName: document.supplierName ?? null,
                supplierTaxIdentifier: document.supplierTaxIdentifier ?? null,
                buyerTaxIdentifier: document.buyerTaxIdentifier ?? null,
                issuedOn: document.issuedOn ? date(document.issuedOn) : null,
                buyerCuiStatus: document.buyerCuiStatus,
                reviewStatus: document.reviewStatus,
                reviewedByUserId:
                  document.reviewStatus === "PENDING"
                    ? null
                    : context.actorUserId,
                reviewedAt:
                  document.reviewStatus === "PENDING" ? null : new Date(),
                notes: document.notes ?? null,
              })),
            },
            scooterAllocations: {
              create: facts.scooterAllocations.map((allocation) => ({
                scooterId: allocation.scooterId,
                allocatedGrossAmount: allocation.amount,
              })),
            },
          },
          include: expenseInclude,
        });

        return input.postImmediately
          ? this.postInTx(
              tx,
              created,
              `create:${input.idempotencyKey}:post`,
              context,
            )
          : created;
      });
      return toExpense(expense);
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const existing = await this.findByCreateIdempotencyKey(
          input.idempotencyKey,
        );
        if (existing) return toExpense(existing);
      }
      this.handleWriteError(error);
    }
  }

  async get(id: string): Promise<v1.finance.Expense> {
    return toExpense(await this.getRecord(this.prisma, id));
  }

  async list(
    query: v1.finance.ListExpensesQuery,
  ): Promise<v1.finance.ExpenseList> {
    const where: Prisma.ExpenseWhereInput = {
      legalEntityId: query.legalEntityId,
      status: query.status,
      categoryId: query.categoryId,
      payeeId: query.payeeId,
      ...(query.attributionTarget
        ? {
            costPool: {
              is: {
                attribution: { is: { target: query.attributionTarget } },
              },
            },
          }
        : {}),
      occurredOn:
        query.from || query.to
          ? {
              ...(query.from ? { gte: date(query.from) } : {}),
              ...(query.to ? { lt: date(query.to) } : {}),
            }
          : undefined,
    };
    const [total, records] = await this.prisma.$transaction([
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where,
        include: expenseInclude,
        orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: records.map(toExpense),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async update(
    id: string,
    input: v1.finance.UpdateExpenseInput,
    context: ExpenseContext,
  ): Promise<v1.finance.Expense> {
    try {
      const updated = await this.runSerializable(async (tx) => {
        const current = await this.getRecord(tx, id);
        if (current.status !== ExpenseStatus.DRAFT) {
          throw new ConflictException("Only draft expenses can be updated");
        }

        const payment = required(current.payment, "payment");
        const pool = required(current.costPool, "cost pool");
        const attribution = required(pool.attribution, "cost attribution");
        const facts: ExpenseFacts = {
          legalEntityId: current.legalEntityId,
          occurredOn: input.occurredOn
            ? date(input.occurredOn)
            : current.occurredOn,
          taxPointOn: input.taxPointOn
            ? date(input.taxPointOn)
            : current.taxPointOn,
          grossAmount: current.grossAmount,
          currency: current.currency,
          payeeId: input.payeeId ?? current.payeeId,
          categoryId: input.categoryId ?? current.categoryId,
          scooterAllocations: current.scooterAllocations.map((allocation) => ({
            scooterId: allocation.scooterId,
            amount: allocation.allocatedGrossAmount,
          })),
          payment: input.payment
            ? {
                source: input.payment.source,
                companyWalletId: input.payment.companyWalletId ?? null,
                fundedByUserId: input.payment.fundedByUserId ?? null,
                paidByUserId: input.payment.paidByUserId,
                amount: new Prisma.Decimal(input.payment.amount),
                paidOn: date(input.payment.paidOn),
              }
            : {
                source: payment.source,
                companyWalletId: payment.companyWalletId,
                fundedByUserId: payment.fundedByUserId,
                paidByUserId: payment.paidByUserId,
                amount: payment.amount,
                paidOn: payment.paidOn,
              },
          attribution: input.attribution
            ? {
                target: input.attribution.target,
                businessOwnerId: input.attribution.businessOwnerId ?? null,
              }
            : {
                target: attribution.target,
                businessOwnerId: attribution.businessOwnerId,
              },
          taxLines:
            input.taxLines ??
            required(current.taxSnapshot, "tax snapshot").lines.map((line) => ({
              vatRate: line.vatRate.toFixed(4),
              netAmount: line.netAmount.toFixed(2),
              vatAmount: line.vatAmount.toFixed(2),
              grossAmount: line.grossAmount.toFixed(2),
              deductiblePercent: line.deductiblePercent.toFixed(4),
            })),
          documents: current.documents.map((document) => ({
            type: document.type,
            buyerCuiStatus: document.buyerCuiStatus,
            buyerTaxIdentifier: document.buyerTaxIdentifier,
            reviewStatus: document.reviewStatus,
          })),
          requestedFiscalDeductibleAmount: input.fiscalDeductibleAmount,
        };
        const validated = await this.validateFacts(tx, facts);
        const taxSnapshot = required(current.taxSnapshot, "tax snapshot");

        await tx.expense.update({
          where: { id },
          data: {
            payeeId: facts.payeeId,
            categoryId: facts.categoryId,
            occurredOn: facts.occurredOn,
            taxPointOn: facts.taxPointOn,
            recognizedCostAmount: validated.tax.recognizedCostAmount,
            fiscalDeductibleAmount: validated.tax.fiscalDeductibleAmount,
            notes: input.notes === undefined ? current.notes : input.notes,
            updatedByUserId: context.actorUserId,
          },
        });
        await tx.expensePayment.update({
          where: { expenseId: id },
          data: {
            source: facts.payment.source,
            companyWalletId: facts.payment.companyWalletId,
            fundedByUserId: facts.payment.fundedByUserId,
            paidByUserId: facts.payment.paidByUserId,
            amount: facts.payment.amount,
            paidOn: facts.payment.paidOn,
            fundingTreatment: validated.treatment,
          },
        });
        await tx.expenseCostPool.update({
          where: { expenseId: id },
          data: {
            recognizedCostAmount: validated.tax.recognizedCostAmount,
            attribution: {
              update: {
                target: facts.attribution.target,
                businessOwnerId: facts.attribution.businessOwnerId,
                allocatedRecognizedCostAmount:
                  validated.tax.recognizedCostAmount,
              },
            },
          },
        });
        await tx.expenseTaxLine.deleteMany({
          where: { taxSnapshotId: taxSnapshot.id },
        });
        await tx.expenseTaxSnapshot.update({
          where: { id: taxSnapshot.id },
          data: this.taxSnapshotUpdateData(facts, validated.tax),
        });
        if (input.references) {
          await tx.expenseReference.deleteMany({ where: { expenseId: id } });
          if (input.references.length > 0) {
            await tx.expenseReference.createMany({
              data: input.references.map((reference) => ({
                expenseId: id,
                referenceType: reference.referenceType,
                referenceId: reference.referenceId,
                isPrimary: reference.isPrimary,
              })),
            });
          }
        }
        return this.getRecord(tx, id);
      });
      return toExpense(updated);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async post(
    id: string,
    input: v1.finance.ExpenseActionInput,
    context: ExpenseContext,
  ): Promise<v1.finance.Expense> {
    try {
      const posted = await this.runSerializable(async (tx) => {
        const current = await this.getRecord(tx, id);
        if (current.postIdempotencyKey === input.idempotencyKey) return current;
        if (current.status !== ExpenseStatus.DRAFT) {
          throw new ConflictException("Expense is already posted or reversed");
        }
        return this.postInTx(tx, current, input.idempotencyKey, context);
      });
      return toExpense(posted);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async reverse(
    id: string,
    input: v1.finance.ExpenseActionInput,
    context: ExpenseContext,
  ): Promise<v1.finance.Expense> {
    try {
      const reversed = await this.runSerializable(async (tx) => {
        const current = await this.getRecord(tx, id);
        if (current.reverseIdempotencyKey === input.idempotencyKey) {
          return current;
        }
        if (current.status !== ExpenseStatus.POSTED) {
          throw new ConflictException("Only a posted expense can be reversed");
        }
        const payment = required(current.payment, "payment");
        const claim = current.reimbursementClaim;
        if (claim?.settledAmount.greaterThan(0)) {
          throw new ConflictException(
            "Settled reimbursement claims cannot be reversed in compact v1",
          );
        }
        if (claim) {
          await tx.expenseReimbursementClaim.update({
            where: { id: claim.id },
            data: { status: ExpenseReimbursementStatus.CANCELLED },
          });
        }

        if (payment.source !== ExpensePaymentSource.PERSONAL_FUNDS) {
          const originalPosting = current.postings.find(
            (posting) => posting.role === ExpensePostingRole.EXPENSE_PAYMENT,
          );
          if (!originalPosting || !payment.companyWalletId) {
            throw new ConflictException("Expense payment posting is missing");
          }
          await tx.moneyTransaction.update({
            where: { id: originalPosting.moneyTransactionId },
            data: { status: MoneyTransactionStatus.REVERSED },
          });
          const reversal = await tx.moneyTransaction.create({
            data: {
              type: MoneyTransactionType.REVERSAL,
              status: MoneyTransactionStatus.POSTED,
              amount: current.grossAmount,
              currency: current.currency,
              financialScope: MoneyTransactionScope.COMPANY,
              billingStatus: BillingStatus.NOT_APPLICABLE,
              recordedByUserId: context.actorUserId,
              occurredAt: new Date(),
              description: input.reason ?? `Expense reversal for ${current.id}`,
              idempotencyKey: input.idempotencyKey,
              reversalOfTransactionId: originalPosting.moneyTransactionId,
              balanceChanges: {
                create: {
                  walletId: payment.companyWalletId,
                  bucket: WalletBalanceBucket.BUSINESS_FUNDS,
                  currency: current.currency,
                  amountDelta: current.grossAmount,
                },
              },
              references: {
                create: {
                  referenceType: "EXPENSE",
                  referenceId: current.id,
                  isPrimary: true,
                },
              },
            },
          });
          await this.applyWalletDelta(
            tx,
            payment.companyWalletId,
            current.currency,
            current.grossAmount,
          );
          await tx.expensePosting.create({
            data: {
              expenseId: current.id,
              role: ExpensePostingRole.EXPENSE_REVERSAL,
              moneyTransactionId: reversal.id,
            },
          });
        }

        await tx.expense.update({
          where: { id: current.id },
          data: {
            status: ExpenseStatus.REVERSED,
            reverseIdempotencyKey: input.idempotencyKey,
            reversedByUserId: context.actorUserId,
            reversedAt: new Date(),
            reversalReason: input.reason ?? null,
            updatedByUserId: context.actorUserId,
          },
        });

        if (current.scooterAllocations.length > 0) {
          await tx.scooter.updateMany({
            where: {
              purchaseAllocationId: {
                in: current.scooterAllocations.map(
                  (allocation) => allocation.id,
                ),
              },
            },
            data: { purchaseAllocationId: null },
          });
        }

        return this.getRecord(tx, id);
      });
      return toExpense(reversed);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async listReimbursements(
    query: v1.finance.ListExpenseReimbursementsQuery,
  ): Promise<v1.finance.ExpenseReimbursementList> {
    const where: Prisma.ExpenseReimbursementClaimWhereInput = {
      legalEntityId: query.legalEntityId,
      status: query.status,
      claimantUserId: query.claimantUserId,
    };
    const [total, claims] = await this.prisma.$transaction([
      this.prisma.expenseReimbursementClaim.count({ where }),
      this.prisma.expenseReimbursementClaim.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: claims.map(toExpenseReimbursementClaim),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async settleReimbursement(
    claimId: string,
    input: v1.finance.SettleExpenseReimbursementInput,
    context: ExpenseContext,
  ): Promise<v1.finance.ExpenseReimbursementClaim> {
    const duplicate =
      await this.prisma.expenseReimbursementSettlement.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { claim: true },
      });
    if (duplicate) {
      if (duplicate.claimId !== claimId) {
        throw new ConflictException(
          "Idempotency key belongs to another reimbursement claim",
        );
      }
      return toExpenseReimbursementClaim(duplicate.claim);
    }

    try {
      const claim = await this.runSerializable(async (tx) => {
        const current = await tx.expenseReimbursementClaim.findUnique({
          where: { id: claimId },
          include: {
            expense: true,
            expensePayment: true,
          },
        });
        if (!current)
          throw new NotFoundException("Reimbursement claim not found");
        if (
          current.status === ExpenseReimbursementStatus.CANCELLED ||
          current.status === ExpenseReimbursementStatus.SETTLED
        ) {
          throw new ConflictException("Reimbursement claim is not open");
        }
        if (current.expense.status !== ExpenseStatus.POSTED) {
          throw new ConflictException("Only posted expenses can be reimbursed");
        }
        if (
          current.expensePayment.source !==
            ExpensePaymentSource.PERSONAL_FUNDS ||
          current.expensePayment.fundingTreatment !==
            ExpenseFundingTreatment.REIMBURSABLE ||
          current.expensePayment.fundedByUserId !== current.claimantUserId
        ) {
          throw new ConflictException("Claim funding facts are inconsistent");
        }

        const amount = new Prisma.Decimal(input.amount);
        const outstanding = current.originalAmount.minus(current.settledAmount);
        if (amount.greaterThan(outstanding)) {
          throw new BadRequestException(
            "Settlement amount exceeds the outstanding claim",
          );
        }
        await this.assertActiveAdmin(tx, input.paidByUserId, "Payment user");
        const wallet = await tx.wallet.findFirst({
          where: {
            id: input.companyWalletId,
            isActive: true,
            type: { not: WalletType.USER },
            businessLegalEntities: {
              some: { legalEntityId: current.legalEntityId },
            },
          },
          select: { id: true, type: true },
        });
        if (!wallet) {
          throw new BadRequestException(
            "Settlement wallet is not an active wallet of the legal entity",
          );
        }

        const settlement = await tx.expenseReimbursementSettlement.create({
          data: {
            claimId,
            amount,
            companyWalletId: wallet.id,
            paidOn: date(input.paidOn),
            paidByUserId: input.paidByUserId,
            idempotencyKey: input.idempotencyKey,
            notes: input.notes ?? null,
          },
        });
        const transaction = await tx.moneyTransaction.create({
          data: {
            type: MoneyTransactionType.REIMBURSEMENT,
            status: MoneyTransactionStatus.POSTED,
            amount,
            currency: current.currency,
            financialScope: MoneyTransactionScope.COMPANY,
            paymentMethod:
              wallet.type === WalletType.COMPANY_CASH
                ? PaymentMethod.CASH
                : PaymentMethod.BANK_TRANSFER,
            billingStatus: BillingStatus.NOT_APPLICABLE,
            recipientUserId: current.claimantUserId,
            recordedByUserId: context.actorUserId,
            occurredAt: date(input.paidOn),
            description: input.notes ?? `Expense reimbursement ${claimId}`,
            idempotencyKey: input.idempotencyKey,
            balanceChanges: {
              create: {
                walletId: wallet.id,
                bucket: WalletBalanceBucket.BUSINESS_FUNDS,
                currency: current.currency,
                amountDelta: amount.negated(),
              },
            },
            references: {
              create: {
                referenceType: "EXPENSE_REIMBURSEMENT",
                referenceId: claimId,
                isPrimary: true,
              },
            },
          },
        });
        await this.applyWalletDelta(
          tx,
          wallet.id,
          current.currency,
          amount.negated(),
        );
        await tx.expensePosting.create({
          data: {
            expenseId: current.expenseId,
            reimbursementSettlementId: settlement.id,
            role: ExpensePostingRole.REIMBURSEMENT_SETTLEMENT,
            moneyTransactionId: transaction.id,
          },
        });

        const settledAmount = current.settledAmount.plus(amount);
        return tx.expenseReimbursementClaim.update({
          where: { id: claimId },
          data: {
            settledAmount,
            status: settledAmount.equals(current.originalAmount)
              ? ExpenseReimbursementStatus.SETTLED
              : ExpenseReimbursementStatus.PARTIALLY_SETTLED,
          },
        });
      });
      return toExpenseReimbursementClaim(claim);
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const existing =
          await this.prisma.expenseReimbursementSettlement.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
            include: { claim: true },
          });
        if (existing?.claimId === claimId) {
          return toExpenseReimbursementClaim(existing.claim);
        }
      }
      this.handleWriteError(error);
    }
  }

  private async postInTx(
    tx: Prisma.TransactionClient,
    current: ExpenseRecord,
    idempotencyKey: string,
    context: ExpenseContext,
  ): Promise<ExpenseRecord> {
    const payment = required(current.payment, "payment");
    const pool = required(current.costPool, "cost pool");
    const attribution = required(pool.attribution, "cost attribution");
    const taxSnapshot = required(current.taxSnapshot, "tax snapshot");
    const facts: ExpenseFacts = {
      legalEntityId: current.legalEntityId,
      occurredOn: current.occurredOn,
      taxPointOn: current.taxPointOn,
      grossAmount: current.grossAmount,
      currency: current.currency,
      payeeId: current.payeeId,
      categoryId: current.categoryId,
      scooterAllocations: (current.scooterAllocations ?? []).map(
        (allocation) => ({
          scooterId: allocation.scooterId,
          amount: allocation.allocatedGrossAmount,
        }),
      ),
      payment: {
        source: payment.source,
        companyWalletId: payment.companyWalletId,
        fundedByUserId: payment.fundedByUserId,
        paidByUserId: payment.paidByUserId,
        amount: payment.amount,
        paidOn: payment.paidOn,
      },
      attribution: {
        target: attribution.target,
        businessOwnerId: attribution.businessOwnerId,
      },
      taxLines: taxSnapshot.lines.map((line) => ({
        vatRate: line.vatRate.toFixed(4),
        netAmount: line.netAmount.toFixed(2),
        vatAmount: line.vatAmount.toFixed(2),
        grossAmount: line.grossAmount.toFixed(2),
        deductiblePercent: line.deductiblePercent.toFixed(4),
      })),
      documents: current.documents.map((document) => ({
        type: document.type,
        buyerCuiStatus: document.buyerCuiStatus,
        buyerTaxIdentifier: document.buyerTaxIdentifier,
        reviewStatus: document.reviewStatus,
      })),
    };
    const validated = await this.validateFacts(tx, facts);
    assertExpensePostingEvidence({
      paymentSource: facts.payment.source,
      expectedBuyerTaxIdentifier: validated.tax.legalEntityTaxIdentifier,
      documents: current.documents,
    });

    await tx.expenseTaxLine.deleteMany({
      where: { taxSnapshotId: taxSnapshot.id },
    });
    await tx.expenseTaxSnapshot.update({
      where: { id: taxSnapshot.id },
      data: this.taxSnapshotUpdateData(facts, validated.tax),
    });
    await tx.expenseCostPool.update({
      where: { expenseId: current.id },
      data: {
        recognizedCostAmount: validated.tax.recognizedCostAmount,
        attribution: {
          update: {
            allocatedRecognizedCostAmount: validated.tax.recognizedCostAmount,
          },
        },
      },
    });
    await tx.expensePayment.update({
      where: { expenseId: current.id },
      data: { fundingTreatment: validated.treatment },
    });

    if (payment.source !== ExpensePaymentSource.PERSONAL_FUNDS) {
      const companyWalletId = required(
        payment.companyWalletId,
        "company wallet",
      );
      const transaction = await tx.moneyTransaction.create({
        data: {
          type: MoneyTransactionType.EXPENSE,
          status: MoneyTransactionStatus.POSTED,
          amount: current.grossAmount,
          currency: current.currency,
          financialScope: MoneyTransactionScope.COMPANY,
          paymentMethod:
            payment.source === ExpensePaymentSource.COMPANY_CASH_DESK
              ? PaymentMethod.CASH
              : PaymentMethod.POS,
          billingStatus: BillingStatus.NOT_APPLICABLE,
          categoryId: current.categoryId,
          counterpartyId: current.payeeId,
          recordedByUserId: context.actorUserId,
          occurredAt: payment.paidOn,
          description: current.notes ?? `Expense ${current.id}`,
          idempotencyKey: `expense:${current.id}:payment`,
          balanceChanges: {
            create: {
              walletId: companyWalletId,
              bucket: WalletBalanceBucket.BUSINESS_FUNDS,
              currency: current.currency,
              amountDelta: current.grossAmount.negated(),
            },
          },
          references: {
            create: {
              referenceType: "EXPENSE",
              referenceId: current.id,
              isPrimary: true,
            },
          },
        },
      });
      await this.applyWalletDelta(
        tx,
        companyWalletId,
        current.currency,
        current.grossAmount.negated(),
      );
      await tx.expensePosting.create({
        data: {
          expenseId: current.id,
          paymentId: payment.id,
          role: ExpensePostingRole.EXPENSE_PAYMENT,
          moneyTransactionId: transaction.id,
        },
      });
    } else if (
      attribution.target === ExpenseAttributionTarget.BUSINESS &&
      validated.treatment === ExpenseFundingTreatment.REIMBURSABLE
    ) {
      await tx.expenseReimbursementClaim.create({
        data: {
          expenseId: current.id,
          expensePaymentId: payment.id,
          legalEntityId: current.legalEntityId,
          claimantUserId: required(payment.fundedByUserId, "funding user"),
          originalAmount: current.grossAmount,
          settledAmount: new Prisma.Decimal(0),
          currency: current.currency,
          status: ExpenseReimbursementStatus.OPEN,
        },
      });
    }

    await tx.expense.update({
      where: { id: current.id },
      data: {
        status: ExpenseStatus.POSTED,
        recognizedCostAmount: validated.tax.recognizedCostAmount,
        fiscalDeductibleAmount: validated.tax.fiscalDeductibleAmount,
        postIdempotencyKey: idempotencyKey,
        postedByUserId: context.actorUserId,
        postedAt: new Date(),
        updatedByUserId: context.actorUserId,
      },
    });

    if (current.categoryId === SCOOTER_PURCHASE_CATEGORY_ID) {
      for (const allocation of current.scooterAllocations) {
        await tx.scooter.update({
          where: { id: allocation.scooterId },
          data: { purchaseAllocationId: allocation.id },
        });
      }
    }

    return this.getRecord(tx, current.id);
  }

  private createFacts(input: v1.finance.CreateExpenseInput): ExpenseFacts {
    return {
      legalEntityId: input.legalEntityId,
      occurredOn: date(input.occurredOn),
      taxPointOn: date(input.taxPointOn ?? input.occurredOn),
      grossAmount: new Prisma.Decimal(input.grossAmount),
      currency: input.currency,
      payeeId: input.payeeId ?? null,
      categoryId: input.categoryId ?? null,
      scooterAllocations: input.scooterAllocations.map((allocation) => ({
        scooterId: allocation.scooterId,
        amount: new Prisma.Decimal(allocation.amount),
      })),
      payment: {
        source: input.payment.source,
        companyWalletId: input.payment.companyWalletId ?? null,
        fundedByUserId: input.payment.fundedByUserId ?? null,
        paidByUserId: input.payment.paidByUserId,
        amount: new Prisma.Decimal(input.payment.amount),
        paidOn: date(input.payment.paidOn),
      },
      attribution: {
        target: input.attribution.target,
        businessOwnerId: input.attribution.businessOwnerId ?? null,
      },
      taxLines: input.taxLines,
      documents: input.documents.map((document) => ({
        type: document.type,
        buyerCuiStatus: document.buyerCuiStatus,
        buyerTaxIdentifier: document.buyerTaxIdentifier,
        reviewStatus: document.reviewStatus,
      })),
      requestedFiscalDeductibleAmount: input.fiscalDeductibleAmount,
    };
  }

  private async validateFacts(
    tx: Prisma.TransactionClient,
    facts: ExpenseFacts,
  ): Promise<ValidatedFacts> {
    const entity = await tx.businessLegalEntity.findFirst({
      where: { id: facts.legalEntityId, isActive: true },
      select: {
        id: true,
        defaultCurrency: true,
        company: { select: { taxIdentifier: true } },
      },
    });
    if (!entity) {
      throw new BadRequestException("Business legal entity is not active");
    }
    if (entity.defaultCurrency !== facts.currency) {
      throw new BadRequestException(
        "Expense currency must match the legal entity currency",
      );
    }

    for (const document of facts.documents) {
      assertExpenseDocumentMetadataPolicy({
        ...document,
        expectedBuyerTaxIdentifier: entity.company.taxIdentifier,
      });
    }

    const [payee, category] = await Promise.all([
      facts.payeeId
        ? tx.counterparty.findFirst({
            where: {
              id: facts.payeeId,
              isActive: true,
              OR: [
                { person: { deletedAt: null } },
                { company: { deletedAt: null, isActive: true } },
              ],
            },
            select: { id: true },
          })
        : null,
      facts.categoryId
        ? tx.financialCategory.findFirst({
            where: {
              id: facts.categoryId,
              isActive: true,
              kind: FinancialCategoryKind.EXPENSE,
            },
            select: { id: true },
          })
        : null,
    ]);
    if (facts.payeeId && !payee) {
      throw new BadRequestException("Expense payee is not active");
    }
    if (facts.categoryId && !category) {
      throw new BadRequestException(
        "Expense category is not active or eligible",
      );
    }

    if (facts.scooterAllocations.length > 0) {
      const allocatedSum = facts.scooterAllocations.reduce(
        (total, allocation) => total.plus(allocation.amount),
        new Prisma.Decimal(0),
      );
      if (!allocatedSum.equals(facts.grossAmount)) {
        throw new BadRequestException(
          "Scooter allocation amounts must equal the expense gross amount",
        );
      }
      const scooterIds = facts.scooterAllocations.map(
        (allocation) => allocation.scooterId,
      );
      const activeScooters = await tx.scooter.findMany({
        where: { id: { in: scooterIds }, deletedAt: null },
        select: { id: true },
      });
      if (activeScooters.length !== new Set(scooterIds).size) {
        throw new BadRequestException(
          "One or more allocated scooters were not found",
        );
      }

      if (facts.categoryId === SCOOTER_PURCHASE_CATEGORY_ID) {
        const alreadyLinked = await tx.scooter.findFirst({
          where: {
            id: { in: scooterIds },
            purchaseAllocationId: { not: null },
          },
          select: { id: true },
        });
        if (alreadyLinked) {
          throw new BadRequestException(
            "One or more scooters already have a linked purchase expense",
          );
        }
      }
    }

    await this.assertActiveAdmin(
      tx,
      facts.payment.paidByUserId,
      "Payment user",
    );
    if (facts.payment.source === ExpensePaymentSource.PERSONAL_FUNDS) {
      if (!facts.payment.fundedByUserId || facts.payment.companyWalletId) {
        throw new BadRequestException(
          "Personal funds require a funding user and no company wallet",
        );
      }
      await this.assertActiveAdmin(
        tx,
        facts.payment.fundedByUserId,
        "Funding user",
      );
    } else {
      if (!facts.payment.companyWalletId || facts.payment.fundedByUserId) {
        throw new BadRequestException(
          "Company funding requires a company wallet and no personal funder",
        );
      }
      const wallet = await tx.wallet.findFirst({
        where: {
          id: facts.payment.companyWalletId,
          isActive: true,
          businessLegalEntities: {
            some: { legalEntityId: facts.legalEntityId },
          },
        },
        select: { type: true },
      });
      const validType =
        facts.payment.source === ExpensePaymentSource.COMPANY_CASH_DESK
          ? wallet?.type === WalletType.COMPANY_CASH
          : wallet?.type === WalletType.COMPANY_BANK ||
            wallet?.type === WalletType.PAYMENT_PROCESSOR;
      if (!wallet || !validType) {
        throw new BadRequestException(
          "Company wallet does not match the selected payment source",
        );
      }
    }

    if (facts.attribution.target === ExpenseAttributionTarget.OWNER) {
      if (!facts.attribution.businessOwnerId) {
        throw new BadRequestException(
          "Owner attribution requires a formal business owner",
        );
      }
      const owner = await tx.businessOwner.findFirst({
        where: {
          id: facts.attribution.businessOwnerId,
          legalEntityId: facts.legalEntityId,
          effectiveFrom: { lte: facts.occurredOn },
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gt: facts.occurredOn } },
          ],
          user: { deletedAt: null },
        },
        select: { id: true },
      });
      if (!owner) {
        throw new BadRequestException(
          "Business owner is not effective on the expense date",
        );
      }
    } else if (facts.attribution.businessOwnerId) {
      throw new BadRequestException(
        "Business attribution cannot identify a specific owner",
      );
    }

    if (!facts.payment.amount.equals(facts.grossAmount)) {
      throw new BadRequestException(
        "Expense payment must equal the gross amount",
      );
    }

    const treatment =
      facts.payment.source === ExpensePaymentSource.PERSONAL_FUNDS &&
      facts.attribution.target === ExpenseAttributionTarget.BUSINESS
        ? ExpenseFundingTreatment.REIMBURSABLE
        : ExpenseFundingTreatment.NON_REIMBURSABLE;
    const tax = await this.computeTax(tx, facts, entity.company.taxIdentifier);
    if (
      facts.requestedFiscalDeductibleAmount !== undefined &&
      !new Prisma.Decimal(facts.requestedFiscalDeductibleAmount).equals(
        tax.fiscalDeductibleAmount,
      )
    ) {
      throw new BadRequestException(
        "Fiscal deductible amount does not match the confirmed fiscal evidence",
      );
    }
    return { treatment, tax };
  }

  private async computeTax(
    tx: Prisma.TransactionClient,
    facts: ExpenseFacts,
    expectedBuyerTaxIdentifier: string | null,
  ): Promise<TaxComputation> {
    const expected = normalizeTaxIdentifier(expectedBuyerTaxIdentifier);
    if (!expected) {
      throw new BadRequestException(
        "Business legal entity requires a valid tax identifier",
      );
    }

    if (facts.categoryId === null) {
      // Quick-entry expenses have no category to carry a deductible-VAT rate,
      // so no VAT recovery is claimed: the full gross amount is recognized as
      // cost with zero fiscal deductibility until the expense is categorized
      // (e.g. later, by the planned auto-categorizer). This is a deliberate
      // accounting decision, not a placeholder.
      return {
        vatRegistrationPeriodId: null,
        vatRegistrationCountryCode: null,
        vatRegistrationNumber: null,
        legalEntityTaxIdentifier: expected,
        isVatRegistered: false,
        grossAmount: facts.grossAmount,
        netAmount: facts.grossAmount,
        vatAmount: new Prisma.Decimal(0),
        recoverableVatAmount: new Prisma.Decimal(0),
        nonRecoverableVatAmount: new Prisma.Decimal(0),
        recognizedCostAmount: facts.grossAmount,
        fiscalDeductibleAmount: new Prisma.Decimal(0),
        lines: [],
      };
    }

    const periods = await tx.vatRegistrationPeriod.findMany({
      where: {
        legalEntityId: facts.legalEntityId,
        effectiveFrom: { lte: facts.taxPointOn },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: facts.taxPointOn } }],
      },
      select: { id: true, countryCode: true, vatNumber: true },
      take: 2,
    });
    if (periods.length > 1) {
      throw new ConflictException("VAT registration periods overlap");
    }
    const vatPeriod = periods[0] ?? null;
    const hasQualifyingEvidence = facts.documents.some(
      (document) =>
        FISCAL_EVIDENCE_TYPES.has(document.type) &&
        document.reviewStatus === "CONFIRMED" &&
        document.buyerCuiStatus === "MATCHED" &&
        normalizeTaxIdentifier(document.buyerTaxIdentifier) === expected,
    );
    const canRecoverVat = Boolean(vatPeriod) && hasQualifyingEvidence;

    const lines = facts.taxLines.map((line) => {
      const netAmount = new Prisma.Decimal(line.netAmount);
      const vatAmount = new Prisma.Decimal(line.vatAmount);
      if (
        !netAmount
          .times(new Prisma.Decimal(line.vatRate))
          .dividedBy(100)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
          .equals(vatAmount)
      ) {
        throw new BadRequestException(
          "VAT amount must equal net amount times VAT rate, rounded half-up to cents",
        );
      }
      const recoverableVatAmount = canRecoverVat
        ? vatAmount
            .times(new Prisma.Decimal(line.deductiblePercent))
            .dividedBy(100)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
        : new Prisma.Decimal(0);
      return {
        vatRate: new Prisma.Decimal(line.vatRate),
        netAmount,
        vatAmount,
        grossAmount: new Prisma.Decimal(line.grossAmount),
        deductiblePercent: new Prisma.Decimal(line.deductiblePercent),
        recoverableVatAmount,
        nonRecoverableVatAmount: vatAmount.minus(recoverableVatAmount),
      };
    });
    const sum = (
      selector: (line: TaxComputation["lines"][number]) => Prisma.Decimal,
    ) =>
      lines.reduce(
        (total, line) => total.plus(selector(line)),
        new Prisma.Decimal(0),
      );
    const netAmount =
      lines.length === 0 ? facts.grossAmount : sum((line) => line.netAmount);
    const vatAmount = sum((line) => line.vatAmount);
    const linesGross = sum((line) => line.grossAmount);
    if (lines.length > 0 && !linesGross.equals(facts.grossAmount)) {
      throw new BadRequestException(
        "Tax line gross amounts must equal the expense gross amount",
      );
    }
    const recoverableVatAmount = sum((line) => line.recoverableVatAmount);
    const nonRecoverableVatAmount = sum((line) => line.nonRecoverableVatAmount);
    const recognizedCostAmount = facts.grossAmount.minus(recoverableVatAmount);
    return {
      vatRegistrationPeriodId: vatPeriod?.id ?? null,
      vatRegistrationCountryCode: vatPeriod?.countryCode ?? null,
      vatRegistrationNumber: vatPeriod?.vatNumber ?? null,
      legalEntityTaxIdentifier: expected,
      isVatRegistered: Boolean(vatPeriod),
      grossAmount: facts.grossAmount,
      netAmount,
      vatAmount,
      recoverableVatAmount,
      nonRecoverableVatAmount,
      recognizedCostAmount,
      fiscalDeductibleAmount: hasQualifyingEvidence
        ? recognizedCostAmount
        : new Prisma.Decimal(0),
      lines,
    };
  }

  private taxSnapshotCreateData(
    facts: ExpenseFacts,
    tax: TaxComputation,
  ): Prisma.ExpenseTaxSnapshotCreateWithoutExpenseInput {
    return {
      vatRegistrationPeriod: tax.vatRegistrationPeriodId
        ? { connect: { id: tax.vatRegistrationPeriodId } }
        : undefined,
      vatRegistrationCountryCode: tax.vatRegistrationCountryCode,
      vatRegistrationNumber: tax.vatRegistrationNumber,
      legalEntityTaxIdentifier: tax.legalEntityTaxIdentifier,
      isVatRegistered: tax.isVatRegistered,
      taxPointOn: facts.taxPointOn,
      grossAmount: tax.grossAmount,
      netAmount: tax.netAmount,
      vatAmount: tax.vatAmount,
      recoverableVatAmount: tax.recoverableVatAmount,
      nonRecoverableVatAmount: tax.nonRecoverableVatAmount,
      recognizedCostAmount: tax.recognizedCostAmount,
      lines: { create: tax.lines },
    };
  }

  private taxSnapshotUpdateData(
    facts: ExpenseFacts,
    tax: TaxComputation,
  ): Prisma.ExpenseTaxSnapshotUpdateInput {
    return {
      vatRegistrationPeriod: tax.vatRegistrationPeriodId
        ? { connect: { id: tax.vatRegistrationPeriodId } }
        : { disconnect: true },
      vatRegistrationCountryCode: tax.vatRegistrationCountryCode,
      vatRegistrationNumber: tax.vatRegistrationNumber,
      legalEntityTaxIdentifier: tax.legalEntityTaxIdentifier,
      isVatRegistered: tax.isVatRegistered,
      taxPointOn: facts.taxPointOn,
      grossAmount: tax.grossAmount,
      netAmount: tax.netAmount,
      vatAmount: tax.vatAmount,
      recoverableVatAmount: tax.recoverableVatAmount,
      nonRecoverableVatAmount: tax.nonRecoverableVatAmount,
      recognizedCostAmount: tax.recognizedCostAmount,
      lines: { create: tax.lines },
    };
  }

  private async applyWalletDelta(
    tx: Prisma.TransactionClient,
    walletId: string,
    currency: string,
    amountDelta: Prisma.Decimal,
  ): Promise<void> {
    await tx.walletBalance.upsert({
      where: {
        walletId_bucket_currency: {
          walletId,
          bucket: WalletBalanceBucket.BUSINESS_FUNDS,
          currency,
        },
      },
      create: {
        walletId,
        bucket: WalletBalanceBucket.BUSINESS_FUNDS,
        currency,
        balance: amountDelta,
      },
      update: { balance: { increment: amountDelta } },
    });
  }

  private async assertActiveAdmin(
    tx: Prisma.TransactionClient,
    userId: string,
    label: string,
  ): Promise<void> {
    const user = await tx.user.findFirst({
      where: { id: userId, deletedAt: null, roles: { has: "ADMIN" } },
      select: { id: true },
    });
    if (!user) throw new BadRequestException(`${label} is not an active admin`);
  }

  private async getRecord(
    tx: Prisma.TransactionClient | PrismaService,
    id: string,
  ): Promise<ExpenseRecord> {
    const expense = await tx.expense.findUnique({
      where: { id },
      include: expenseInclude,
    });
    if (!expense) throw new NotFoundException("Expense not found");
    return expense;
  }

  private findByCreateIdempotencyKey(
    idempotencyKey: string,
  ): Promise<ExpenseRecord | null> {
    return this.prisma.expense.findUnique({
      where: { idempotencyKey },
      include: expenseInclude,
    });
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
    throw new ConflictException("Could not serialize expense operation");
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
        "Expense operation conflicts with existing data",
      );
    }
    throw error;
  }
}

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function required<T>(value: T | null, label: string): T {
  if (value === null)
    throw new ConflictException(`Expense is missing ${label}`);
  return value;
}

export const expenseServiceTesting = {
  FISCAL_EVIDENCE_TYPES,
  dateOnly,
};
