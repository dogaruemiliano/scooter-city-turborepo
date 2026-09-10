import type { v1 } from "@repo/api-shared";

import { FinanceStateError } from "../domain/finance.errors";
import {
  type CreatePostedAssociateFundingInput,
  type CreatePostedExpenseInput,
  PrismaFinanceRepository,
} from "./prisma-finance.repository";

interface DraftUploadClaimInput {
  where: {
    id: string;
    userId: string;
    purpose: string;
    storageKey: string;
    claimedAt: null;
    cleanupStartedAt: null;
    expiresAt: { gt: Date };
  };
  data: { claimedAt: Date };
}

describe("PrismaFinanceRepository expense receipt claims", () => {
  it("attaches a direct upload to the first invoice and claims it atomically", async () => {
    const { repository, tx } = setupRepository(1);

    await expect(repository.createPostedExpense(directExpense())).resolves.toBe(
      "operation-1",
    );

    expect(tx.financialDocument.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          operationId: "operation-1",
          type: "INVOICE",
          documentSeries: "VL",
          documentNumber: "639013079",
          supplierName: "Rotakt SRL",
          storageKey: "receipts/manual.jpg",
        }),
      ],
    });
    expect(tx.expenseExtractionDraft.updateMany).not.toHaveBeenCalled();
    expect(tx.draftUpload.updateMany).toHaveBeenCalledTimes(1);
    const claim = tx.draftUpload.updateMany.mock.calls[0]?.[0];
    expect(claim).toBeDefined();
    if (!claim) throw new Error("Expected a draft upload claim");
    expect(claim.where).toMatchObject({
      id: "upload-manual-1",
      userId: "user-1",
      purpose: "finance-expense-document",
      storageKey: "receipts/manual.jpg",
      claimedAt: null,
      cleanupStartedAt: null,
    });
    expect(claim.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(claim.data.claimedAt).toBeInstanceOf(Date);
  });

  it("raises a finance state error before posting when the upload claim loses", async () => {
    const { repository, tx } = setupRepository(0);

    await expect(
      repository.createPostedExpense(directExpense()),
    ).rejects.toBeInstanceOf(FinanceStateError);

    expect(tx.journalEntry.create).not.toHaveBeenCalled();
    expect(tx.financialOperation.update).not.toHaveBeenCalled();
  });

  it("does not claim a funding proof already owned by cleanup", async () => {
    const { repository, tx } = setupRepository(1);

    await expect(
      repository.createPostedAssociateFunding(fundingWithProof()),
    ).resolves.toBe("operation-1");

    const claim = tx.draftUpload.updateMany.mock.calls[0]?.[0];
    expect(claim).toBeDefined();
    if (!claim) throw new Error("Expected a funding proof upload claim");
    expect(claim.where).toEqual({
      id: "funding-proof-1",
      claimedAt: null,
      cleanupStartedAt: null,
    });
    expect(claim.data.claimedAt).toBeInstanceOf(Date);
  });
});

function directExpense(): CreatePostedExpenseInput {
  const documents: v1.finance.FinancialDocumentInput[] = [
    {
      type: "INVOICE",
      documentSeries: "VL",
      documentNumber: "639013079",
      supplierName: "Rotakt SRL",
    },
  ];

  return {
    bookId: "associate-pool-book",
    occurredAt: new Date("2026-08-19T00:00:00.000Z"),
    description: "Motor oil",
    idempotencyKey: "expense-direct-receipt-1",
    createdById: "user-1",
    amountMinor: 2_500,
    treatment: "ASSOCIATE_POOL_EXPENSE",
    categoryId: "parts-category",
    costObjectId: null,
    supplierId: null,
    payments: [],
    allocations: [],
    documents,
    receiptAttachment: {
      source: "DIRECT_UPLOAD",
      draftUploadId: "upload-manual-1",
      storageKey: "receipts/manual.jpg",
    },
    postings: [],
  };
}

function fundingWithProof(): CreatePostedAssociateFundingInput {
  return {
    bookId: "company-book",
    occurredAt: new Date("2026-08-19T00:00:00.000Z"),
    description: "Associate loan received",
    idempotencyKey: "funding-proof-1",
    createdById: "user-1",
    amountMinor: 5_000,
    type: "LOAN",
    associateId: "user-1",
    destinationAccountId: "bank-account",
    reference: null,
    notes: null,
    proof: {
      draftUploadId: "funding-proof-1",
      storageKey: "funding/proof.jpg",
    },
    postings: [],
  };
}

function setupRepository(claimCount: number) {
  const updateDraftUpload = jest.fn((input: DraftUploadClaimInput) => {
    void input;
    return Promise.resolve({ count: claimCount });
  });
  const tx = {
    financialOperation: {
      create: jest.fn().mockResolvedValue({ id: "operation-1" }),
      update: jest.fn().mockResolvedValue({ id: "operation-1" }),
    },
    expense: { create: jest.fn().mockResolvedValue({ id: "expense-1" }) },
    expensePayment: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    economicAllocation: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    financialDocument: {
      create: jest.fn().mockResolvedValue({ id: "document-1" }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    associateFunding: {
      create: jest.fn().mockResolvedValue({ id: "funding-1" }),
    },
    expenseExtractionDraft: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    draftUpload: {
      updateMany: updateDraftUpload,
    },
    journalEntry: { create: jest.fn().mockResolvedValue({ id: "journal-1" }) },
    journalPosting: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      Promise.resolve(callback(tx)),
    ),
  };
  const repository = new PrismaFinanceRepository(prisma as never);

  return { repository, tx };
}
