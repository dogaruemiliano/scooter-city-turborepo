import { Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import {
  FinanceNotFoundError,
  FinanceValidationError,
} from "../domain/finance.errors";
import { PrismaExpenseExtractionRepository } from "../infrastructure/prisma-expense-extraction.repository";
import {
  normalizeLegalName,
  normalizeTaxIdentifier,
} from "./expenses/map-expense-extraction";

@Injectable()
export class CompanyIdentityService {
  constructor(private readonly repository: PrismaExpenseExtractionRepository) {}

  async get(): Promise<v1.finance.FinanceLegalIdentityResponse> {
    const identity = await this.repository.findCompanyIdentity();
    return { identity: identity ? toIdentity(identity) : null };
  }

  async upsert(
    input: v1.finance.UpsertFinanceLegalIdentityInput,
  ): Promise<v1.finance.FinanceLegalIdentity> {
    const book = await this.repository.findCompanyBook();
    if (!book) {
      throw new FinanceNotFoundError(
        "There is no company finance book. Run the finance seed first.",
      );
    }

    const normalizedLegalName = normalizeLegalName(input.legalName);
    const normalizedTaxIdentifier = normalizeTaxIdentifier(input.taxIdentifier);
    if (!normalizedLegalName || !normalizedTaxIdentifier) {
      throw new FinanceValidationError(
        "The company legal name and tax identifier must contain letters or numbers.",
      );
    }

    const identity = await this.repository.upsertCompanyIdentity({
      bookId: book.id,
      legalName: input.legalName,
      normalizedLegalName,
      taxIdentifier: input.taxIdentifier,
      normalizedTaxIdentifier,
      nameAliases: uniqueAliases(input.nameAliases, input.legalName),
      countryCode: input.countryCode,
    });
    return toIdentity(identity);
  }
}

function uniqueAliases(
  aliases: readonly string[],
  legalName: string,
): string[] {
  const legal = normalizeLegalName(legalName);
  const seen = new Set<string>();
  return aliases.filter((alias) => {
    const normalized = normalizeLegalName(alias);
    if (!normalized || normalized === legal || seen.has(normalized))
      return false;
    seen.add(normalized);
    return true;
  });
}

function toIdentity(identity: {
  id: string;
  bookId: string;
  legalName: string;
  taxIdentifier: string;
  nameAliases: string[];
  countryCode: string;
  createdAt: Date;
  updatedAt: Date;
}): v1.finance.FinanceLegalIdentity {
  return {
    id: identity.id,
    bookId: identity.bookId,
    legalName: identity.legalName,
    taxIdentifier: identity.taxIdentifier,
    nameAliases: identity.nameAliases,
    countryCode: identity.countryCode,
    createdAt: identity.createdAt.toISOString(),
    updatedAt: identity.updatedAt.toISOString(),
  };
}
