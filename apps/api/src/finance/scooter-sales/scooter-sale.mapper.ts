import { v1 } from "@repo/api-shared";

import type { Prisma } from "../../generated/prisma/client";

export const scooterSaleInclude = {
  buyerCounterparty: {
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
} satisfies Prisma.ScooterSaleInclude;

export type ScooterSaleRecord = Prisma.ScooterSaleGetPayload<{
  include: typeof scooterSaleInclude;
}>;

export function toScooterSale(
  record: ScooterSaleRecord,
): v1.finance.ScooterSale {
  return {
    id: record.id,
    scooterId: record.scooterId,
    buyerCounterpartyId: record.buyerCounterpartyId,
    buyer: toBuyer(record.buyerCounterparty),
    saleAmount: money(record.saleAmount),
    paidAmount: money(record.paidAmount),
    paidBusinessAmount: money(record.paidBusinessAmount),
    paidPersonalAmount: money(record.paidPersonalAmount),
    outstandingAmount: money(record.saleAmount.minus(record.paidAmount)),
    currency: record.currency,
    status: record.status,
    soldOn: dateOnly(record.soldOn),
    notes: record.notes,
    createdByUserId: record.createdByUserId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function toBuyer(
  buyerCounterparty: ScooterSaleRecord["buyerCounterparty"],
): v1.finance.FinancialCounterpartySearchItem | null {
  if (buyerCounterparty.person) {
    const { person } = buyerCounterparty;
    const phoneMasked = maskSuffix(person.phone);
    return {
      id: buyerCounterparty.id,
      kind: "PERSON",
      label: `${person.firstName} ${person.lastName}`.trim(),
      description: [person.email, phoneMasked].filter(Boolean).join(" · "),
      email: person.email,
      phoneMasked,
      identifierMasked: null,
    };
  }
  if (buyerCounterparty.company) {
    const { company } = buyerCounterparty;
    const phoneMasked = maskSuffix(company.phone);
    const identifierMasked = maskSuffix(company.taxIdentifier);
    return {
      id: buyerCounterparty.id,
      kind: "COMPANY",
      label: company.tradingName ?? company.legalName,
      description: [company.email, phoneMasked, identifierMasked]
        .filter(Boolean)
        .join(" · "),
      email: company.email,
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
