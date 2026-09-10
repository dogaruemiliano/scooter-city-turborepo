import { v1 } from "@repo/api-shared";

import {
  FinanceNotFoundError,
  FinanceStateError,
  FinanceValidationError,
} from "../../domain/finance.errors";
import { CreateExpenseUseCase } from "./create-expense.use-case";

jest.mock("../../finance.mapper", () => ({
  toFinancialOperation: (row: unknown) => row,
}));

const input: v1.finance.CreateExpenseInput = {
  bookId: "company-book",
  extractionDraftId: "draft-1",
  occurredAt: "2026-08-22T00:00:00.000Z",
  description: "Parts",
  amountMinor: 10_000,
  treatment: "OPERATING_EXPENSE",
  categoryId: "parts-category",
  supplierId: "supplier-1",
  payments: [
    {
      sourceType: "BOOK_ACCOUNT",
      sourceAccountId: "bank-account",
      paymentMethod: "CARD",
      amountMinor: 10_000,
    },
  ],
  allocations: [{ type: "COMMON", amountMinor: 10_000 }],
  documents: [
    {
      type: "RECEIPT",
      supplierName: "Example Parts SRL",
      supplierTaxId: "RO12345678",
    },
  ],
};

const storedUpload = {
  provider: "s3",
  bucket: "private-bucket",
  storageKey: "receipts/manual.jpg",
  contentType: "image/jpeg",
  byteSize: 1_024,
  checksumSha256: "a".repeat(64),
};

const validDraftUpload = {
  id: "upload-manual-1",
  userId: "user-1",
  ...storedUpload,
  purpose: "finance-expense-document",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  claimedAt: null,
  cleanupStartedAt: null,
};

describe("CreateExpenseUseCase receipt confirmation", () => {
  it("passes the owner-scoped READY upload into the atomic expense write", async () => {
    const { useCase, repository } = setup({ status: "READY" });

    await useCase.execute({
      input,
      idempotencyKey: "expense-command-1",
      createdById: "user-1",
    });

    expect(repository.createPostedExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: "supplier-1",
        receiptAttachment: {
          source: "EXTRACTION_DRAFT",
          extractionDraftId: "draft-1",
          draftUploadId: "upload-1",
          storageKey: "receipts/cropped.jpg",
        },
      }),
    );
  });

  it("refuses an extraction draft that was already confirmed", async () => {
    const { useCase, repository } = setup({
      status: "CONFIRMED",
      confirmedOperationId: "operation-old",
    });

    await expect(
      useCase.execute({
        input,
        idempotencyKey: "expense-command-2",
        createdById: "user-1",
      }),
    ).rejects.toBeInstanceOf(FinanceStateError);
    expect(repository.createPostedExpense).not.toHaveBeenCalled();
  });

  it("refuses an extraction upload already claimed for cleanup", async () => {
    const { useCase, repository } = setup({
      status: "READY",
      cleanupStartedAt: new Date("2026-08-23T10:00:00.000Z"),
    });

    await expect(
      useCase.execute({
        input,
        idempotencyKey: "expense-command-cleanup-race",
        createdById: "user-1",
      }),
    ).rejects.toBeInstanceOf(FinanceStateError);
    expect(repository.createPostedExpense).not.toHaveBeenCalled();
  });

  it("refuses an archived supplier", async () => {
    const { useCase, repository } = setup({ status: "READY" });
    repository.findSupplierById.mockResolvedValue({
      id: "supplier-1",
      name: "Archived Supplier",
      isActive: false,
    });

    await expect(
      useCase.execute({
        input,
        idempotencyKey: "expense-command-3",
        createdById: "user-1",
      }),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);
    expect(repository.createPostedExpense).not.toHaveBeenCalled();
  });

  it("resolves and validates a direct receipt upload before the atomic write", async () => {
    const { useCase, repository, imageStorage } = setup({ status: "READY" });

    await useCase.execute({
      input: {
        ...input,
        extractionDraftId: undefined,
        receiptUploadToken: "signed-upload-token",
      },
      idempotencyKey: "expense-command-direct-1",
      createdById: "user-1",
    });

    expect(imageStorage.completePresignedUpload).toHaveBeenCalledWith(
      "signed-upload-token",
      "finance-expense-document:user-1",
    );
    expect(repository.createPostedExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptAttachment: {
          source: "DIRECT_UPLOAD",
          draftUploadId: "upload-manual-1",
          storageKey: "receipts/manual.jpg",
        },
      }),
    );
  });

  it("returns an idempotent replay before completing a direct upload", async () => {
    const { useCase, repository, imageStorage } = setup({ status: "READY" });
    const directInput: v1.finance.CreateExpenseInput = {
      ...input,
      extractionDraftId: undefined,
      receiptUploadToken: "expired-or-already-consumed-token",
    };
    repository.findOperationByIdempotencyKey.mockResolvedValue({
      id: "operation-existing",
      bookId: directInput.bookId,
      occurredAt: new Date(directInput.occurredAt),
      expense: {
        amountMinor: directInput.amountMinor,
        treatment: directInput.treatment,
        categoryId: directInput.categoryId,
        costObjectId: null,
        supplierId: directInput.supplierId,
        payments: directInput.payments.map((payment) => ({
          ...payment,
          sourceAccountId:
            payment.sourceType === "BOOK_ACCOUNT"
              ? payment.sourceAccountId
              : null,
          payerAssociateId:
            payment.sourceType === "ASSOCIATE_PERSONAL_FUNDS"
              ? payment.payerAssociateId
              : null,
        })),
      },
      allocations: directInput.allocations.map((allocation) => ({
        ...allocation,
        associateId:
          allocation.type === "ASSOCIATE_SPECIFIC"
            ? allocation.associateId
            : null,
      })),
      expenseExtractionDraft: null,
    });

    await expect(
      useCase.execute({
        input: directInput,
        idempotencyKey: "expense-command-direct-replay",
        createdById: "user-1",
      }),
    ).resolves.toMatchObject({ id: "operation-existing" });

    expect(imageStorage.completePresignedUpload).not.toHaveBeenCalled();
    expect(repository.createPostedExpense).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", { expiresAt: new Date("2000-01-01T00:00:00.000Z") }],
    ["already claimed", { claimedAt: new Date("2026-08-22T10:00:00.000Z") }],
    [
      "claimed for cleanup",
      { cleanupStartedAt: new Date("2026-08-22T10:00:00.000Z") },
    ],
    ["owned by someone else", { userId: "user-2" }],
    ["for another purpose", { purpose: "person-document" }],
    ["from another provider", { provider: "other-provider" }],
    ["from another bucket", { bucket: "other-bucket" }],
    ["with another object key", { storageKey: "receipts/other.jpg" }],
    ["with another content type", { contentType: "image/png" }],
    ["with another size", { byteSize: 2_048 }],
    ["with another checksum", { checksumSha256: "b".repeat(64) }],
  ])("refuses a direct receipt upload that is %s", async (_label, override) => {
    const { useCase, repository, prisma } = setup({ status: "READY" });
    prisma.draftUpload.findUnique.mockResolvedValue({
      ...validDraftUpload,
      ...override,
    });

    await expect(
      useCase.execute({
        input: {
          ...input,
          extractionDraftId: undefined,
          receiptUploadToken: "signed-upload-token",
        },
        idempotencyKey: `expense-command-direct-${_label}`,
        createdById: "user-1",
      }),
    ).rejects.toBeInstanceOf(FinanceValidationError);
    expect(repository.createPostedExpense).not.toHaveBeenCalled();
  });
});

