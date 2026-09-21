import { v1 } from "@repo/api-shared";
import { webApi } from "@/lib/api";

export function createFinanceBook(input: v1.finance.CreateFinanceBookInput) {
  return webApi.fetch(v1.finance.ROUTES.books, v1.finance.financeBookSchema, {
    method: "POST",
    json: input,
  });
}

export function updateFinanceBook(
  bookId: string,
  input: v1.finance.UpdateFinanceBookInput,
) {
  return webApi.fetch(
    v1.finance.ROUTES.book(bookId),
    v1.finance.financeBookSchema,
    { method: "PUT", json: input },
  );
}
