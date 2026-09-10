import type { v1 } from "@repo/api-shared";

import type { AssociateFundingCommand } from "../../domain/finance.types";
import type { OperationRecord } from "../../infrastructure/prisma-finance.repository";

export function toAssociateFundingCommand(
  input:
    | v1.finance.CreateAssociateFundingInput
    | v1.finance.PreviewAssociateFundingInput,
): AssociateFundingCommand {
  return {
    bookId: input.bookId,
    amountMinor: input.amountMinor,
    type: input.type,
    associateId: input.associateId,
    destinationAccountId: input.destinationAccountId,
  };
}

export function fingerprintFundingInput(
  input: v1.finance.CreateAssociateFundingInput,
): string {
  return [
    input.bookId,
    new Date(input.occurredAt).toISOString(),
    input.amountMinor,
    input.type,
    input.associateId,
    input.destinationAccountId,
  ].join("//");
}

export function fingerprintStoredFunding(row: OperationRecord): string {
  if (!row.associateFunding) return "";

  return [
    row.bookId,
    row.occurredAt.toISOString(),
    row.associateFunding.amountMinor,
    row.associateFunding.type,
    row.associateFunding.associateId,
    row.associateFunding.destinationAccountId,
  ].join("//");
}
