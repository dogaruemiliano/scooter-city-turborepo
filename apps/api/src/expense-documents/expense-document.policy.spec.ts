import { BadRequestException, ConflictException } from "@nestjs/common";

import {
  assertExpenseDocumentAssetRoleAvailable,
  assertExpenseDocumentMetadataPolicy,
  expenseDocumentUploadScope,
} from "./expense-document.policy";

describe("expense document policy", () => {
  it("treats a POS receipt as payment evidence with no buyer-CUI review", () => {
    expect(() =>
      assertExpenseDocumentMetadataPolicy({
        type: "POS_RECEIPT",
        buyerCuiStatus: "MATCHED",
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      assertExpenseDocumentMetadataPolicy({
        type: "POS_RECEIPT",
        buyerCuiStatus: "NOT_APPLICABLE",
        buyerTaxIdentifier: "RO123456",
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      assertExpenseDocumentMetadataPolicy({
        type: "POS_RECEIPT",
        buyerCuiStatus: "NOT_APPLICABLE",
        buyerTaxIdentifier: null,
      }),
    ).not.toThrow();
  });

  it("allows buyer-CUI review for tax-capable evidence", () => {
    expect(() =>
      assertExpenseDocumentMetadataPolicy({
        type: "INVOICE",
        buyerCuiStatus: "MATCHED",
        buyerTaxIdentifier: "ro 12-3456",
        expectedBuyerTaxIdentifier: "123456",
      }),
    ).not.toThrow();
  });

  it("keeps fiscal buyer-CUI state consistent with captured evidence", () => {
    expect(() =>
      assertExpenseDocumentMetadataPolicy({
        type: "INVOICE",
        buyerCuiStatus: "NOT_APPLICABLE",
        buyerTaxIdentifier: null,
        expectedBuyerTaxIdentifier: "RO123456",
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertExpenseDocumentMetadataPolicy({
        type: "FISCAL_RECEIPT",
        buyerCuiStatus: "MATCHED",
        buyerTaxIdentifier: null,
        expectedBuyerTaxIdentifier: "RO123456",
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertExpenseDocumentMetadataPolicy({
        type: "INVOICE",
        buyerCuiStatus: "MISSING",
        buyerTaxIdentifier: "RO999999",
        expectedBuyerTaxIdentifier: "RO123456",
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertExpenseDocumentMetadataPolicy({
        type: "CREDIT_NOTE",
        buyerCuiStatus: "MISMATCH",
        buyerTaxIdentifier: "RO123456",
        expectedBuyerTaxIdentifier: "ro 123456",
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertExpenseDocumentMetadataPolicy({
        type: "CREDIT_NOTE",
        buyerCuiStatus: "MISMATCH",
        buyerTaxIdentifier: "RO999999",
        expectedBuyerTaxIdentifier: "RO123456",
      }),
    ).not.toThrow();
  });

  it("keeps original and normalized assets append-once", () => {
    expect(() =>
      assertExpenseDocumentAssetRoleAvailable(["ORIGINAL"], "ORIGINAL"),
    ).toThrow(ConflictException);
    expect(() =>
      assertExpenseDocumentAssetRoleAvailable(["ORIGINAL"], "NORMALIZED"),
    ).not.toThrow();
    expect(() =>
      assertExpenseDocumentAssetRoleAvailable(["NORMALIZED"], "NORMALIZED"),
    ).toThrow(ConflictException);
    expect(() =>
      assertExpenseDocumentAssetRoleAvailable([], "NORMALIZED"),
    ).toThrow(ConflictException);
  });

  it("binds upload tokens to expense, document, role, and uploader", () => {
    expect(
      expenseDocumentUploadScope({
        expenseId: "expense-1",
        documentId: "document-1",
        role: "ORIGINAL",
        uploadedByUserId: "user-1",
      }),
    ).toBe("expense-document:expense-1:document-1:original:user-1");
  });
});
