import { Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { Prisma } from "../../generated/prisma/client";
import {
  FinanceConflictError,
  FinanceNotFoundError,
} from "../domain/finance.errors";
import { toFinanceBook } from "../finance.mapper";
import { PrismaFinanceBooksRepository } from "../infrastructure/prisma-finance-books.repository";

@Injectable()
export class FinanceBooksService {
  constructor(private readonly repository: PrismaFinanceBooksRepository) {}

  async create(
    input: v1.finance.CreateFinanceBookInput,
    actorId: string,
  ): Promise<v1.finance.FinanceBook> {
    try {
      return toFinanceBook(await this.repository.create(input, actorId));
    } catch (error) {
      this.handleError(error);
    }
  }

  async update(
    bookId: string,
    input: v1.finance.UpdateFinanceBookInput,
  ): Promise<v1.finance.FinanceBook> {
    try {
      return toFinanceBook(await this.repository.update(bookId, input));
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002")
        throw new FinanceConflictError(
          "A finance book of this type already exists.",
        );
      if (error.code === "P2034")
        throw new FinanceConflictError(
          "Finance configuration changed while saving. Refresh and try again.",
        );
      if (error.code === "P2025")
        throw new FinanceNotFoundError("That finance book does not exist.");
    }
    throw error;
  }
}
