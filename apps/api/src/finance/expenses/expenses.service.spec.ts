import { BadRequestException } from "@nestjs/common";

import {
  ExpenseAttributionTarget,
  ExpenseFundingTreatment,
  ExpensePaymentSource,
  Prisma,
} from "../../generated/prisma/client";
import {
  assertExpensePostingEvidence,
  ExpensesService,
} from "./expenses.service";

type PostingDocument = Parameters<
  typeof assertExpensePostingEvidence
>[0]["documents"][number];

const activeOriginal = {
  role: "ORIGINAL" as const,
  asset: { deletedAt: null },
};

function fiscalDocument(
  overrides: Partial<PostingDocument> = {},
): PostingDocument {
  return {
    type: "FISCAL_RECEIPT",
    buyerCuiStatus: "MATCHED",
    buyerTaxIdentifier: "RO12345678",
    reviewStatus: "CONFIRMED",
    assets: [activeOriginal],
    ...overrides,
  };
}

function posDocument(
  overrides: Partial<PostingDocument> = {},
): PostingDocument {
  return {
    type: "POS_RECEIPT",
    buyerCuiStatus: "NOT_APPLICABLE",
    buyerTaxIdentifier: null,
    reviewStatus: "CONFIRMED",
    assets: [activeOriginal],
    ...overrides,
  };
}

function assertPosting(input: {
  paymentSource: "COMPANY_CARD" | "COMPANY_CASH_DESK" | "PERSONAL_FUNDS";
  documents: PostingDocument[];
}): void {
  assertExpensePostingEvidence({
    ...input,
    expectedBuyerTaxIdentifier: "12345678",
  });
}

