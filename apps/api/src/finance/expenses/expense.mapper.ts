import { v1 } from "@repo/api-shared";

import type { Prisma } from "../../generated/prisma/client";

export const businessLegalEntityInclude = {
  company: {
    select: {
      id: true,
      legalName: true,
      tradingName: true,
      taxIdentifier: true,
    },
  },
  wallets: {
    include: {
      wallet: {
        include: {
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
        },
      },
    },
    orderBy: { wallet: { name: "asc" } },
  },
} satisfies Prisma.BusinessLegalEntityInclude;

export type BusinessLegalEntityRecord = Prisma.BusinessLegalEntityGetPayload<{
  include: typeof businessLegalEntityInclude;
}>;

export const businessOwnerInclude = {
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
} satisfies Prisma.BusinessOwnerInclude;

export type BusinessOwnerRecord = Prisma.BusinessOwnerGetPayload<{
  include: typeof businessOwnerInclude;
}>;

export const expenseInclude = {
  category: {
    select: { id: true, code: true, name: true, kind: true },
  },
  payee: {
    include: {
      person: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
      company: {
        select: {
          id: true,
          legalName: true,
          tradingName: true,
          email: true,
          phone: true,
          taxIdentifier: true,
        },
      },
    },
  },
  payment: true,
  costPool: { include: { attribution: true } },
  taxSnapshot: { include: { lines: { orderBy: { id: "asc" } } } },
  references: { orderBy: [{ isPrimary: "desc" }, { id: "asc" }] },
  documents: {
    include: { assets: { include: { asset: true }, orderBy: { role: "asc" } } },
    orderBy: { createdAt: "asc" },
  },
  postings: { orderBy: { createdAt: "asc" } },
  reimbursementClaim: true,
} satisfies Prisma.ExpenseInclude;

export type ExpenseRecord = Prisma.ExpenseGetPayload<{
  include: typeof expenseInclude;
}>;

