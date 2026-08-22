/**
 * End-to-end tests for the financial module against a real PostgreSQL.
 *
 * Prisma is deliberately NOT mocked here. The things these tests exist to
 * prove — transaction atomicity, the unique index behind idempotency, CHECK
 * constraints, the immutability trigger, balances summed from postings — are
 * all database behaviour. A mock would only assert that the mock works.
 *
 * Only one finance book may exist per type (`@@unique([type])`), so the suite
 * shares the seeded COMPANY book rather than creating its own. Two habits
 * keep that safe:
 *
 * - every balance assertion is a *delta* around the operation under test;
 * - settlement tests use a far-future period unique to this run, so leftovers
 *   from anywhere else cannot drift into the window.
 *
 * Cleanup removes exactly the operations this run created, and nothing else.
 */
import { INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { v1 } from "@repo/api-shared";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import request from "supertest";
import { z } from "zod";

import { seedFinance } from "../prisma/seeds/finance";
import { AppModule } from "../src/app.module";
import { CoreAuthService } from "../src/auth/modules/core-auth/core-auth.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { UsersService } from "../src/users/users.service";

const DAY_MS = 86_400_000;

describe("Finance HTTP surface (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersService;
  let coreAuth: CoreAuthService;

  let bookId: string;
  let adminToken: string;
  let emilianoId: string;
  let iustiId: string;
  let categoryId: string;
  let costObjectId: string;

  const accounts = new Map<string, string>();
  const createdUserIds: string[] = [];
  const createdOperationIds: string[] = [];

  const server = () => app.getHttpServer() as Server;

  type RequestBuilder = ReturnType<ReturnType<typeof request>["get"]>;
  const req = (): {
    get: (path: string) => RequestBuilder;
    post: (path: string) => RequestBuilder;
  } => {
    const base = request(server());
    const tag = (b: RequestBuilder) => b.set("x-requested-with", "fetch");
    return {
      get: (p) => tag(base.get(p)),
      post: (p) => tag(base.post(p)),
    };
  };

  const asAdmin = (builder: RequestBuilder) =>
    builder.set("authorization", `Bearer ${adminToken}`);

  /** A fresh idempotency key, since every financial write demands one. */
  const key = () => randomUUID();

  /**
   * A period far enough out that no real data can fall inside it, and
   * randomised per run so two runs never share a window.
   */
  let periodCursor =
    Date.UTC(2200, 0, 1) + Math.floor(Math.random() * 5_000) * DAY_MS;

  function nextPeriod(): {
    periodStart: string;
    periodEnd: string;
    occurredAt: (hour: number) => string;
  } {
    const start = periodCursor;
    periodCursor += DAY_MS;

    return {
      periodStart: new Date(start).toISOString(),
      periodEnd: new Date(start + DAY_MS).toISOString(),
      occurredAt: (hour) => new Date(start + hour * 3_600_000).toISOString(),
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);
    users = app.get(UsersService);
    coreAuth = app.get(CoreAuthService);

    // Idempotent: creates the books, associates, chart of accounts, and
    // reference data if they are not already there.
    await seedFinance(prisma);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const admin = await createUser(`fin-admin-${suffix}`, ["ADMIN"]);
    adminToken = (await coreAuth.issueSession({ user: admin })).accessToken;

    const book = await prisma.financeBook.findUniqueOrThrow({
      where: { type: "COMPANY" },
      select: { id: true },
    });
    bookId = book.id;

    const members = await prisma.financeBookMember.findMany({
      where: { bookId, validUntil: null },
      orderBy: { associateId: "asc" },
      select: { associateId: true, shareBasisPoints: true },
    });

    if (members.length !== 2) {
      throw new Error(
        `Expected the COMPANY book to have two members; found ${members.length}.`,
      );
    }

    [emilianoId, iustiId] = members.map((member) => member.associateId);

    for (const row of await prisma.ledgerAccount.findMany({
      where: { bookId },
      select: { id: true, role: true, associateId: true },
    })) {
      accounts.set(accountKey(row.role, row.associateId), row.id);
    }

    categoryId = (
      await prisma.expenseCategory.findFirstOrThrow({
        where: { bookId, code: "FUEL" },
        select: { id: true },
      })
    ).id;

    costObjectId = (
      await prisma.costObject.findFirstOrThrow({
        where: { bookId, code: "VEHICLE_SHARED_VAN" },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    if (prisma && createdOperationIds.length > 0) {
      const ids = createdOperationIds;

      // Innermost first, and reversals before the operations they point at.
      await prisma.journalPosting.deleteMany({
        where: { journalEntry: { operationId: { in: ids } } },
      });
      await prisma.journalEntry.deleteMany({
        where: { operationId: { in: ids } },
      });
      await prisma.expensePayment.deleteMany({
        where: { expense: { operationId: { in: ids } } },
      });
      await prisma.expense.deleteMany({ where: { operationId: { in: ids } } });
      await prisma.economicAllocation.deleteMany({
        where: { operationId: { in: ids } },
      });
      await prisma.financialDocument.deleteMany({
        where: { operationId: { in: ids } },
      });
      await prisma.associateFunding.deleteMany({
        where: { operationId: { in: ids } },
      });
      await prisma.financialOperation.deleteMany({
        where: { id: { in: ids }, kind: "REVERSAL" },
      });
      await prisma.financialOperation.deleteMany({
        where: { id: { in: ids } },
      });
    }

    if (prisma && createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }

    await app?.close();
  });

  function accountKey(
    role: v1.finance.LedgerAccountRole,
    associateId: string | null,
  ): string {
    return `${role}:${associateId ?? ""}`;
  }

  function accountId(
    role: v1.finance.LedgerAccountRole,
    associateId?: string,
  ): string {
    const id = accounts.get(accountKey(role, associateId ?? null));
    if (!id) throw new Error(`No ${role} account provisioned for this book.`);
    return id;
  }

  async function createUser(handle: string, roles: string[]) {
    const user = await users.createOne({
      email: `${handle}@example.com`,
      roles,
    });
    createdUserIds.push(user.id);
    return user;
  }

  /**
   * A valid expense. The default payment and allocation follow `amountMinor`,
   * so overriding only the amount still produces a balanced expense — a test
   * that wants an unbalanced one has to say so explicitly.
   */
  function expenseInput(
    overrides: Partial<v1.finance.CreateExpenseInput> = {},
  ): v1.finance.CreateExpenseInput {
    const amountMinor = overrides.amountMinor ?? 30_000;

    return {
      bookId,
      occurredAt: "2026-08-14T10:00:00.000Z",
      description: "Test expense",
      treatment: "OPERATING_EXPENSE",
      categoryId,
      amountMinor,
      payments: [
        {
          sourceType: "BOOK_ACCOUNT",
          sourceAccountId: accountId("BANK"),
          paymentMethod: "BANK_TRANSFER",
          amountMinor,
        },
      ],
      allocations: [{ type: "COMMON", amountMinor }],
      ...overrides,
    };
  }

  function fundingInput(
    overrides: Partial<v1.finance.CreateAssociateFundingInput> = {},
  ): v1.finance.CreateAssociateFundingInput {
    return {
      bookId,
      occurredAt: "2026-08-17T10:00:00.000Z",
      amountMinor: 50_000,
      type: "LOAN",
      associateId: emilianoId,
      destinationAccountId: accountId("BANK"),
      ...overrides,
    };
  }

  /** Remembers what this run created, so cleanup touches nothing else. */
  function track(res: request.Response): request.Response {
    const parsed = createdOperationSchema.safeParse(res.body);
    if (parsed.success) createdOperationIds.push(parsed.data.id);
    return res;
  }

  async function postExpense(
    input: v1.finance.CreateExpenseInput,
    idempotencyKey = key(),
  ): Promise<request.Response> {
    return track(
      await asAdmin(req().post(v1.finance.ROUTES.expenses.create))
        .set(v1.finance.IDEMPOTENCY_KEY_HEADER, idempotencyKey)
        .send(input),
    );
  }

  async function postFunding(
    input: v1.finance.CreateAssociateFundingInput,
    idempotencyKey = key(),
  ): Promise<request.Response> {
    return track(
      await asAdmin(req().post(v1.finance.ROUTES.funding.create))
        .set(v1.finance.IDEMPOTENCY_KEY_HEADER, idempotencyKey)
        .send(input),
    );
  }

  async function reverse(
    operationId: string,
    body: v1.finance.ReverseOperationInput = {},
    idempotencyKey = key(),
  ): Promise<request.Response> {
    return track(
      await asAdmin(
        req().post(v1.finance.ROUTES.operations.reverse(operationId)),
      )
        .set(v1.finance.IDEMPOTENCY_KEY_HEADER, idempotencyKey)
        .send(body),
    );
  }

  async function previewSettlement(period: {
    periodStart: string;
    periodEnd: string;
  }): Promise<request.Response> {
    return asAdmin(req().post(v1.finance.ROUTES.settlements.preview)).send({
      bookId,
      kind: "COMPANY_SPECIFIC_BENEFIT",
      ...period,
    });
  }

  async function balanceOf(
    role: v1.finance.LedgerAccountRole,
    associateId?: string,
  ): Promise<v1.finance.LedgerAccountBalance> {
    const res = await asAdmin(
      req().get(
        v1.finance.ROUTES.accounts.balance(accountId(role, associateId)),
      ),
    );
    expect(res.status).toBe(200);
    return res.body as v1.finance.LedgerAccountBalance;
  }

  // -----------------------------------------------------------------------

  describe("authorization", () => {
    it("refuses anonymous and non-admin callers", async () => {
      const anonymous = await req().get(v1.finance.ROUTES.accounts.list);
      expect(anonymous.status).toBe(401);

      const viewer = await createUser(
        `fin-viewer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        [],
      );
      const viewerToken = (await coreAuth.issueSession({ user: viewer }))
        .accessToken;

      const forbidden = await req()
        .get(v1.finance.ROUTES.accounts.list)
        .set("authorization", `Bearer ${viewerToken}`);
      expect(forbidden.status).toBe(403);
    });
  });

  describe("idempotency", () => {
    it("requires an idempotency key on every write", async () => {
      const res = await asAdmin(
        req().post(v1.finance.ROUTES.expenses.create),
      ).send(expenseInput());

      expect(res.status).toBe(400);
      expect(asErrorCode(res)).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("returns the original operation when a key is replayed", async () => {
      const idempotencyKey = key();
      const input = expenseInput({ description: "Replayed expense" });

      const first = await postExpense(input, idempotencyKey);
      const second = await postExpense(input, idempotencyKey);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(asOperation(second).id).toBe(asOperation(first).id);
      expect(
        await prisma.financialOperation.count({
          where: { bookId, idempotencyKey },
        }),
      ).toBe(1);
    });

    it("does not create a second operation when requests race", async () => {
      const idempotencyKey = key();
      const input = expenseInput({ description: "Raced expense" });

      const results = await Promise.all([
        postExpense(input, idempotencyKey),
        postExpense(input, idempotencyKey),
        postExpense(input, idempotencyKey),
      ]);

      for (const result of results) {
        expect(result.status).toBe(201);
      }
      expect(new Set(results.map((r) => asOperation(r).id)).size).toBe(1);
      expect(
        await prisma.financialOperation.count({
          where: { bookId, idempotencyKey },
        }),
      ).toBe(1);
    });

    it("rejects a key reused for a materially different expense", async () => {
      const idempotencyKey = key();

      await postExpense(expenseInput(), idempotencyKey);
      const conflicting = await postExpense(
        expenseInput({
          amountMinor: 50_000,
          payments: [
            {
              sourceType: "BOOK_ACCOUNT",
              sourceAccountId: accountId("BANK"),
              paymentMethod: "BANK_TRANSFER",
              amountMinor: 50_000,
            },
          ],
          allocations: [{ type: "COMMON", amountMinor: 50_000 }],
        }),
        idempotencyKey,
      );

      expect(conflicting.status).toBe(409);
      expect(asErrorCode(conflicting)).toBe("FINANCE_IDEMPOTENCY_CONFLICT");
    });
  });

  describe("preview and create agree", () => {
    it("rejects an associate-pool treatment in the company book", async () => {
      const input = expenseInput({ treatment: "ASSOCIATE_POOL_EXPENSE" });

      const preview = await asAdmin(
        req().post(v1.finance.ROUTES.expenses.preview),
      ).send(input);
      const created = await postExpense(input);

      expect(preview.status).toBe(422);
      expect(asErrorCode(preview)).toBe("FINANCE_VALIDATION_FAILED");
      expect(created.status).toBe(422);
      expect(asErrorCode(created)).toBe("FINANCE_VALIDATION_FAILED");
    });

    it("previews without writing anything", async () => {
      const before = await prisma.financialOperation.count({
        where: { bookId },
      });

      const res = await asAdmin(
        req().post(v1.finance.ROUTES.expenses.preview),
      ).send(expenseInput());

      expect(res.status).toBe(200);
      expect(asPlan(res).postings).toHaveLength(2);
      expect(await prisma.financialOperation.count({ where: { bookId } })).toBe(
        before,
      );
    });

    it("posts exactly what the preview promised", async () => {
      const input = expenseInput({
        amountMinor: 100_000,
        payments: [
          {
            sourceType: "BOOK_ACCOUNT",
            sourceAccountId: accountId("BANK"),
            paymentMethod: "BANK_TRANSFER",
            amountMinor: 50_000,
          },
          {
            sourceType: "ASSOCIATE_PERSONAL_FUNDS",
            payerAssociateId: emilianoId,
            paymentMethod: "CARD",
            amountMinor: 30_000,
          },
          {
            sourceType: "ASSOCIATE_PERSONAL_FUNDS",
            payerAssociateId: iustiId,
            paymentMethod: "CASH",
            amountMinor: 20_000,
          },
        ],
        allocations: [{ type: "COMMON", amountMinor: 100_000 }],
      });

      const preview = await asAdmin(
        req().post(v1.finance.ROUTES.expenses.preview),
      ).send(input);
      const created = await postExpense(input);

      expect(created.status).toBe(201);

      const plan = asPlan(preview);
      const operation = asOperation(created);

      expect(operation.summary).toEqual(plan.summary);
      expect(
        operation.journalEntry?.postings.map((posting) => ({
          accountId: posting.accountId,
          signedAmountMinor: posting.signedAmountMinor,
        })),
      ).toEqual(
        plan.postings.map((posting) => ({
          accountId: posting.accountId,
          signedAmountMinor: posting.signedAmountMinor,
        })),
      );
    });
  });

  describe("Case A — company bank pays a common expense", () => {
    it("records the expense, the postings, and the balances", async () => {
      const bankBefore = (await balanceOf("BANK")).signedBalanceMinor;
      const expenseBefore = (await balanceOf("OPERATING_EXPENSE"))
        .signedBalanceMinor;

      const res = await postExpense(
        expenseInput({ description: "Case A", costObjectId }),
      );
      expect(res.status).toBe(201);

      const operation = asOperation(res);

      expect(operation.status).toBe("POSTED");
      expect(operation.postedAt).not.toBeNull();
      expect(operation.expense?.amountMinor).toBe(30_000);
      expect(operation.expense?.payments).toHaveLength(1);
      expect(operation.expense?.costObject?.id).toBe(costObjectId);
      expect(operation.allocations).toHaveLength(1);
      expect(operation.allocations[0].type).toBe("COMMON");
      expect(operation.allocations[0].associateId).toBeNull();

      const postings = operation.journalEntry?.postings ?? [];
      expect(postings).toHaveLength(2);
      expect(postings.reduce((sum, p) => sum + p.signedAmountMinor, 0)).toBe(0);

      expect(operation.summary.companyExpenseMinor).toBe(30_000);
      expect(operation.summary.companyCashImpactMinor).toBe(-30_000);
      expect(operation.summary.associatePayables).toEqual([]);
      expect(operation.summary.specificEconomicBenefits).toEqual([]);

      expect((await balanceOf("BANK")).signedBalanceMinor).toBe(
        bankBefore - 30_000,
      );
      expect((await balanceOf("OPERATING_EXPENSE")).signedBalanceMinor).toBe(
        expenseBefore + 30_000,
      );
    });
  });

  describe("Case B — Iusti pays personal funds and Iusti benefits", () => {
    it("owes Iusti the money and attributes the benefit to him", async () => {
      const payableBefore = (await balanceOf("PAYABLE_TO_ASSOCIATE", iustiId))
        .displayBalanceMinor;
      const cashBefore = (await balanceOf("BANK")).signedBalanceMinor;

      const res = await postExpense(
        expenseInput({
          description: "Case B",
          amountMinor: 20_000,
          treatment: "NON_OPERATIONAL_COMPANY_EXPENSE",
          payments: [
            {
              sourceType: "ASSOCIATE_PERSONAL_FUNDS",
              payerAssociateId: iustiId,
              paymentMethod: "CASH",
              amountMinor: 20_000,
            },
          ],
          allocations: [
            {
              type: "ASSOCIATE_SPECIFIC",
              associateId: iustiId,
              amountMinor: 20_000,
            },
          ],
        }),
      );

      expect(res.status).toBe(201);
      const operation = asOperation(res);

      expect(operation.summary.companyCashImpactMinor).toBe(0);
      expect(operation.summary.associatePayables).toEqual([
        { associateId: iustiId, amountMinor: 20_000 },
      ]);
      expect(operation.summary.specificEconomicBenefits).toEqual([
        { associateId: iustiId, amountMinor: 20_000 },
      ]);

      // No company money moved — only a debt was created.
      expect((await balanceOf("BANK")).signedBalanceMinor).toBe(cashBefore);

      const payable = await balanceOf("PAYABLE_TO_ASSOCIATE", iustiId);
      expect(payable.displayBalanceMinor).toBe(payableBefore + 20_000);
      expect(payable.signedBalanceMinor).toBe(-payable.displayBalanceMinor);
    });
  });

  describe("Case C — Iusti pays personal funds and Emiliano benefits", () => {
    it("keeps the reimbursement whole and the settlement separate", async () => {
      const iustiBefore = (await balanceOf("PAYABLE_TO_ASSOCIATE", iustiId))
        .displayBalanceMinor;
      const emilianoBefore = (
        await balanceOf("PAYABLE_TO_ASSOCIATE", emilianoId)
      ).displayBalanceMinor;

      const res = await postExpense(
        expenseInput({
          description: "Case C",
          amountMinor: 40_000,
          treatment: "NON_OPERATIONAL_COMPANY_EXPENSE",
          payments: [
            {
              sourceType: "ASSOCIATE_PERSONAL_FUNDS",
              payerAssociateId: iustiId,
              paymentMethod: "CARD",
              amountMinor: 40_000,
            },
          ],
          allocations: [
            {
              type: "ASSOCIATE_SPECIFIC",
              associateId: emilianoId,
              amountMinor: 40_000,
            },
          ],
        }),
      );

      expect(res.status).toBe(201);
      const operation = asOperation(res);

      // The full 40,000 is owed to Iusti — not 20,000. What Emiliano owes
      // Iusti privately is a separate obligation, settled separately.
      expect(operation.summary.associatePayables).toEqual([
        { associateId: iustiId, amountMinor: 40_000 },
      ]);
      expect(operation.summary.specificEconomicBenefits).toEqual([
        { associateId: emilianoId, amountMinor: 40_000 },
      ]);

      expect(
        (await balanceOf("PAYABLE_TO_ASSOCIATE", iustiId)).displayBalanceMinor,
      ).toBe(iustiBefore + 40_000);
      // The beneficiary is owed nothing — he did not pay.
      expect(
        (await balanceOf("PAYABLE_TO_ASSOCIATE", emilianoId))
          .displayBalanceMinor,
      ).toBe(emilianoBefore);
    });
  });

  describe("Case D — Iusti pays a common expense", () => {
    it("owes Iusti the full amount with no specific benefit", async () => {
      const payableBefore = (await balanceOf("PAYABLE_TO_ASSOCIATE", iustiId))
        .displayBalanceMinor;

      const res = await postExpense(
        expenseInput({
          description: "Case D",
          payments: [
            {
              sourceType: "ASSOCIATE_PERSONAL_FUNDS",
              payerAssociateId: iustiId,
              paymentMethod: "CASH",
              amountMinor: 30_000,
            },
          ],
        }),
      );

      expect(res.status).toBe(201);
      expect(asOperation(res).summary.specificEconomicBenefits).toEqual([]);
      expect(asOperation(res).summary.commonEconomicBenefitMinor).toBe(30_000);
      expect(
        (await balanceOf("PAYABLE_TO_ASSOCIATE", iustiId)).displayBalanceMinor,
      ).toBe(payableBefore + 30_000);
    });
  });

  describe("Case E — company pays an Emiliano-specific expense", () => {
    it("creates a specific benefit without owing anyone", async () => {
      const payableBefore = (
        await balanceOf("PAYABLE_TO_ASSOCIATE", emilianoId)
      ).displayBalanceMinor;
      const bankBefore = (await balanceOf("BANK")).signedBalanceMinor;

      const res = await postExpense(
        expenseInput({
          description: "Case E",
          amountMinor: 40_000,
          payments: [
            {
              sourceType: "BOOK_ACCOUNT",
              sourceAccountId: accountId("BANK"),
              paymentMethod: "CARD",
              amountMinor: 40_000,
            },
          ],
          allocations: [
            {
              type: "ASSOCIATE_SPECIFIC",
              associateId: emilianoId,
              amountMinor: 40_000,
            },
          ],
        }),
      );

      expect(res.status).toBe(201);
      expect(asOperation(res).summary.associatePayables).toEqual([]);
      expect(asOperation(res).summary.companyCashImpactMinor).toBe(-40_000);
      expect((await balanceOf("BANK")).signedBalanceMinor).toBe(
        bankBefore - 40_000,
      );
      expect(
        (await balanceOf("PAYABLE_TO_ASSOCIATE", emilianoId))
          .displayBalanceMinor,
      ).toBe(payableBefore);
    });
  });

  describe("capital assets", () => {
    it("capitalizes rather than expensing, and stays out of profit", async () => {
      const assetBefore = (await balanceOf("FIXED_ASSET")).signedBalanceMinor;

      const res = await postExpense(
        expenseInput({
          description: "Van purchase",
          treatment: "CAPITAL_ASSET",
        }),
      );

      expect(res.status).toBe(201);
      expect(asOperation(res).summary.companyAssetIncreaseMinor).toBe(30_000);
      expect(asOperation(res).summary.companyExpenseMinor).toBe(0);
      expect((await balanceOf("FIXED_ASSET")).signedBalanceMinor).toBe(
        assetBefore + 30_000,
      );
    });
  });

  describe("cash held by an associate is company money", () => {
    it("spends it as company cash and creates no debt", async () => {
      const custodyBefore = (
        await balanceOf("COMPANY_CASH_CUSTODY", emilianoId)
      ).signedBalanceMinor;
      const payableBefore = (
        await balanceOf("PAYABLE_TO_ASSOCIATE", emilianoId)
      ).displayBalanceMinor;

      const res = await postExpense(
        expenseInput({
          description: "Paid from company cash Emiliano holds",
          payments: [
            {
              sourceType: "BOOK_ACCOUNT",
              sourceAccountId: accountId("COMPANY_CASH_CUSTODY", emilianoId),
              paymentMethod: "CASH",
              amountMinor: 30_000,
            },
          ],
        }),
      );

      expect(res.status).toBe(201);
      expect(asOperation(res).summary.companyCashImpactMinor).toBe(-30_000);
      expect(asOperation(res).summary.associatePayables).toEqual([]);
      expect(
        (await balanceOf("COMPANY_CASH_CUSTODY", emilianoId))
          .signedBalanceMinor,
      ).toBe(custodyBefore - 30_000);
      expect(
        (await balanceOf("PAYABLE_TO_ASSOCIATE", emilianoId))
          .displayBalanceMinor,
      ).toBe(payableBefore);
    });
  });

  describe("associate funding", () => {
    it("records a loan as company cash and a debt to the provider", async () => {
      const bankBefore = await balanceOf("BANK");
      const loanBefore = await balanceOf("ASSOCIATE_LOAN_PAYABLE", emilianoId);
      const input = fundingInput({ reference: "BANK-REF-100" });

      const preview = await asAdmin(
        req().post(v1.finance.ROUTES.funding.preview),
      ).send(input);
      const created = await postFunding(input);

      expect(preview.status).toBe(200);
      expect(created.status).toBe(201);
      const operation = asOperation(created);
      expect(operation.kind).toBe("ASSOCIATE_FUNDING");
      expect(operation.associateFunding).toMatchObject({
        type: "LOAN",
        associateId: emilianoId,
        amountMinor: 50_000,
        reference: "BANK-REF-100",
      });
      expect(operation.summary).toEqual(
        v1.finance.postingPlanSchema.parse(preview.body).summary,
      );

      const bankAfter = await balanceOf("BANK");
      const loanAfter = await balanceOf("ASSOCIATE_LOAN_PAYABLE", emilianoId);
      expect(bankAfter.signedBalanceMinor - bankBefore.signedBalanceMinor).toBe(
        50_000,
      );
      expect(
        loanAfter.displayBalanceMinor - loanBefore.displayBalanceMinor,
      ).toBe(50_000);
    });

    it("records a capital contribution as equity with no repayment debt", async () => {
      const equityBefore = await balanceOf("CONTRIBUTED_CAPITAL");
      const loanBefore = await balanceOf("ASSOCIATE_LOAN_PAYABLE", emilianoId);
      const created = await postFunding(
        fundingInput({
          amountMinor: 75_000,
          type: "CAPITAL_CONTRIBUTION",
          notes: "Permanent owner contribution",
        }),
      );

      expect(created.status).toBe(201);
      const operation = asOperation(created);
      expect(operation.summary.companyEquityIncreaseMinor).toBe(75_000);
      expect(operation.summary.associatePayables).toEqual([]);

      const equityAfter = await balanceOf("CONTRIBUTED_CAPITAL");
      const loanAfter = await balanceOf("ASSOCIATE_LOAN_PAYABLE", emilianoId);
      expect(
        equityAfter.displayBalanceMinor - equityBefore.displayBalanceMinor,
      ).toBe(75_000);
      expect(loanAfter.displayBalanceMinor).toBe(
        loanBefore.displayBalanceMinor,
      );
    });
  });

  describe("validation", () => {
    it("rejects payments that do not add up", async () => {
      const res = await postExpense(
        expenseInput({
          amountMinor: 30_000,
          payments: [
            {
              sourceType: "BOOK_ACCOUNT",
              sourceAccountId: accountId("BANK"),
              paymentMethod: "CARD",
              amountMinor: 20_000,
            },
          ],
        }),
      );

      expect(res.status).toBe(400);
    });

    it("rejects a category from another book", async () => {
      const foreignCategory = await prisma.expenseCategory.findFirst({
        where: { book: { type: "ASSOCIATE_POOL" } },
        select: { id: true },
      });

      const res = await postExpense(
        expenseInput({ categoryId: foreignCategory?.id ?? "missing" }),
      );

      expect(res.status).toBe(404);
      expect(asErrorCode(res)).toBe("FINANCE_NOT_FOUND");
    });

    it("rejects paying an expense out of a revenue account", async () => {
      const res = await postExpense(
        expenseInput({
          payments: [
            {
              sourceType: "BOOK_ACCOUNT",
              sourceAccountId: accountId("RENTAL_REVENUE"),
              paymentMethod: "OTHER",
              amountMinor: 30_000,
            },
          ],
        }),
      );

      expect(res.status).toBe(422);
      expect(asErrorCode(res)).toBe("FINANCE_VALIDATION_FAILED");
    });

    it("rejects an unknown source account", async () => {
      const res = await postExpense(
        expenseInput({
          payments: [
            {
              sourceType: "BOOK_ACCOUNT",
              sourceAccountId: "does-not-exist",
              paymentMethod: "CARD",
              amountMinor: 30_000,
            },
          ],
        }),
      );

      expect(res.status).toBe(404);
    });
  });

  describe("atomicity", () => {
    it("leaves nothing behind when an expense is rejected", async () => {
      const before = await Promise.all([
        prisma.financialOperation.count({ where: { bookId } }),
        prisma.expense.count({ where: { operation: { bookId } } }),
        prisma.journalEntry.count({ where: { operation: { bookId } } }),
      ]);

      const res = await postExpense(
        expenseInput({
          payments: [
            {
              sourceType: "BOOK_ACCOUNT",
              sourceAccountId: accountId("RENTAL_REVENUE"),
              paymentMethod: "OTHER",
              amountMinor: 30_000,
            },
          ],
        }),
      );
      expect(res.status).toBe(422);

      const after = await Promise.all([
        prisma.financialOperation.count({ where: { bookId } }),
        prisma.expense.count({ where: { operation: { bookId } } }),
        prisma.journalEntry.count({ where: { operation: { bookId } } }),
      ]);

      expect(after).toEqual(before);
    });

    it("never leaves an operation stuck in DRAFT", async () => {
      await postExpense(expenseInput());

      expect(
        await prisma.financialOperation.count({
          where: { bookId, status: "DRAFT" },
        }),
      ).toBe(0);
    });
  });

  describe("immutability", () => {
    it("refuses to rewrite a posted journal posting", async () => {
      const res = await postExpense(expenseInput({ description: "Immutable" }));
      const postingId = asOperation(res).journalEntry!.postings[0].id;

      await expect(
        prisma.journalPosting.update({
          where: { id: postingId },
          data: { signedAmountMinor: 1 },
        }),
      ).rejects.toThrow(/immutable/i);
    });

    it("refuses to rewrite a posted journal entry", async () => {
      const res = await postExpense(expenseInput({ description: "Entry" }));
      const entryId = asOperation(res).journalEntry!.id;

      await expect(
        prisma.journalEntry.update({
          where: { id: entryId },
          data: { postedAt: new Date() },
        }),
      ).rejects.toThrow(/immutable/i);
    });
  });

  describe("database constraints", () => {
    it("refuses a payment that names both an account and a payer", async () => {
      const expense = await prisma.expense.findFirstOrThrow({
        where: { operationId: { in: createdOperationIds } },
        select: { id: true },
      });

      await expect(
        prisma.expensePayment.create({
          data: {
            expenseId: expense.id,
            sourceType: "BOOK_ACCOUNT",
            amountMinor: 100,
            paymentMethod: "CARD",
            sourceAccountId: accountId("BANK"),
            payerAssociateId: iustiId,
          },
        }),
      ).rejects.toThrow(/ExpensePayment_valid_source/);
    });

    it("refuses a common allocation that names a beneficiary", async () => {
      await expect(
        prisma.economicAllocation.create({
          data: {
            operationId: createdOperationIds[0],
            type: "COMMON",
            amountMinor: 100,
            associateId: iustiId,
          },
        }),
      ).rejects.toThrow(/EconomicAllocation_valid_associate/);
    });

    it("refuses a non-positive amount", async () => {
      await expect(
        prisma.economicAllocation.create({
          data: {
            operationId: createdOperationIds[0],
            type: "COMMON",
            amountMinor: 0,
          },
        }),
      ).rejects.toThrow(/amount_positive/);
    });

    it("refuses an account whose role and category disagree", async () => {
      await expect(
        prisma.ledgerAccount.create({
          data: {
            bookId,
            code: `BROKEN_${Date.now()}`,
            name: "Wrong category",
            category: "REVENUE",
            role: "BANK",
          },
        }),
      ).rejects.toThrow(/LedgerAccount_role_category_valid/);
    });

    it("refuses an associate-scoped role with no associate", async () => {
      await expect(
        prisma.ledgerAccount.create({
          data: {
            bookId,
            code: `ORPHAN_${Date.now()}`,
            name: "Payable to nobody",
            category: "LIABILITY",
            role: "PAYABLE_TO_ASSOCIATE",
          },
        }),
      ).rejects.toThrow(/LedgerAccount_associate_scope_valid/);
    });

    it("refuses an ownership share above one whole book", async () => {
      await expect(
        prisma.financeBookMember.create({
          data: { bookId, associateId: iustiId, shareBasisPoints: 10_001 },
        }),
      ).rejects.toThrow(/share_range/);
    });
  });

  describe("reversal", () => {
    it("posts the exact inverse and marks the original reversed", async () => {
      const created = await postExpense(
        expenseInput({
          description: "To be reversed",
          amountMinor: 25_000,
          payments: [
            {
              sourceType: "ASSOCIATE_PERSONAL_FUNDS",
              payerAssociateId: iustiId,
              paymentMethod: "CASH",
              amountMinor: 25_000,
            },
          ],
          allocations: [{ type: "COMMON", amountMinor: 25_000 }],
        }),
      );
      const original = asOperation(created);
      const payableAfterExpense = (
        await balanceOf("PAYABLE_TO_ASSOCIATE", iustiId)
      ).displayBalanceMinor;

      const res = await reverse(original.id, { reason: "Entered twice" });
      expect(res.status).toBe(201);

      const reversal = asOperation(res);

      expect(reversal.kind).toBe("REVERSAL");
      expect(reversal.status).toBe("POSTED");
      expect(reversal.reversalOfOperationId).toBe(original.id);
      expect(reversal.description).toContain("Entered twice");

      const originalPostings = original.journalEntry?.postings ?? [];
      const reversalPostings = reversal.journalEntry?.postings ?? [];
      expect(reversalPostings).toHaveLength(originalPostings.length);

      for (const posting of originalPostings) {
        const inverse = reversalPostings.find(
          (candidate) => candidate.accountId === posting.accountId,
        );
        expect(inverse?.signedAmountMinor).toBe(-posting.signedAmountMinor);
      }

      // The debt is gone, and the original entry is left exactly as it was.
      expect(
        (await balanceOf("PAYABLE_TO_ASSOCIATE", iustiId)).displayBalanceMinor,
      ).toBe(payableAfterExpense - 25_000);

      const reloaded = await asAdmin(
        req().get(v1.finance.ROUTES.operations.get(original.id)),
      );
      const afterReversal = asOperation(reloaded);
      expect(afterReversal.status).toBe("REVERSED");
      expect(afterReversal.reversedByOperationId).toBe(reversal.id);
      expect(afterReversal.journalEntry?.postings).toHaveLength(
        originalPostings.length,
      );
      expect(afterReversal.expense?.amountMinor).toBe(25_000);
    });

    it("refuses to reverse the same operation twice", async () => {
      const created = await postExpense(
        expenseInput({ description: "Reversed once" }),
      );

      const createdId = asOperation(created).id;
      expect((await reverse(createdId)).status).toBe(201);

      const second = await reverse(createdId);
      expect(second.status).toBe(409);
      expect(asErrorCode(second)).toBe("FINANCE_INVALID_STATE");
    });

    it("replays a reversal key instead of reversing twice", async () => {
      const created = await postExpense(
        expenseInput({ description: "Replayed reversal" }),
      );
      const idempotencyKey = key();

      const createdId = asOperation(created).id;
      const first = await reverse(createdId, {}, idempotencyKey);
      const second = await reverse(createdId, {}, idempotencyKey);

      expect(second.status).toBe(201);
      expect(asOperation(second).id).toBe(asOperation(first).id);
    });

    it("returns 404 for an operation that does not exist", async () => {
      const res = await reverse("no-such-operation");
      expect(res.status).toBe(404);
    });
  });

  describe("settlement preview", () => {
    it("balances specific benefits between the associates", async () => {
      const period = nextPeriod();

      await postExpense(
        expenseInput({
          description: "Settlement — Emiliano benefits",
          occurredAt: period.occurredAt(1),
          amountMinor: 40_000,
          allocations: [
            {
              type: "ASSOCIATE_SPECIFIC",
              associateId: emilianoId,
              amountMinor: 40_000,
            },
          ],
        }),
      );

      // Common benefit is already borne in proportion to ownership, so it
      // must not move the numbers.
      await postExpense(
        expenseInput({
          description: "Settlement — common",
          occurredAt: period.occurredAt(2),
        }),
      );

      // Capital assets are excluded from settlement in v1.
      await postExpense(
        expenseInput({
          description: "Settlement — capitalized",
          occurredAt: period.occurredAt(3),
          treatment: "CAPITAL_ASSET",
          allocations: [
            {
              type: "ASSOCIATE_SPECIFIC",
              associateId: emilianoId,
              amountMinor: 30_000,
            },
          ],
        }),
      );

      const res = await previewSettlement(period);
      expect(res.status).toBe(200);

      const preview = asSettlement(res);
      expect(preview.totalAmountMinor).toBe(40_000);

      expect(
        preview.lines.find((line) => line.associateId === emilianoId),
      ).toMatchObject({
        actualAmountMinor: 40_000,
        expectedAmountMinor: 20_000,
        adjustmentMinor: -20_000,
      });
      expect(
        preview.lines.find((line) => line.associateId === iustiId),
      ).toMatchObject({
        actualAmountMinor: 0,
        expectedAmountMinor: 20_000,
        adjustmentMinor: 20_000,
      });

      expect(preview.transfers).toHaveLength(1);
      expect(preview.transfers[0]).toMatchObject({
        fromAssociateId: emilianoId,
        toAssociateId: iustiId,
        amountMinor: 20_000,
      });
      // The transfer carries names, so the UI can render it without a lookup.
      expect(preview.transfers[0].fromAssociate?.id).toBe(emilianoId);
      expect(preview.transfers[0].toAssociate?.id).toBe(iustiId);

      expect(
        preview.lines.reduce((sum, line) => sum + line.adjustmentMinor, 0),
      ).toBe(0);
    });

    it("drops a reversed expense out of the settlement", async () => {
      const period = nextPeriod();

      const created = await postExpense(
        expenseInput({
          description: "Settlement — reversed",
          occurredAt: period.occurredAt(1),
          amountMinor: 60_000,
          allocations: [
            {
              type: "ASSOCIATE_SPECIFIC",
              associateId: iustiId,
              amountMinor: 60_000,
            },
          ],
        }),
      );

      expect(
        asSettlement(await previewSettlement(period)).totalAmountMinor,
      ).toBe(60_000);

      await reverse(asOperation(created).id);

      const after = asSettlement(await previewSettlement(period));
      expect(after.totalAmountMinor).toBe(0);
      expect(after.transfers).toEqual([]);
    });

    it("returns an empty settlement for a quiet period", async () => {
      const res = await previewSettlement(nextPeriod());

      expect(res.status).toBe(200);

      const preview = asSettlement(res);
      expect(preview.totalAmountMinor).toBe(0);
      expect(preview.transfers).toEqual([]);
      expect(preview.lines).toHaveLength(2);
    });

    it("refuses pool-cash settlement, which is not implemented yet", async () => {
      const period = nextPeriod();
      const res = await asAdmin(
        req().post(v1.finance.ROUTES.settlements.preview),
      ).send({
        bookId,
        kind: "ASSOCIATE_POOL_CASH",
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      });

      expect(res.status).toBe(422);
    });
  });

  describe("reads", () => {
    it("lists the books with their ownership shares", async () => {
      const res = await asAdmin(req().get(v1.finance.ROUTES.books));

      expect(res.status).toBe(200);
      const book = asBookList(res).items.find(
        (candidate) => candidate.id === bookId,
      );
      expect(book?.members).toHaveLength(2);
      expect(
        book?.members.reduce((sum, member) => sum + member.shareBasisPoints, 0),
      ).toBe(10_000);
    });

    it("filters operations by book and kind", async () => {
      const res = await asAdmin(
        req().get(
          `${v1.finance.ROUTES.operations.list}?bookId=${bookId}&kind=EXPENSE&pageSize=100`,
        ),
      );

      expect(res.status).toBe(200);

      const list = asOperationList(res);
      expect(list.items.length).toBeGreaterThan(0);
      expect(
        list.items.every(
          (item) => item.kind === "EXPENSE" && item.bookId === bookId,
        ),
      ).toBe(true);
    });

    it("returns 404 for an operation that does not exist", async () => {
      const res = await asAdmin(
        req().get(v1.finance.ROUTES.operations.get("no-such-operation")),
      );

      expect(res.status).toBe(404);
    });

    it("reports a zero balance for an account with no postings", async () => {
      const balance = await balanceOf("SCOOTER_SALE_REVENUE");

      expect(balance.signedBalanceMinor).toBe(0);
      expect(balance.postingCount).toBe(0);
    });
  });
});

/**
 * Reads a response body through its published schema.
 *
 * Two jobs at once: it gives the test typed access instead of `any`, and it
 * fails loudly if the API ever returns a shape the shared contract does not
 * describe — which is exactly the drift generated clients would hit.
 */
function asOperation(res: request.Response): v1.finance.FinancialOperation {
  return v1.finance.financialOperationSchema.parse(res.body);
}

function asPlan(res: request.Response): v1.finance.PostingPlan {
  return v1.finance.postingPlanSchema.parse(res.body);
}

function asOperationList(
  res: request.Response,
): v1.finance.FinancialOperationList {
  return v1.finance.financialOperationListSchema.parse(res.body);
}

function asBookList(res: request.Response): v1.finance.FinanceBookList {
  return v1.finance.financeBookListSchema.parse(res.body);
}

function asSettlement(res: request.Response): v1.finance.SettlementPreview {
  return v1.finance.settlementPreviewSchema.parse(res.body);
}

/** The API's normalized error envelope. */
/** Just enough of a created operation to record it for cleanup. */
const createdOperationSchema = z.object({ id: z.string().min(1) });

const errorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

function asErrorCode(res: request.Response): string {
  return errorEnvelopeSchema.parse(res.body).error.code;
}