describe("expense posting evidence", () => {
  it("allows personal funds without a fiscal file", () => {
    expect(() =>
      assertPosting({ paymentSource: "PERSONAL_FUNDS", documents: [] }),
    ).not.toThrow();
  });

  it("rejects matched company-buyer evidence for personal funds", () => {
    expect(() =>
      assertPosting({
        paymentSource: "PERSONAL_FUNDS",
        documents: [fiscalDocument()],
      }),
    ).toThrow(
      new BadRequestException(
        "Personal-funds expenses cannot claim matched company-buyer evidence",
      ),
    );
  });

  it("requires a confirmed matched fiscal original for company cash", () => {
    for (const documents of [
      [],
      [fiscalDocument({ reviewStatus: "PENDING" })],
      [fiscalDocument({ buyerTaxIdentifier: "RO87654321" })],
      [fiscalDocument({ assets: [] })],
      [
        fiscalDocument({
          assets: [{ role: "ORIGINAL", asset: { deletedAt: new Date() } }],
        }),
      ],
    ]) {
      expect(() =>
        assertPosting({ paymentSource: "COMPANY_CASH_DESK", documents }),
      ).toThrow(
        "Company-funded expenses require a confirmed invoice or fiscal receipt",
      );
    }

    expect(() =>
      assertPosting({
        paymentSource: "COMPANY_CASH_DESK",
        documents: [fiscalDocument()],
      }),
    ).not.toThrow();
  });

  it("requires a second confirmed original POS receipt for a company card", () => {
    expect(() =>
      assertPosting({
        paymentSource: "COMPANY_CARD",
        documents: [fiscalDocument()],
      }),
    ).toThrow(
      "Company-card expenses additionally require a confirmed POS receipt",
    );

    expect(() =>
      assertPosting({
        paymentSource: "COMPANY_CARD",
        documents: [fiscalDocument(), posDocument({ reviewStatus: "PENDING" })],
      }),
    ).toThrow(
      "Company-card expenses additionally require a confirmed POS receipt",
    );

    expect(() =>
      assertPosting({
        paymentSource: "COMPANY_CARD",
        documents: [fiscalDocument(), posDocument()],
      }),
    ).not.toThrow();
  });

  it("applies the same posting gate to create with postImmediately", async () => {
    const amount = new Prisma.Decimal(100);
    const occurredOn = new Date("2026-08-03T00:00:00.000Z");
    const current = {
      id: "expense-1",
      legalEntityId: "entity-1",
      payeeId: "payee-1",
      categoryId: "category-1",
      occurredOn,
      taxPointOn: occurredOn,
      grossAmount: amount,
      currency: "RON",
      payment: {
        id: "payment-1",
        source: ExpensePaymentSource.COMPANY_CASH_DESK,
        companyWalletId: "wallet-1",
        fundedByUserId: null,
        paidByUserId: "user-1",
        amount,
        paidOn: occurredOn,
      },
      costPool: {
        attribution: {
          target: ExpenseAttributionTarget.BUSINESS,
          businessOwnerId: null,
        },
      },
      taxSnapshot: { lines: [] },
      documents: [],
    };
    const tx = {
      expense: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(current),
      },
    };
    const prisma = {
      expense: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest
        .fn()
        .mockImplementation((operation: (client: typeof tx) => unknown) =>
          operation(tx),
        ),
    };
    const service = new ExpensesService(prisma as never);
    const validatedTax = {
      vatRegistrationPeriodId: null,
      vatRegistrationCountryCode: null,
      vatRegistrationNumber: null,
      legalEntityTaxIdentifier: "RO12345678",
      isVatRegistered: false,
      grossAmount: amount,
      netAmount: amount,
      vatAmount: new Prisma.Decimal(0),
      recoverableVatAmount: new Prisma.Decimal(0),
      nonRecoverableVatAmount: new Prisma.Decimal(0),
      recognizedCostAmount: amount,
      fiscalDeductibleAmount: new Prisma.Decimal(0),
      lines: [],
    };
    (
      service as unknown as {
        validateFacts: jest.Mock;
      }
    ).validateFacts = jest.fn().mockResolvedValue({
      treatment: ExpenseFundingTreatment.NON_REIMBURSABLE,
      tax: validatedTax,
    });

    await expect(
      service.create(
        {
          legalEntityId: "entity-1",
          payeeId: "payee-1",
          categoryId: "category-1",
          occurredOn: "2026-08-03",
          currency: "RON",
          grossAmount: "100.00",
          idempotencyKey: "expense:create:1",
          postImmediately: true,
          payment: {
            source: "COMPANY_CASH_DESK",
            companyWalletId: "wallet-1",
            paidByUserId: "user-1",
            amount: "100.00",
            paidOn: "2026-08-03",
          },
          attribution: { target: "BUSINESS" },
          taxLines: [],
          references: [],
          documents: [],
          scooterAllocations: [],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toThrow(
      "Company-funded expenses require a confirmed invoice or fiscal receipt",
    );
  });
});

describe("expense fact validation", () => {
  function buildValidateFactsTx() {
    return {
      businessLegalEntity: {
        findFirst: jest.fn().mockResolvedValue({
          id: "entity-1",
          defaultCurrency: "RON",
          company: { taxIdentifier: "RO12345678" },
        }),
      },
      counterparty: { findFirst: jest.fn().mockResolvedValue(null) },
      financialCategory: { findFirst: jest.fn().mockResolvedValue(null) },
      scooter: {
        findMany: jest
          .fn()
          .mockImplementation(
            ({ where }: { where: { id: { in: string[] } } }) =>
              Promise.resolve(where.id.in.map((id) => ({ id }))),
          ),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: "user-1" }) },
      wallet: {
        findFirst: jest.fn().mockResolvedValue({ type: "COMPANY_CASH" }),
      },
      businessOwner: { findFirst: jest.fn().mockResolvedValue(null) },
      vatRegistrationPeriod: { findMany: jest.fn().mockResolvedValue([]) },
    };
  }

  function baseFacts() {
    const occurredOn = new Date("2026-08-03T00:00:00.000Z");
    return {
      legalEntityId: "entity-1",
      occurredOn,
      taxPointOn: occurredOn,
      grossAmount: new Prisma.Decimal("100.00"),
      currency: "RON",
      payeeId: null,
      categoryId: null,
      scooterAllocations: [] as Array<{
        scooterId: string;
        amount: Prisma.Decimal;
      }>,
      payment: {
        source: ExpensePaymentSource.COMPANY_CASH_DESK,
        companyWalletId: "wallet-1",
        fundedByUserId: null,
        paidByUserId: "user-1",
        amount: new Prisma.Decimal("100.00"),
        paidOn: occurredOn,
      },
      attribution: {
        target: ExpenseAttributionTarget.BUSINESS,
        businessOwnerId: null,
      },
      taxLines: [] as unknown[],
      documents: [] as unknown[],
    };
  }

  function callValidateFacts(tx: unknown, facts: unknown) {
    const service = new ExpensesService({} as never);
    return (
      service as unknown as {
        validateFacts: (
          tx: unknown,
          facts: unknown,
        ) => Promise<{
          treatment: ExpenseFundingTreatment;
          tax: {
            recognizedCostAmount: Prisma.Decimal;
            fiscalDeductibleAmount: Prisma.Decimal;
          };
        }>;
      }
    ).validateFacts(tx, facts);
  }

  it("rejects scooter allocations whose sum does not equal the gross amount", async () => {
    const tx = buildValidateFactsTx();
    const facts = {
      ...baseFacts(),
      scooterAllocations: [
        { scooterId: "scooter-1", amount: new Prisma.Decimal("40.00") },
        { scooterId: "scooter-2", amount: new Prisma.Decimal("40.00") },
      ],
    };

    await expect(callValidateFacts(tx, facts)).rejects.toThrow(
      "Scooter allocation amounts must equal the expense gross amount",
    );
  });

  it("accepts scooter allocations that sum to the gross amount", async () => {
    const tx = buildValidateFactsTx();
    const facts = {
      ...baseFacts(),
      scooterAllocations: [
        { scooterId: "scooter-1", amount: new Prisma.Decimal("50.00") },
        { scooterId: "scooter-2", amount: new Prisma.Decimal("50.00") },
      ],
    };

    await expect(callValidateFacts(tx, facts)).resolves.toBeDefined();
    expect(tx.scooter.findMany).toHaveBeenCalledTimes(1);
  });

  it("skips payee and category lookups for a quick-entry expense", async () => {
    const tx = buildValidateFactsTx();

    const result = await callValidateFacts(tx, baseFacts());

    expect(tx.counterparty.findFirst).not.toHaveBeenCalled();
    expect(tx.financialCategory.findFirst).not.toHaveBeenCalled();
    expect(result.tax.recognizedCostAmount.toFixed(2)).toBe("100.00");
    expect(result.tax.fiscalDeductibleAmount.toFixed(2)).toBe("0.00");
  });

  const SCOOTER_PURCHASE_CATEGORY_ID = "seed-finance-category-scooter-purchase";

  it("rejects a purchase-category expense allocated to an already-linked scooter", async () => {
    const tx = buildValidateFactsTx();
    tx.financialCategory.findFirst.mockResolvedValue({
      id: SCOOTER_PURCHASE_CATEGORY_ID,
    });
    tx.scooter.findFirst.mockResolvedValue({ id: "scooter-1" });
    const facts = {
      ...baseFacts(),
      categoryId: SCOOTER_PURCHASE_CATEGORY_ID,
      scooterAllocations: [
        { scooterId: "scooter-1", amount: new Prisma.Decimal("100.00") },
      ],
    };

    await expect(callValidateFacts(tx, facts)).rejects.toThrow(
      "One or more scooters already have a linked purchase expense",
    );
  });

  it("allows a purchase-category expense when no target scooter is already linked", async () => {
    const tx = buildValidateFactsTx();
    tx.financialCategory.findFirst.mockResolvedValue({
      id: SCOOTER_PURCHASE_CATEGORY_ID,
    });
    const facts = {
      ...baseFacts(),
      categoryId: SCOOTER_PURCHASE_CATEGORY_ID,
      scooterAllocations: [
        { scooterId: "scooter-1", amount: new Prisma.Decimal("100.00") },
      ],
    };

    await expect(callValidateFacts(tx, facts)).resolves.toBeDefined();
    expect(tx.scooter.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          purchaseAllocationId: { not: null },
        }),
      }),
    );
  });
});