export function toBusinessLegalEntity(
  entity: BusinessLegalEntityRecord,
): v1.finance.BusinessLegalEntity {
  return {
    id: entity.id,
    companyId: entity.companyId,
    company: entity.company,
    defaultCurrency: entity.defaultCurrency,
    isActive: entity.isActive,
    wallets: entity.wallets.map(({ wallet }) => ({
      id: wallet.id,
      type: wallet.type,
      name: wallet.name,
      isActive: wallet.isActive,
      owner: wallet.owner,
      cardHolderUserId: wallet.cardHolderUserId,
      cardHolder: wallet.cardHolder,
    })),
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export function toBusinessOwner(
  owner: BusinessOwnerRecord,
): v1.finance.BusinessOwner {
  return {
    id: owner.id,
    legalEntityId: owner.legalEntityId,
    userId: owner.userId,
    user: owner.user,
    effectiveFrom: dateOnly(owner.effectiveFrom),
    effectiveTo: owner.effectiveTo ? dateOnly(owner.effectiveTo) : null,
    createdAt: owner.createdAt.toISOString(),
    updatedAt: owner.updatedAt.toISOString(),
  };
}

export function toVatRegistrationPeriod(
  period: Prisma.VatRegistrationPeriodGetPayload<object>,
): v1.finance.VatRegistrationPeriod {
  return {
    id: period.id,
    legalEntityId: period.legalEntityId,
    countryCode: period.countryCode,
    vatNumber: period.vatNumber,
    effectiveFrom: dateOnly(period.effectiveFrom),
    effectiveTo: period.effectiveTo ? dateOnly(period.effectiveTo) : null,
    createdAt: period.createdAt.toISOString(),
    updatedAt: period.updatedAt.toISOString(),
  };
}

export function toExpense(record: ExpenseRecord): v1.finance.Expense {
  const payment = required(record.payment, "payment", record.id);
  const costPool = required(record.costPool, "cost pool", record.id);
  const attribution = required(
    costPool.attribution,
    "cost attribution",
    record.id,
  );
  const taxSnapshot = required(record.taxSnapshot, "tax snapshot", record.id);

  return {
    id: record.id,
    legalEntityId: record.legalEntityId,
    payeeId: record.payeeId,
    payee: toPayee(record.payee),
    categoryId: record.categoryId,
    category: record.category,
    status: record.status,
    occurredOn: dateOnly(record.occurredOn),
    taxPointOn: dateOnly(record.taxPointOn),
    currency: record.currency,
    grossAmount: money(record.grossAmount),
    recognizedCostAmount: money(record.recognizedCostAmount),
    fiscalDeductibleAmount: money(record.fiscalDeductibleAmount),
    notes: record.notes,
    idempotencyKey: record.idempotencyKey,
    createdByUserId: record.createdByUserId,
    updatedByUserId: record.updatedByUserId,
    postedByUserId: record.postedByUserId,
    postedAt: record.postedAt?.toISOString() ?? null,
    reversedByUserId: record.reversedByUserId,
    reversedAt: record.reversedAt?.toISOString() ?? null,
    reversalReason: record.reversalReason,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    payment: {
      id: payment.id,
      source: payment.source,
      companyWalletId: payment.companyWalletId,
      fundedByUserId: payment.fundedByUserId,
      paidByUserId: payment.paidByUserId,
      amount: money(payment.amount),
      paidOn: dateOnly(payment.paidOn),
      fundingTreatment: payment.fundingTreatment,
    },
    costPool: {
      id: costPool.id,
      grossAmount: money(costPool.grossAmount),
      recognizedCostAmount: money(costPool.recognizedCostAmount),
      attribution: {
        id: attribution.id,
        target: attribution.target,
        businessOwnerId: attribution.businessOwnerId,
        percentage: attribution.percentage.toFixed(4),
        allocatedGrossAmount: money(attribution.allocatedGrossAmount),
        allocatedRecognizedCostAmount: money(
          attribution.allocatedRecognizedCostAmount,
        ),
      },
    },
    taxSnapshot: {
      id: taxSnapshot.id,
      vatRegistrationPeriodId: taxSnapshot.vatRegistrationPeriodId,
      vatRegistrationCountryCode: taxSnapshot.vatRegistrationCountryCode,
      vatRegistrationNumber: taxSnapshot.vatRegistrationNumber,
      legalEntityTaxIdentifier: taxSnapshot.legalEntityTaxIdentifier,
      isVatRegistered: taxSnapshot.isVatRegistered,
      taxPointOn: dateOnly(taxSnapshot.taxPointOn),
      grossAmount: money(taxSnapshot.grossAmount),
      netAmount: money(taxSnapshot.netAmount),
      vatAmount: money(taxSnapshot.vatAmount),
      recoverableVatAmount: money(taxSnapshot.recoverableVatAmount),
      nonRecoverableVatAmount: money(taxSnapshot.nonRecoverableVatAmount),
      recognizedCostAmount: money(taxSnapshot.recognizedCostAmount),
      lines: taxSnapshot.lines.map((line) => ({
        id: line.id,
        vatRate: line.vatRate.toFixed(4),
        netAmount: money(line.netAmount),
        vatAmount: money(line.vatAmount),
        grossAmount: money(line.grossAmount),
        deductiblePercent: line.deductiblePercent.toFixed(4),
        recoverableVatAmount: money(line.recoverableVatAmount),
        nonRecoverableVatAmount: money(line.nonRecoverableVatAmount),
      })),
    },
    references: record.references.map((reference) => ({
      id: reference.id,
      referenceType: reference.referenceType,
      referenceId: reference.referenceId,
      isPrimary: reference.isPrimary,
    })),
    documents: record.documents.map((document) => ({
      id: document.id,
      type: document.type,
      documentSeries: document.documentSeries,
      documentNumber: document.documentNumber,
      supplierName: document.supplierName,
      supplierTaxIdentifier: document.supplierTaxIdentifier,
      buyerTaxIdentifier: document.buyerTaxIdentifier,
      issuedOn: document.issuedOn ? dateOnly(document.issuedOn) : null,
      buyerCuiStatus: document.buyerCuiStatus,
      reviewStatus: document.reviewStatus,
      notes: document.notes,
      assets: document.assets.map((link) => ({
        id: link.id,
        assetId: link.assetId,
        role: link.role,
        contentType: link.asset
          .contentType as v1.finance.ExpenseDocumentContentType,
        byteSize: link.asset.byteSize,
        checksumSha256: link.asset.checksumSha256,
        imageWidth: link.imageWidth,
        imageHeight: link.imageHeight,
        pageCount: link.pageCount,
        contentUrl: v1.finance.EXPENSE_ROUTES.documents.content(
          record.id,
          document.id,
          link.role,
        ),
        createdAt: link.createdAt.toISOString(),
      })),
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    })),
    postings: record.postings.map((posting) => ({
      id: posting.id,
      role: posting.role,
      moneyTransactionId: posting.moneyTransactionId,
      createdAt: posting.createdAt.toISOString(),
    })),
    reimbursementClaim: record.reimbursementClaim
      ? toExpenseReimbursementClaim(record.reimbursementClaim)
      : null,
  };
}

export function toExpenseReimbursementClaim(
  claim: Prisma.ExpenseReimbursementClaimGetPayload<object>,
): v1.finance.ExpenseReimbursementClaim {
  return {
    id: claim.id,
    expenseId: claim.expenseId,
    expensePaymentId: claim.expensePaymentId,
    claimantUserId: claim.claimantUserId,
    status: claim.status,
    originalAmount: money(claim.originalAmount),
    settledAmount: money(claim.settledAmount),
    outstandingAmount:
      claim.status === "CANCELLED"
        ? "0.00"
        : money(claim.originalAmount.minus(claim.settledAmount)),
    currency: claim.currency,
    createdAt: claim.createdAt.toISOString(),
    updatedAt: claim.updatedAt.toISOString(),
  };
}

export function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function required<T>(value: T | null, label: string, expenseId: string): T {
  if (value === null) {
    throw new Error(`Expense ${expenseId} is missing its ${label}`);
  }
  return value;
}

function toPayee(
  payee: ExpenseRecord["payee"],
): v1.finance.FinancialCounterpartySearchItem | null {
  if (payee.person) {
    const phoneMasked = maskSuffix(payee.person.phone);
    return {
      id: payee.id,
      kind: "PERSON",
      label: `${payee.person.firstName} ${payee.person.lastName}`.trim(),
      description: [payee.person.email, phoneMasked]
        .filter(Boolean)
        .join(" · "),
      email: payee.person.email,
      phoneMasked,
      identifierMasked: null,
    };
  }
  if (payee.company) {
    const phoneMasked = maskSuffix(payee.company.phone);
    const identifierMasked = maskSuffix(payee.company.taxIdentifier);
    return {
      id: payee.id,
      kind: "COMPANY",
      label: payee.company.tradingName ?? payee.company.legalName,
      description: [payee.company.email, phoneMasked, identifierMasked]
        .filter(Boolean)
        .join(" · "),
      email: payee.company.email,
      phoneMasked,
      identifierMasked,
    };
  }
  return null;
}

function maskSuffix(value: string | null): string | null {
  if (!value) return null;
  return `…${value.replace(/\s+/gu, "").slice(-4)}`;
}
