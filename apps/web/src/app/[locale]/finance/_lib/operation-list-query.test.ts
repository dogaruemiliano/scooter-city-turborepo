import { describe, expect, it } from "vitest";

import {
  defaultOperationFilters,
  financeSearchParams,
  operationFilterCount,
  operationListHref,
  operationTimestampInput,
  operationTimestampValue,
  readOperationQuery,
  updateOperationFilter,
  validOperationFilterRange,
} from "./operation-list-query";

describe("finance operation list queries", () => {
  it("reads all supported filters and page, with a route-owned page size", () => {
    const search = financeSearchParams({
      page: "3",
      pageSize: "1000",
      bookId: "book-company",
      bookType: "COMPANY",
      kind: "EXPENSE",
      status: "POSTED",
      treatment: "OPERATING_EXPENSE",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-11-01T00:00:00.000Z",
      view: "ledger",
    });
    const { apiQuery, filters } = readOperationQuery(search, 50);
    expect(Object.fromEntries(apiQuery)).toEqual({
      page: "3",
      pageSize: "50",
      ...Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value),
      ),
    });
    expect(apiQuery.has("view")).toBe(false);
    expect(apiQuery.has("bookType")).toBe(false);
  });

  it("does not forward pages whose API offset would overflow", () => {
    expect(
      readOperationQuery(new URLSearchParams("page=9007199254740991"), 50).page,
    ).toBe(1);
    expect(
      readOperationQuery(new URLSearchParams("page=42949674"), 50).page,
    ).toBe(1);
    expect(readOperationQuery(new URLSearchParams("page=2"), 50).page).toBe(2);
  });

  it("treats book and book type as alternate selectors, matching API precedence", () => {
    const byBook = { ...defaultOperationFilters(), bookId: "company" };
    const byType = updateOperationFilter(byBook, "bookType", "ASSOCIATE_POOL");
    expect(byType.bookId).toBe("");
    expect(byType.bookType).toBe("ASSOCIATE_POOL");
    expect(updateOperationFilter(byType, "bookId", "company")).toEqual(byBook);
    expect(
      readOperationQuery(
        new URLSearchParams("bookType=COMPANY"),
        50,
      ).apiQuery.get("bookType"),
    ).toBe("COMPANY");
  });

  it("rejects malformed query values independently of valid filters", () => {
    const { page, filters } = readOperationQuery(
      new URLSearchParams(
        "page=-1&bookType=other&status=REVERSED&from=yesterday&kind=FAKE",
      ),
      50,
    );
    expect(page).toBe(1);
    expect(filters).toEqual({
      ...defaultOperationFilters(),
      status: "REVERSED",
    });
  });

  it("keeps the fixed expense kind when parsing, applying reset and paging", () => {
    const search = new URLSearchParams(
      "kind=INCOME&page=5&bookId=company&status=POSTED&view=ledger",
    );
    const { filters, apiQuery } = readOperationQuery(search, 25, "EXPENSE");
    expect(apiQuery.get("kind")).toBe("EXPENSE");
    expect(operationFilterCount(filters, "EXPENSE")).toBe(2);

    const next = new URL(
      operationListHref("/finance/expenses", search, filters, 6, "EXPENSE"),
      "https://local.test",
    );
    expect(Object.fromEntries(next.searchParams)).toEqual({
      kind: "EXPENSE",
      page: "6",
      bookId: "company",
      status: "POSTED",
      view: "ledger",
    });

    const reset = new URL(
      operationListHref(
        "/finance/expenses",
        search,
        defaultOperationFilters("EXPENSE"),
        1,
        "EXPENSE",
      ),
      "https://local.test",
    );
    expect(Object.fromEntries(reset.searchParams)).toEqual({
      kind: "EXPENSE",
      view: "ledger",
    });
  });

  it("preserves repeated unrelated URL context when filters are applied", () => {
    const search = financeSearchParams({
      tag: ["one", "two"],
      page: "8",
      status: "DRAFT",
    });
    const href = operationListHref("/finance/operations", search, {
      ...defaultOperationFilters(),
      status: "POSTED",
    });
    const result = new URL(href, "https://local.test");
    expect(result.searchParams.getAll("tag")).toEqual(["one", "two"]);
    expect(result.searchParams.has("page")).toBe(false);
    expect(result.searchParams.get("status")).toBe("POSTED");
  });

  it("keeps date bounds in UTC and rejects a reversed or empty interval", () => {
    expect(operationTimestampInput("2026-10-01T03:00:00.000+03:00")).toBe(
      "2026-10-01T00:00:00.000",
    );
    expect(operationTimestampValue("2026-10-01T00:00")).toBe(
      "2026-10-01T00:00:00.000Z",
    );
    const filters = {
      ...defaultOperationFilters(),
      from: "2026-10-02T00:00:00.000Z",
      to: "2026-10-01T00:00:00.000Z",
    };
    expect(validOperationFilterRange(filters)).toBe(false);
    expect(validOperationFilterRange({ ...filters, to: filters.from })).toBe(
      false,
    );
    expect(
      validOperationFilterRange({ ...filters, to: "2026-10-03T00:00:00.000Z" }),
    ).toBe(true);
  });
});
