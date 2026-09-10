/**
 * Finds ledger accounts by what they mean, never by ID.
 *
 * Account IDs are generated per environment, so any code that names one is
 * code that only works on one database. Policies ask for "the account that
 * records what this book owes Iusti" and get back whichever row happens to
 * play that part here.
 *
 * A selector that matches zero or several accounts is treated as a setup
 * failure, not a caller mistake. Picking the first of two matching payable
 * accounts would post real money to an arbitrary one of them.
 */
import { Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import {
  FinanceNotFoundError,
  LedgerConfigurationError,
} from "../domain/finance.errors";
import type {
  LedgerAccountResolverPort,
  LedgerAccountSelector,
  ResolvedLedgerAccount,
} from "../domain/finance.types";
import type { LedgerAccount } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

const ASSOCIATE_SCOPED_ROLES = new Set<v1.finance.LedgerAccountRole>(
  v1.finance.ASSOCIATE_SCOPED_LEDGER_ROLES,
);

@Injectable()
export class LedgerAccountResolver implements LedgerAccountResolverPort {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    selector: LedgerAccountSelector,
  ): Promise<ResolvedLedgerAccount> {
    this.assertSelectorShape(selector);

    const matches = await this.prisma.ledgerAccount.findMany({
      where: {
        bookId: selector.bookId,
        role: selector.role,
        associateId: selector.associateId ?? null,
        isActive: true,
        ...(selector.requireDefault === true ? { isDefault: true } : {}),
      },
      orderBy: [{ isDefault: "desc" }, { code: "asc" }],
    });

    if (matches.length === 0) {
      throw new LedgerConfigurationError(this.describeMissing(selector), {
        ...selector,
      });
    }

    if (matches.length > 1) {
      // Exactly one may be flagged default; otherwise the ledger is ambiguous
      // and somebody has to decide which account is authoritative.
      const defaults = matches.filter((account) => account.isDefault);

      if (defaults.length !== 1) {
        throw new LedgerConfigurationError(
          `${matches.length} accounts in this book share the role ${selector.role} and none is marked as the default. Mark exactly one.`,
          { ...selector, accountCodes: matches.map((row) => row.code) },
        );
      }

      return toResolvedAccount(defaults[0]);
    }

    return toResolvedAccount(matches[0]);
  }

  async resolveById(
    bookId: string,
    accountId: string,
  ): Promise<ResolvedLedgerAccount> {
    const account = await this.prisma.ledgerAccount.findUnique({
      where: { id: accountId },
    });

    // Reported as "not found" rather than "wrong book" so a caller cannot
    // probe for the existence of accounts in books they cannot see.
    if (!account || account.bookId !== bookId) {
      throw new FinanceNotFoundError(
        "That ledger account does not exist in this finance book.",
        { accountId, bookId },
      );
    }

    return toResolvedAccount(account);
  }

  /** Associate-scoped roles need an associate; the rest must not have one. */
  private assertSelectorShape(selector: LedgerAccountSelector): void {
    const needsAssociate = ASSOCIATE_SCOPED_ROLES.has(selector.role);

    if (needsAssociate && !selector.associateId) {
      throw new LedgerConfigurationError(
        `The role ${selector.role} identifies an account belonging to one associate, but no associate was given.`,
        { role: selector.role },
      );
    }

    if (!needsAssociate && selector.associateId) {
      throw new LedgerConfigurationError(
        `The role ${selector.role} is not associate-specific, so it cannot be resolved for one associate.`,
        { role: selector.role, associateId: selector.associateId },
      );
    }
  }

  private describeMissing(selector: LedgerAccountSelector): string {
    return selector.associateId
      ? `This finance book has no ${selector.role} account for that associate. Add the associate as a book member to create their accounts.`
      : `This finance book has no ${selector.role} account. Run the finance seed to create the standard chart of accounts.`;
  }
}

export function toResolvedAccount(
  account: LedgerAccount,
): ResolvedLedgerAccount {
  return {
    id: account.id,
    bookId: account.bookId,
    code: account.code,
    name: account.name,
    category: account.category,
    role: account.role,
    associateId: account.associateId,
    isActive: account.isActive,
  };
}