function setup(inputDraft: {
  status: "READY" | "CONFIRMED";
  confirmedOperationId?: string;
  cleanupStartedAt?: Date;
}) {
  const repository = {
    findOperationByIdempotencyKey: jest.fn().mockResolvedValue(null),
    findBookById: jest.fn().mockResolvedValue({
      id: "company-book",
      type: "COMPANY",
    }),
    findSupplierById: jest.fn().mockResolvedValue({
      id: "supplier-1",
      name: "Example Parts SRL",
      isActive: true,
    }),
    createPostedExpense: jest.fn().mockResolvedValue("operation-1"),
    findOperationById: jest.fn().mockResolvedValue({ id: "operation-1" }),
  };
  const prisma = {
    expenseCategory: {
      findUnique: jest.fn().mockResolvedValue({
        bookId: "company-book",
        isActive: true,
        name: "Parts",
      }),
    },
    costObject: { findUnique: jest.fn() },
    expenseExtractionDraft: {
      findFirst: jest.fn().mockResolvedValue({
        id: "draft-1",
        sourceUploadId: "upload-1",
        status: inputDraft.status,
        confirmedOperationId: inputDraft.confirmedOperationId ?? null,
        sourceUpload: {
          storageKey: "receipts/cropped.jpg",
          purpose: "finance-expense-document",
          claimedAt: null,
          cleanupStartedAt: inputDraft.cleanupStartedAt ?? null,
        },
      }),
    },
    draftUpload: {
      findUnique: jest.fn().mockResolvedValue(validDraftUpload),
    },
  };
  const policy = { build: jest.fn().mockResolvedValue({ postings: [] }) };
  const journal = { assertBalanced: jest.fn() };
  const imageStorage = {
    completePresignedUpload: jest.fn().mockResolvedValue(storedUpload),
  };
  const useCase = new CreateExpenseUseCase(
    policy as never,
    journal as never,
    repository as never,
    prisma as never,
    imageStorage as never,
  );

  return { useCase, repository, prisma, imageStorage };
}
