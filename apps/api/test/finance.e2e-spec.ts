/**
 * HTTP-level coverage for the financial tracking module.
 *
 * These tests exercise the posted transaction ledger and its rebuildable
 * wallet-balance cache against PostgreSQL. They intentionally cover the
 * business distinctions that are easiest to accidentally blur:
 *
 * - payment method versus money location;
 * - billed business cash held by an admin versus unbilled personal cash;
 * - refundable customer guarantees;
 * - automatic claims between active admins;
 * - idempotent posting and immutable reversal.
 */
import { INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { v1 } from "@repo/api-shared";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { CoreAuthService } from "../src/auth/modules/core-auth/core-auth.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { UsersService } from "../src/users/users.service";

interface TestSession {
  accessToken: string;
  userId: string;
}

describe("Finance HTTP surface (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersService;
  let coreAuth: CoreAuthService;

  let admin: TestSession;
  let secondAdmin: TestSession;
  let customer: TestSession;
  let adminWallet: v1.finance.Wallet;
  let secondAdminWallet: v1.finance.Wallet;
  let customerWallet: v1.finance.Wallet;
  let companyCashWallet: v1.finance.Wallet;
  let companyBankWallet: v1.finance.Wallet;
  let rentalIncomeCategory: v1.finance.FinancialCategory;
  let operatingExpenseCategory: v1.finance.FinancialCategory;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdUserIds: string[] = [];
  const createdWalletIds: string[] = [];
  const createdCategoryIds: string[] = [];

  const server = () => app.getHttpServer() as Server;

  type RequestBuilder = ReturnType<ReturnType<typeof request>["get"]>;
  const req = (): {
    get: (path: string) => RequestBuilder;
    post: (path: string) => RequestBuilder;
  } => {
    const base = request(server());
    const tag = (builder: RequestBuilder) =>
      builder.set("x-requested-with", "fetch");
    return {
      get: (path) => tag(base.get(path)),
      post: (path) => tag(base.post(path)),
    };
  };

  const authenticate = (builder: RequestBuilder, session: TestSession) =>
    builder.set("Cookie", [`access_token=${session.accessToken}`]);

  async function freshSession(roles: string[]): Promise<TestSession> {
    const user = await users.createOne({
      email: `finance-${runId}-${createdUserIds.length}@example.com`,
      roles,
    });
    createdUserIds.push(user.id);
    const issued = await coreAuth.issueSession({ user });
    return { accessToken: issued.accessToken, userId: user.id };
  }

  async function getWallet(
    walletId: string,
    session = admin,
  ): Promise<v1.finance.Wallet> {
    const response = await authenticate(
      req().get(v1.finance.ROUTES.wallets.get(walletId)),
      session,
    );
    expect(response.status).toBe(200);
    return response.body as v1.finance.Wallet;
  }

  function balance(
    wallet: v1.finance.Wallet,
    bucket: v1.finance.WalletBalanceBucket,
  ): string {
    return (
      wallet.balances.find(
        (item) => item.bucket === bucket && item.currency === "RON",
      )?.balance ?? "0.00"
    );
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

    admin = await freshSession(["ADMIN"]);
    secondAdmin = await freshSession(["ADMIN"]);
    customer = await freshSession(["USER"]);

    adminWallet = await getWalletForUser(admin);
    secondAdminWallet = await getWalletForUser(secondAdmin);
    customerWallet = await getWalletForUser(customer);
    createdWalletIds.push(
      adminWallet.id,
      secondAdminWallet.id,
      customerWallet.id,
    );
  });

  afterAll(async () => {
    if (prisma && createdUserIds.length > 0) {
      const transactionRows = await prisma.moneyTransaction.findMany({
        where: {
          OR: [
            { recordedByUserId: { in: createdUserIds } },
            { counterpartyUserId: { in: createdUserIds } },
            { recipientUserId: { in: createdUserIds } },
            { debtorUserId: { in: createdUserIds } },
            { creditorUserId: { in: createdUserIds } },
          ],
        },
        select: { id: true },
      });
      const transactionIds = transactionRows.map((row) => row.id);

      if (transactionIds.length > 0) {
        await prisma.moneyTransactionReference.deleteMany({
          where: { moneyTransactionId: { in: transactionIds } },
        });
        await prisma.walletBalanceChange.deleteMany({
          where: { moneyTransactionId: { in: transactionIds } },
        });
        await prisma.moneyTransaction.deleteMany({
          where: {
            id: { in: transactionIds },
            OR: [
              { originTransactionId: { not: null } },
              { reversalOfTransactionId: { not: null } },
            ],
          },
        });
        await prisma.moneyTransaction.deleteMany({
          where: { id: { in: transactionIds } },
        });
      }
    }

    if (prisma && createdCategoryIds.length > 0) {
      await prisma.financialCategory.deleteMany({
        where: { id: { in: createdCategoryIds } },
      });
    }
    if (prisma && createdWalletIds.length > 0) {
      await prisma.walletBalance.deleteMany({
        where: { walletId: { in: createdWalletIds } },
      });
      await prisma.wallet.deleteMany({
        where: { id: { in: createdWalletIds } },
      });
    }
    if (prisma && createdUserIds.length > 0) {
      await prisma.auditEvent.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app?.close();
  });

  async function getWalletForUser(
    session: TestSession,
  ): Promise<v1.finance.Wallet> {
    const response = await authenticate(
      req().get(v1.finance.ROUTES.wallets.mine),
      session,
    );
    expect(response.status).toBe(200);
    return response.body as v1.finance.Wallet;
  }

  it("creates exactly one wallet for every user and limits normal users to their own wallet", async () => {
    expect(adminWallet.ownerUserId).toBe(admin.userId);
    expect(secondAdminWallet.ownerUserId).toBe(secondAdmin.userId);
    expect(customerWallet.ownerUserId).toBe(customer.userId);
    expect(balance(customerWallet, "USER_SETTLEMENT")).toBe("0.00");

    const forbidden = await authenticate(
      req().get(v1.finance.ROUTES.wallets.list),
      customer,
    );
    expect(forbidden.status).toBe(403);
  });

  it("allows admins to create company money locations and reporting categories", async () => {
    const cashResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.wallets.create)
        .send({ type: "COMPANY_CASH", name: `Cash desk ${runId}` }),
      admin,
    );
    expect(cashResponse.status).toBe(201);
    companyCashWallet = cashResponse.body as v1.finance.Wallet;
    createdWalletIds.push(companyCashWallet.id);

    const bankResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.wallets.create)
        .send({ type: "COMPANY_BANK", name: `Bank account ${runId}` }),
      admin,
    );
    expect(bankResponse.status).toBe(201);
    companyBankWallet = bankResponse.body as v1.finance.Wallet;
    createdWalletIds.push(companyBankWallet.id);

    const incomeResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.categories.create)
        .send({
          code: `RENTAL_${runId.replaceAll("-", "_").toUpperCase()}`,
          name: "Rental income",
          kind: "INCOME",
        }),
      admin,
    );
    expect(incomeResponse.status).toBe(201);
    rentalIncomeCategory = incomeResponse.body as v1.finance.FinancialCategory;
    createdCategoryIds.push(rentalIncomeCategory.id);

    const expenseResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.categories.create)
        .send({
          code: `OPERATING_${runId.replaceAll("-", "_").toUpperCase()}`,
          name: "Operating expense",
          kind: "EXPENSE",
        }),
      admin,
    );
    expect(expenseResponse.status).toBe(201);
    operatingExpenseCategory =
      expenseResponse.body as v1.finance.FinancialCategory;
    createdCategoryIds.push(operatingExpenseCategory.id);
  });

  it("tracks billed business cash in the collecting admin wallet until it reaches the cash desk", async () => {
    const idempotencyKey = `finance:${runId}:billed-rental`;
    const draftResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.create)
        .send({
          type: "INCOME",
          amount: "120.00",
          currency: "RON",
          financialScope: "COMPANY",
          paymentMethod: "CASH",
          billingStatus: "BILLED",
          categoryId: rentalIncomeCategory.id,
          counterpartyUserId: customer.userId,
          idempotencyKey,
          postImmediately: false,
          balanceChanges: [
            {
              walletId: adminWallet.id,
              bucket: "BUSINESS_FUNDS",
              currency: "RON",
              amountDelta: "120.00",
            },
          ],
          references: [
            {
              referenceType: "RENTAL",
              referenceId: `rental-${runId}`,
              isPrimary: true,
            },
          ],
        }),
      admin,
    );
    expect(draftResponse.status).toBe(201);
    const draft = draftResponse.body as v1.finance.MoneyTransaction;
    expect(draft.status).toBe("DRAFT");
    expect(balance(await getWallet(adminWallet.id), "BUSINESS_FUNDS")).toBe(
      "0.00",
    );

    const postedResponse = await authenticate(
      req().post(v1.finance.ROUTES.transactions.post(draft.id)),
      admin,
    );
    expect(postedResponse.status).toBe(201);
    expect((postedResponse.body as v1.finance.MoneyTransaction).status).toBe(
      "POSTED",
    );
    expect(balance(await getWallet(adminWallet.id), "BUSINESS_FUNDS")).toBe(
      "120.00",
    );

    const duplicateResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.create)
        .send({
          type: "INCOME",
          amount: "120.00",
          currency: "RON",
          financialScope: "COMPANY",
          paymentMethod: "CASH",
          billingStatus: "BILLED",
          categoryId: rentalIncomeCategory.id,
          counterpartyUserId: customer.userId,
          idempotencyKey,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: adminWallet.id,
              bucket: "BUSINESS_FUNDS",
              currency: "RON",
              amountDelta: "120.00",
            },
          ],
          references: [],
        }),
      admin,
    );
    expect(duplicateResponse.status).toBe(201);
    expect((duplicateResponse.body as v1.finance.MoneyTransaction).id).toBe(
      draft.id,
    );
    expect(balance(await getWallet(adminWallet.id), "BUSINESS_FUNDS")).toBe(
      "120.00",
    );

    const transferResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.create)
        .send({
          type: "TRANSFER",
          amount: "120.00",
          currency: "RON",
          financialScope: "COMPANY",
          billingStatus: "NOT_APPLICABLE",
          idempotencyKey: `finance:${runId}:cash-deposit`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: adminWallet.id,
              bucket: "BUSINESS_FUNDS",
              currency: "RON",
              amountDelta: "-120.00",
            },
            {
              walletId: companyCashWallet.id,
              bucket: "BUSINESS_FUNDS",
              currency: "RON",
              amountDelta: "120.00",
            },
          ],
          references: [],
        }),
      admin,
    );
    expect(transferResponse.status).toBe(201);
    expect(balance(await getWallet(adminWallet.id), "BUSINESS_FUNDS")).toBe(
      "0.00",
    );
    expect(
      balance(await getWallet(companyCashWallet.id), "BUSINESS_FUNDS"),
    ).toBe("120.00");
  });

  it("tracks business bank expenses and restores balances with a reversal transaction", async () => {
    const incomeResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.create)
        .send({
          type: "INCOME",
          amount: "500.00",
          currency: "RON",
          financialScope: "COMPANY",
          paymentMethod: "BANK_TRANSFER",
          billingStatus: "BILLED",
          categoryId: rentalIncomeCategory.id,
          idempotencyKey: `finance:${runId}:bank-income`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: companyBankWallet.id,
              bucket: "BUSINESS_FUNDS",
              currency: "RON",
              amountDelta: "500.00",
            },
          ],
          references: [],
        }),
      admin,
    );
    expect(incomeResponse.status).toBe(201);

    const expenseResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.create)
        .send({
          type: "EXPENSE",
          amount: "80.00",
          currency: "RON",
          financialScope: "COMPANY",
          paymentMethod: "BANK_TRANSFER",
          billingStatus: "BILLED",
          categoryId: operatingExpenseCategory.id,
          idempotencyKey: `finance:${runId}:bank-expense`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: companyBankWallet.id,
              bucket: "BUSINESS_FUNDS",
              currency: "RON",
              amountDelta: "-80.00",
            },
          ],
          references: [
            {
              referenceType: "BUSINESS_EXPENSE",
              referenceId: `accounting-${runId}`,
              isPrimary: true,
            },
          ],
        }),
      admin,
    );
    expect(expenseResponse.status).toBe(201);
    const expense = expenseResponse.body as v1.finance.MoneyTransaction;
    expect(
      balance(await getWallet(companyBankWallet.id), "BUSINESS_FUNDS"),
    ).toBe("420.00");

    const reverseResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.reverse(expense.id))
        .send({
          idempotencyKey: `finance:${runId}:reverse-bank-expense`,
          description: "Expense entered twice",
        }),
      admin,
    );
    expect(reverseResponse.status).toBe(201);
    const reversal = reverseResponse.body as v1.finance.MoneyTransaction;
    expect(reversal.type).toBe("REVERSAL");
    expect(reversal.reversalOfTransactionId).toBe(expense.id);
    expect(
      balance(await getWallet(companyBankWallet.id), "BUSINESS_FUNDS"),
    ).toBe("500.00");

    const originalResponse = await authenticate(
      req().get(v1.finance.ROUTES.transactions.get(expense.id)),
      admin,
    );
    expect(originalResponse.status).toBe(200);
    expect((originalResponse.body as v1.finance.MoneyTransaction).status).toBe(
      "REVERSED",
    );
  });

  it("tracks customer guarantees as held cash and an amount owed back to the customer", async () => {
    const receivedResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.create)
        .send({
          type: "GUARANTEE_RECEIVED",
          amount: "300.00",
          currency: "RON",
          financialScope: "CUSTOMER_HELD",
          paymentMethod: "CASH",
          billingStatus: "NOT_APPLICABLE",
          counterpartyUserId: customer.userId,
          idempotencyKey: `finance:${runId}:guarantee-received`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: companyCashWallet.id,
              bucket: "CUSTOMER_GUARANTEE_FUNDS",
              currency: "RON",
              amountDelta: "300.00",
            },
            {
              walletId: customerWallet.id,
              bucket: "USER_SETTLEMENT",
              currency: "RON",
              amountDelta: "300.00",
            },
          ],
          references: [
            {
              referenceType: "RENTAL",
              referenceId: `guarantee-rental-${runId}`,
              isPrimary: true,
            },
          ],
        }),
      admin,
    );
    expect(receivedResponse.status).toBe(201);
    expect(
      balance(
        await getWallet(companyCashWallet.id),
        "CUSTOMER_GUARANTEE_FUNDS",
      ),
    ).toBe("300.00");
    expect(balance(await getWalletForUser(customer), "USER_SETTLEMENT")).toBe(
      "300.00",
    );

    const refundedResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.create)
        .send({
          type: "GUARANTEE_REFUNDED",
          amount: "300.00",
          currency: "RON",
          financialScope: "CUSTOMER_HELD",
          paymentMethod: "CASH",
          billingStatus: "NOT_APPLICABLE",
          counterpartyUserId: customer.userId,
          idempotencyKey: `finance:${runId}:guarantee-refunded`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: companyCashWallet.id,
              bucket: "CUSTOMER_GUARANTEE_FUNDS",
              currency: "RON",
              amountDelta: "-300.00",
            },
            {
              walletId: customerWallet.id,
              bucket: "USER_SETTLEMENT",
              currency: "RON",
              amountDelta: "-300.00",
            },
          ],
          references: [],
        }),
      admin,
    );
    expect(refundedResponse.status).toBe(201);
    expect(
      balance(
        await getWallet(companyCashWallet.id),
        "CUSTOMER_GUARANTEE_FUNDS",
      ),
    ).toBe("0.00");
    expect(balance(await getWalletForUser(customer), "USER_SETTLEMENT")).toBe(
      "0.00",
    );
  });

  it("rejects generic transaction payloads that contradict their declared type", async () => {
    const malformedTransactions = [
      {
        name: "positive expense",
        input: {
          type: "EXPENSE",
          amount: "10.00",
          currency: "RON",
          financialScope: "COMPANY",
          paymentMethod: "CASH",
          billingStatus: "BILLED",
          categoryId: operatingExpenseCategory.id,
          idempotencyKey: `finance:${runId}:invalid-positive-expense`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: companyCashWallet.id,
              bucket: "BUSINESS_FUNDS",
              currency: "RON",
              amountDelta: "10.00",
            },
          ],
          references: [],
        },
      },
      {
        name: "guarantee recorded as business funds",
        input: {
          type: "GUARANTEE_RECEIVED",
          amount: "10.00",
          currency: "RON",
          financialScope: "CUSTOMER_HELD",
          paymentMethod: "CASH",
          billingStatus: "NOT_APPLICABLE",
          counterpartyUserId: customer.userId,
          idempotencyKey: `finance:${runId}:invalid-guarantee-bucket`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: companyCashWallet.id,
              bucket: "BUSINESS_FUNDS",
              currency: "RON",
              amountDelta: "10.00",
            },
            {
              walletId: customerWallet.id,
              bucket: "USER_SETTLEMENT",
              currency: "RON",
              amountDelta: "10.00",
            },
          ],
          references: [],
        },
      },
      {
        name: "user charge reducing debt",
        input: {
          type: "USER_CHARGE",
          amount: "10.00",
          currency: "RON",
          financialScope: "COMPANY",
          billingStatus: "BILLED",
          counterpartyUserId: customer.userId,
          idempotencyKey: `finance:${runId}:invalid-user-charge-direction`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: customerWallet.id,
              bucket: "USER_SETTLEMENT",
              currency: "RON",
              amountDelta: "10.00",
            },
          ],
          references: [],
        },
      },
      {
        name: "user payment without collected business funds",
        input: {
          type: "USER_PAYMENT",
          amount: "10.00",
          currency: "RON",
          financialScope: "COMPANY",
          paymentMethod: "CASH",
          billingStatus: "NOT_APPLICABLE",
          counterpartyUserId: customer.userId,
          idempotencyKey: `finance:${runId}:invalid-user-payment-shape`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: customerWallet.id,
              bucket: "USER_SETTLEMENT",
              currency: "RON",
              amountDelta: "10.00",
            },
          ],
          references: [],
        },
      },
      {
        name: "reimbursement without recipient personal funds",
        input: {
          type: "REIMBURSEMENT",
          amount: "10.00",
          currency: "RON",
          financialScope: "COMPANY",
          paymentMethod: "BANK_TRANSFER",
          billingStatus: "NOT_APPLICABLE",
          recipientUserId: admin.userId,
          idempotencyKey: `finance:${runId}:invalid-reimbursement-shape`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: companyBankWallet.id,
              bucket: "BUSINESS_FUNDS",
              currency: "RON",
              amountDelta: "-10.00",
            },
            {
              walletId: companyCashWallet.id,
              bucket: "BUSINESS_FUNDS",
              currency: "RON",
              amountDelta: "10.00",
            },
          ],
          references: [],
        },
      },
      {
        name: "refund moving balances in the payment direction",
        input: {
          type: "REFUND",
          amount: "10.00",
          currency: "RON",
          financialScope: "COMPANY",
          paymentMethod: "CASH",
          billingStatus: "NOT_APPLICABLE",
          counterpartyUserId: customer.userId,
          idempotencyKey: `finance:${runId}:invalid-refund-direction`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: companyCashWallet.id,
              bucket: "BUSINESS_FUNDS",
              currency: "RON",
              amountDelta: "10.00",
            },
            {
              walletId: customerWallet.id,
              bucket: "USER_SETTLEMENT",
              currency: "RON",
              amountDelta: "10.00",
            },
          ],
          references: [],
        },
      },
    ] as const;

    for (const malformed of malformedTransactions) {
      const response = await authenticate(
        req().post(v1.finance.ROUTES.transactions.create).send(malformed.input),
        admin,
      );
      expect({ name: malformed.name, status: response.status }).toEqual({
        name: malformed.name,
        status: 400,
      });
    }
  });

  it("automatically creates and settles equal-share claims for unbilled personal cash", async () => {
    const personalIncomeResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.create)
        .send({
          type: "INCOME",
          amount: "1000.00",
          currency: "RON",
          financialScope: "ADMIN_PERSONAL",
          paymentMethod: "CASH",
          billingStatus: "NOT_BILLED",
          counterpartyUserId: customer.userId,
          idempotencyKey: `finance:${runId}:personal-income`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: adminWallet.id,
              bucket: "ADMIN_PERSONAL_FUNDS",
              currency: "RON",
              amountDelta: "1000.00",
            },
          ],
          references: [
            {
              referenceType: "RENTAL",
              referenceId: `personal-rental-${runId}`,
              isPrimary: true,
            },
          ],
        }),
      admin,
    );
    expect(personalIncomeResponse.status).toBe(201);
    const personalIncome =
      personalIncomeResponse.body as v1.finance.MoneyTransaction;
    expect(
      balance(await getWallet(adminWallet.id), "ADMIN_PERSONAL_FUNDS"),
    ).toBe("1000.00");

    const claimsResponse = await authenticate(
      req().get(v1.finance.ROUTES.claims.outstanding),
      admin,
    );
    expect(claimsResponse.status).toBe(200);
    expect(
      (claimsResponse.body as { items: v1.finance.OutstandingPersonalClaim[] })
        .items,
    ).toEqual([
      {
        debtorUserId: admin.userId,
        creditorUserId: secondAdmin.userId,
        currency: "RON",
        amount: "500.00",
      },
    ]);

    const expenseResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.create)
        .send({
          type: "EXPENSE",
          amount: "300.00",
          currency: "RON",
          financialScope: "ADMIN_PERSONAL",
          paymentMethod: "CASH",
          billingStatus: "NOT_BILLED",
          categoryId: operatingExpenseCategory.id,
          idempotencyKey: `finance:${runId}:personal-expense`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: adminWallet.id,
              bucket: "ADMIN_PERSONAL_FUNDS",
              currency: "RON",
              amountDelta: "-300.00",
            },
          ],
          references: [],
        }),
      admin,
    );
    expect(expenseResponse.status).toBe(201);
    expect(
      balance(await getWallet(adminWallet.id), "ADMIN_PERSONAL_FUNDS"),
    ).toBe("700.00");

    const splitResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.create)
        .send({
          type: "PERSONAL_FUNDS_SPLIT",
          amount: "500.00",
          currency: "RON",
          financialScope: "ADMIN_PERSONAL",
          paymentMethod: "CASH",
          billingStatus: "NOT_APPLICABLE",
          debtorUserId: admin.userId,
          creditorUserId: secondAdmin.userId,
          idempotencyKey: `finance:${runId}:personal-split`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: adminWallet.id,
              bucket: "ADMIN_PERSONAL_FUNDS",
              currency: "RON",
              amountDelta: "-500.00",
            },
            {
              walletId: secondAdminWallet.id,
              bucket: "ADMIN_PERSONAL_FUNDS",
              currency: "RON",
              amountDelta: "500.00",
            },
          ],
          references: [],
        }),
      admin,
    );
    expect(splitResponse.status).toBe(201);
    expect(
      balance(await getWallet(adminWallet.id), "ADMIN_PERSONAL_FUNDS"),
    ).toBe("200.00");
    expect(
      balance(await getWallet(secondAdminWallet.id), "ADMIN_PERSONAL_FUNDS"),
    ).toBe("500.00");

    const settledClaimsResponse = await authenticate(
      req().get(v1.finance.ROUTES.claims.outstanding),
      admin,
    );
    expect(settledClaimsResponse.status).toBe(200);
    expect(
      (
        settledClaimsResponse.body as {
          items: v1.finance.OutstandingPersonalClaim[];
        }
      ).items,
    ).toEqual([]);

    const settledIncomeReversalResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.reverse(personalIncome.id))
        .send({
          idempotencyKey: `finance:${runId}:invalid-personal-income-reversal`,
        }),
      admin,
    );
    expect(settledIncomeReversalResponse.status).toBe(409);

    const secondAdminIncomeResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.create)
        .send({
          type: "INCOME",
          amount: "400.00",
          currency: "RON",
          financialScope: "ADMIN_PERSONAL",
          paymentMethod: "CASH",
          billingStatus: "NOT_BILLED",
          idempotencyKey: `finance:${runId}:second-admin-personal-income`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: secondAdminWallet.id,
              bucket: "ADMIN_PERSONAL_FUNDS",
              currency: "RON",
              amountDelta: "400.00",
            },
          ],
          references: [],
        }),
      secondAdmin,
    );
    expect(secondAdminIncomeResponse.status).toBe(201);

    const firstAdminIncomeResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.create)
        .send({
          type: "INCOME",
          amount: "100.00",
          currency: "RON",
          financialScope: "ADMIN_PERSONAL",
          paymentMethod: "CASH",
          billingStatus: "NOT_BILLED",
          idempotencyKey: `finance:${runId}:first-admin-personal-income`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: adminWallet.id,
              bucket: "ADMIN_PERSONAL_FUNDS",
              currency: "RON",
              amountDelta: "100.00",
            },
          ],
          references: [],
        }),
      admin,
    );
    expect(firstAdminIncomeResponse.status).toBe(201);

    const netClaimsResponse = await authenticate(
      req().get(v1.finance.ROUTES.claims.outstanding),
      admin,
    );
    expect(netClaimsResponse.status).toBe(200);
    expect(
      (
        netClaimsResponse.body as {
          items: v1.finance.OutstandingPersonalClaim[];
        }
      ).items,
    ).toEqual([
      {
        debtorUserId: secondAdmin.userId,
        creditorUserId: admin.userId,
        currency: "RON",
        amount: "150.00",
      },
    ]);

    const wrongDirectionResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.create)
        .send({
          type: "PERSONAL_FUNDS_SPLIT",
          amount: "1.00",
          currency: "RON",
          financialScope: "ADMIN_PERSONAL",
          paymentMethod: "CASH",
          billingStatus: "NOT_APPLICABLE",
          debtorUserId: admin.userId,
          creditorUserId: secondAdmin.userId,
          idempotencyKey: `finance:${runId}:wrong-direction-split`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: adminWallet.id,
              bucket: "ADMIN_PERSONAL_FUNDS",
              currency: "RON",
              amountDelta: "-1.00",
            },
            {
              walletId: secondAdminWallet.id,
              bucket: "ADMIN_PERSONAL_FUNDS",
              currency: "RON",
              amountDelta: "1.00",
            },
          ],
          references: [],
        }),
      admin,
    );
    expect(wrongDirectionResponse.status).toBe(409);

    const reciprocalSplitResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.create)
        .send({
          type: "PERSONAL_FUNDS_SPLIT",
          amount: "150.00",
          currency: "RON",
          financialScope: "ADMIN_PERSONAL",
          paymentMethod: "CASH",
          billingStatus: "NOT_APPLICABLE",
          debtorUserId: secondAdmin.userId,
          creditorUserId: admin.userId,
          idempotencyKey: `finance:${runId}:reciprocal-split`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: secondAdminWallet.id,
              bucket: "ADMIN_PERSONAL_FUNDS",
              currency: "RON",
              amountDelta: "-150.00",
            },
            {
              walletId: adminWallet.id,
              bucket: "ADMIN_PERSONAL_FUNDS",
              currency: "RON",
              amountDelta: "150.00",
            },
          ],
          references: [],
        }),
      secondAdmin,
    );
    expect(reciprocalSplitResponse.status).toBe(201);

    const finalClaimsResponse = await authenticate(
      req().get(v1.finance.ROUTES.claims.outstanding),
      admin,
    );
    expect(finalClaimsResponse.status).toBe(200);
    expect(
      (
        finalClaimsResponse.body as {
          items: v1.finance.OutstandingPersonalClaim[];
        }
      ).items,
    ).toEqual([]);
  });
});
