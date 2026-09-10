/**
 * Read-side of the finance module.
 *
 * Queries never compute financial policy; they read rows and hand them to the
 * mappers. The only arithmetic here is summing postings into balances, and
 * even that is a plain `SUM` — no balance is ever stored, so there is nothing
 * that can fall out of step with the journal.
 */
import { Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { FinanceNotFoundError } from "../domain/finance.errors";
import {
  toCostObject,
  toExpenseCategory,
  toFinanceBook,
  toFinancialOperation,
  toFinancialOperationListItem,
  toLedgerAccount,
  toLedgerAccountBalance,
} from "../finance.mapper";
import { PrismaFinanceRepository } from "../infrastructure/prisma-finance.repository";

@Injectable()
export class FinanceQueriesService {
  constructor(private readonly repository: PrismaFinanceRepository) {}

  async listBooks(): Promise<v1.finance.FinanceBookList> {
    const books = await this.repository.listBooks();
    return { items: books.map(toFinanceBook) };
  }

  async listAccounts(
    query: v1.finance.ListLedgerAccountsQuery,
  ): Promise<v1.finance.LedgerAccountList> {
    const bookId = await this.resolveBookFilter(query.bookId, query.bookType);
    const accounts = await this.repository.listAccounts({ ...query, bookId });

    return { items: accounts.map(toLedgerAccount) };
  }

  async getAccount(accountId: string): Promise<v1.finance.LedgerAccount> {
    const account = await this.repository.findAccountById(accountId);

    if (!account) {
      throw new FinanceNotFoundError("That ledger account does not exist.", {
        accountId,
      });
    }

    return toLedgerAccount(account);
  }

  async getAccountBalance(
    accountId: string,
  ): Promise<v1.finance.LedgerAccountBalance> {
    const account = await this.repository.findAccountById(accountId);

    if (!account) {
      throw new FinanceNotFoundError("That ledger account does not exist.", {
        accountId,
      });
    }

    const [balance] = await this.repository.accountBalances([accountId]);

    return toLedgerAccountBalance(account, balance, new Date());
  }

  /** Balances for a whole book, for the account overview screen. */
  async listAccountBalances(
    query: v1.finance.ListLedgerAccountsQuery,
  ): Promise<v1.finance.LedgerAccountBalanceList> {
    const bookId = await this.resolveBookFilter(query.bookId, query.bookType);
    const accounts = await this.repository.listAccounts({ ...query, bookId });
    const balances = await this.repository.accountBalances(
      accounts.map((account) => account.id),
    );
    const byAccount = new Map(
      balances.map((balance) => [balance.accountId, balance]),
    );
    const asOf = new Date();

    return {
      items: accounts.map((account) =>
        toLedgerAccountBalance(account, byAccount.get(account.id), asOf),
      ),
    };
  }

  async listExpenseCategories(
    query: v1.finance.ListExpenseCategoriesQuery,
  ): Promise<v1.finance.ExpenseCategoryList> {
    const bookId = await this.resolveBookFilter(query.bookId, query.bookType);
    const categories = await this.repository.listExpenseCategories({
      bookId,
      includeInactive: query.includeInactive,
    });

    return { items: categories.map(toExpenseCategory) };
  }

  async listCostObjects(
    query: v1.finance.ListCostObjectsQuery,
  ): Promise<v1.finance.CostObjectList> {
    const bookId = await this.resolveBookFilter(query.bookId, query.bookType);
    const costObjects = await this.repository.listCostObjects({
      bookId,
      type: query.type,
      includeInactive: query.includeInactive,
    });

    return { items: costObjects.map(toCostObject) };
  }

  async listOperations(
    query: v1.finance.ListFinancialOperationsQuery,
  ): Promise<v1.finance.FinancialOperationList> {
    const bookId = await this.resolveBookFilter(query.bookId, query.bookType);
    const { items, total } = await this.repository.listOperations({
      ...query,
      bookId,
    });

    return {
      items: items.map(toFinancialOperationListItem),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getOperation(
    operationId: string,
  ): Promise<v1.finance.FinancialOperation> {
    const operation = await this.repository.findOperationById(operationId);

    if (!operation) {
      throw new FinanceNotFoundError("That operation does not exist.", {
        operationId,
      });
    }

    return toFinancialOperation(operation);
  }

  /**
   * Callers may filter by book ID or by book type. Type is the convenient
   * one — there is exactly one book per type — and saves the UI a lookup.
   */
  private async resolveBookFilter(
    bookId: string | undefined,
    bookType: v1.finance.FinanceBookType | undefined,
  ): Promise<string | undefined> {
    if (bookId) return bookId;
    if (!bookType) return undefined;

    const book = await this.repository.findBookByType(bookType);

    if (!book) {
      throw new FinanceNotFoundError(
        `There is no ${bookType} finance book. Run the finance seed to create it.`,
        { bookType },
      );
    }

    return book.id;
  }
}
