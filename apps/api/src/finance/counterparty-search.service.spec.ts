import { BadRequestException } from "@nestjs/common";
import type { v1 } from "@repo/api-shared";

import { CounterpartySearchService } from "./counterparty-search.service";

interface QueryWithValues {
  strings: string[];
  values: unknown[];
}

describe("CounterpartySearchService", () => {
  const queryRaw = jest.fn();
  const service = new CounterpartySearchService({
    $queryRaw: queryRaw,
  } as never);

  beforeEach(() => queryRaw.mockReset());

  it("returns safe summaries, masks sensitive suffixes, and caps a page", async () => {
    queryRaw.mockResolvedValue([
      {
        id: "cp-person",
        kind: "PERSON",
        label: "Ana Popescu",
        email: "ana@example.com",
        phoneSuffix: "4567",
        identifierSuffix: "6789",
        score: 2,
      },
      {
        id: "cp-company",
        kind: "COMPANY",
        label: "Acme",
        email: null,
        phoneSuffix: null,
        identifierSuffix: "4321",
        score: 1,
      },
    ]);

    const result = await service.search({
      search: "ana",
      pageSize: 1,
      transactionType: "EXPENSE",
    });

    expect(result.items).toEqual([
      {
        id: "cp-person",
        kind: "PERSON",
        label: "Ana Popescu",
        description: "ana@example.com · …4567",
        email: "ana@example.com",
        phoneMasked: "…4567",
        identifierMasked: "…6789",
      },
    ]);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(JSON.stringify(result)).not.toContain("123456789");
  });

  it("binds hostile search text as values rather than SQL source", async () => {
    queryRaw.mockResolvedValue([]);
    const hostile = "%' OR true --";

    await service.search({
      search: hostile,
      pageSize: 20,
      transactionType: "EXPENSE",
    });

    const call = queryRaw.mock.calls.at(0) as unknown[] | undefined;
    const sql = call?.[0] as QueryWithValues;
    expect(sql.values).toContain(hostile.toLocaleLowerCase("ro-RO"));
    expect(sql.values).toContain("%\\%' or true --%");
    expect(sql).not.toHaveProperty("text", expect.stringContaining(hostile));
  });

  it("filters through the same indexed text expressions used by the migration", async () => {
    queryRaw.mockResolvedValue([]);

    await service.search({
      search: "ana",
      pageSize: 20,
      transactionType: "EXPENSE",
    });

    const call = queryRaw.mock.calls.at(0) as unknown[] | undefined;
    const sql = call?.[0] as QueryWithValues;
    const source = sql.strings.join(" ");
    expect(source).toContain("coalesce(p.\"addressLine1\", '')");
    expect(source).toContain(
      "coalesce(company.\"taxIdentifierNormalized\", '')",
    );
    expect(source).toContain("%>");
  });

  it("ranks an empty expense preview by posted usage", async () => {
    queryRaw.mockResolvedValue([]);

    await service.search({
      search: "",
      pageSize: 20,
      transactionType: "EXPENSE",
    });

    const call = queryRaw.mock.calls.at(0) as unknown[] | undefined;
    const sql = call?.[0] as QueryWithValues;
    const source = sql.strings.join(" ");
    expect(source).toContain('FROM "MoneyTransaction" mt');
    expect(source).toContain("mt.status = 'POSTED'");
    expect(source).toContain('ORDER BY "rankScore" DESC');
    expect(sql.values).toContain("EXPENSE");
  });

  it("rejects a cursor when the query or kind changes", async () => {
    queryRaw.mockResolvedValue([
      {
        id: "cp-person",
        kind: "PERSON",
        label: "Ana Popescu",
        email: null,
        phoneSuffix: null,
        identifierSuffix: null,
        score: 0.8,
      },
      {
        id: "extra",
        kind: "PERSON",
        label: "Ana Two",
        email: null,
        phoneSuffix: null,
        identifierSuffix: null,
        score: 0.7,
      },
    ]);
    const first = await service.search({
      search: "ana",
      pageSize: 1,
      transactionType: "EXPENSE",
    });

    await expect(
      service.search({
        search: "acme",
        pageSize: 1,
        transactionType: "EXPENSE",
        cursor: first.nextCursor!,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("uses the cursor tuple for deterministic continuation", async () => {
    queryRaw
      .mockResolvedValueOnce([
        {
          id: "cp-person",
          kind: "PERSON",
          label: "Ana Popescu",
          email: null,
          phoneSuffix: null,
          identifierSuffix: null,
          score: 0.8,
        },
        {
          id: "extra",
          kind: "PERSON",
          label: "Ana Two",
          email: null,
          phoneSuffix: null,
          identifierSuffix: null,
          score: 0.7,
        },
      ])
      .mockResolvedValueOnce([]);
    const query: v1.finance.SearchFinancialCounterpartiesQuery = {
      search: "ana",
      kind: "PERSON",
      pageSize: 1,
      transactionType: "EXPENSE",
    };
    const first = await service.search(query);

    await service.search({ ...query, cursor: first.nextCursor! });

    const call = queryRaw.mock.calls.at(1) as unknown[] | undefined;
    const sql = call?.[0] as QueryWithValues;
    expect(sql.values).toEqual(
      expect.arrayContaining([0.8, "PERSON", "Ana Popescu", "cp-person"]),
    );
  });

  it("rejects malformed and non-canonical cursors before querying", async () => {
    await expect(
      service.search({
        search: "ana",
        pageSize: 20,
        transactionType: "EXPENSE",
        cursor: "abc=",
      }),
    ).rejects.toThrow(BadRequestException);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
