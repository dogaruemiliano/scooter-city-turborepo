import { BadRequestException, ConflictException } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { normalizeTaxIdentifier } from "../finance/tax-identifier";

export { normalizeTaxIdentifier } from "../finance/tax-identifier";

interface ExpenseDocumentMetadataPolicyInput {
  type: v1.finance.ExpenseDocumentType;
  buyerCuiStatus: v1.finance.ExpenseBuyerCuiStatus;
  buyerTaxIdentifier?: string | null;
  expectedBuyerTaxIdentifier?: string | null;
}

const FISCAL_DOCUMENT_TYPES = new Set<v1.finance.ExpenseDocumentType>([
  "FISCAL_RECEIPT",
  "INVOICE",
  "CREDIT_NOTE",
]);

/**
 * Enforces evidence semantics that are intentionally stricter than the
 * generic document shape. Accounting values are never inferred from a file.
 */
export function assertExpenseDocumentMetadataPolicy(
  document: ExpenseDocumentMetadataPolicyInput,
): void {
  if (
    document.type === "POS_RECEIPT" &&
    (document.buyerCuiStatus !== "NOT_APPLICABLE" ||
      document.buyerTaxIdentifier != null)
  ) {
    throw new BadRequestException(
      "A POS receipt cannot carry buyer tax evidence and must use the NOT_APPLICABLE buyer-CUI status",
    );
  }

  if (!FISCAL_DOCUMENT_TYPES.has(document.type)) return;

  if (document.buyerCuiStatus === "NOT_APPLICABLE") {
    throw new BadRequestException(
      "Fiscal evidence cannot use the NOT_APPLICABLE buyer-CUI status",
    );
  }

  const captured = normalizeTaxIdentifier(document.buyerTaxIdentifier);
  const expected = normalizeTaxIdentifier(document.expectedBuyerTaxIdentifier);
  if (
    document.buyerCuiStatus === "MATCHED" &&
    (!captured || !expected || captured !== expected)
  ) {
    throw new BadRequestException(
      "MATCHED buyer-CUI status requires the legal entity buyer tax identifier",
    );
  }
  if (document.buyerCuiStatus === "MISSING" && captured) {
    throw new BadRequestException(
      "MISSING buyer-CUI status cannot include a buyer tax identifier",
    );
  }
  if (
    document.buyerCuiStatus === "MISMATCH" &&
    (!captured || (expected !== null && captured === expected))
  ) {
    throw new BadRequestException(
      "MISMATCH buyer-CUI status requires a captured, non-matching buyer tax identifier",
    );
  }
}

/**
 * Both renditions are append-once. In particular, the ORIGINAL role can never
 * be replaced by a later upload; corrections belong in metadata or a separate
 * document record.
 */
export function assertExpenseDocumentAssetRoleAvailable(
  existingRoles: readonly v1.finance.ExpenseDocumentAssetRole[],
  requestedRole: v1.finance.ExpenseDocumentAssetRole,
): void {
  if (existingRoles.includes(requestedRole)) {
    throw new ConflictException(
      `The expense document already has a ${requestedRole.toLowerCase()} asset`,
    );
  }
  if (requestedRole === "NORMALIZED" && !existingRoles.includes("ORIGINAL")) {
    throw new ConflictException(
      "A normalized expense document requires an original file first",
    );
  }
}

export function expenseDocumentUploadScope(input: {
  expenseId: string;
  documentId: string;
  role: v1.finance.ExpenseDocumentAssetRole;
  uploadedByUserId: string;
}): string {
  return [
    "expense-document",
    input.expenseId,
    input.documentId,
    input.role.toLowerCase(),
    input.uploadedByUserId,
  ].join(":");
}
