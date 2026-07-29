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
  email: string;
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
  let formerAdmin: TestSession;
  let adminWallet: v1.finance.Wallet;
  let secondAdminWallet: v1.finance.Wallet;
  let customerWallet: v1.finance.Wallet;
  let formerAdminWallet: v1.finance.Wallet;
  let companyCashWallet: v1.finance.Wallet;
  let companyBankWallet: v1.finance.Wallet;
  let companyProcessorWallet: v1.finance.Wallet;
  let rentalIncomeCategory: v1.finance.FinancialCategory;
  let operatingExpenseCategory: v1.finance.FinancialCategory;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const suiteStartedAt = new Date().toISOString();
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

  async function freshSession(
    roles: string[],
    profile: { firstName?: string; lastName?: string } = {},
  ): Promise<TestSession> {
    const user = await users.createOne({
      email: `finance-${runId}-${createdUserIds.length}@example.com`,
      roles,
      ...profile,
    });
    createdUserIds.push(user.id);
    const issued = await coreAuth.issueSession({ user });
    return {
      accessToken: issued.accessToken,
      email: user.email,
      userId: user.id,
    };
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

    admin = await freshSession(["ADMIN"], {
      firstName: "Ada",
      lastName: "Lovelace",
    });
    secondAdmin = await freshSession(["ADMIN"], {
      firstName: "Grace",
      lastName: "Hopper",
    });
    customer = await freshSession(["USER"], {
      firstName: "Customer",
      lastName: "Example",
    });

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
            {
              idempotencyKey: {
                startsWith: `finance:${runId}:`,
              },
            },
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

    const processorResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.wallets.create)
        .send({
          type: "PAYMENT_PROCESSOR",
          name: `Payment processor ${runId}`,
        }),
      admin,
    );
    expect(processorResponse.status).toBe(201);
    companyProcessorWallet = processorResponse.body as v1.finance.Wallet;
    createdWalletIds.push(companyProcessorWallet.id);

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
    expect(draft.category).toMatchObject({
      id: rentalIncomeCategory.id,
      name: "Rental income",
      kind: "INCOME",
    });
    expect(draft.counterparty).toMatchObject({
      id: customer.userId,
      email: customer.email,
      firstName: "Customer",
      lastName: "Example",
    });
    expect(draft.recordedBy).toMatchObject({
      id: admin.userId,
      firstName: "Ada",
      lastName: "Lovelace",
    });
    expect(draft.balanceChanges[0]?.wallet).toMatchObject({
      id: adminWallet.id,
      type: "USER",
      ownerUserId: admin.userId,
      owner: {
        id: admin.userId,
        firstName: "Ada",
        lastName: "Lovelace",
      },
    });
    expect(balance(await getWallet(adminWallet.id), "BUSINESS_FUNDS")).toBe(
      "0.00",
    );

    const postedResponse = await authenticate(
      req().post(v1.finance.ROUTES.transactions.post(draft.id)),
      admin,
    );
    expect(postedResponse.status).toBe(201);
    const posted = postedResponse.body as v1.finance.MoneyTransaction;
    expect(posted.status).toBe("POSTED");
    expect(posted).toMatchObject({
      category: { id: rentalIncomeCategory.id },
      counterparty: { id: customer.userId },
      recordedBy: { id: admin.userId },
      balanceChanges: [
        {
          wallet: { id: adminWallet.id, ownerUserId: admin.userId },
        },
      ],
    });
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

    const detailResponse = await authenticate(
      req().get(v1.finance.ROUTES.transactions.get(draft.id)),
      admin,
    );
    expect(detailResponse.status).toBe(200);
    const detail = detailResponse.body as v1.finance.MoneyTransaction;
    expect(detail).toMatchObject({
      id: draft.id,
      category: { id: rentalIncomeCategory.id, name: "Rental income" },
      counterparty: { id: customer.userId, firstName: "Customer" },
      recordedBy: { id: admin.userId, firstName: "Ada" },
      balanceChanges: [
        {
          walletId: adminWallet.id,
          wallet: { id: adminWallet.id, ownerUserId: admin.userId },
        },
      ],
    });

    const listResponse = await authenticate(
      req().get(
        `${v1.finance.ROUTES.transactions.list}?walletId=${adminWallet.id}&categoryId=${rentalIncomeCategory.id}&status=POSTED`,
      ),
      admin,
    );
    expect(listResponse.status).toBe(200);
    const listed = (
      listResponse.body as v1.finance.MoneyTransactionList
    ).items.find((item) => item.id === draft.id);
    expect(listed).toEqual(detail);

    // Participant relations are independent on historical rows, while no
    // single creation workflow legitimately uses every role at once.
    const allParticipantRoles = await prisma.moneyTransaction.create({
      data: {
        type: "ADJUSTMENT",
        status: "DRAFT",
        amount: "1.00",
        currency: "RON",
        financialScope: "COMPANY",
        paymentMethod: null,
        billingStatus: "NOT_APPLICABLE",
        counterpartyUserId: customer.userId,
        recipientUserId: secondAdmin.userId,
        debtorUserId: admin.userId,
        creditorUserId: secondAdmin.userId,
        recordedByUserId: admin.userId,
        occurredAt: new Date(),
        idempotencyKey: `finance:${runId}:all-participant-roles`,
      },
      select: { id: true },
    });

    const allParticipantDetailResponse = await authenticate(
      req().get(v1.finance.ROUTES.transactions.get(allParticipantRoles.id)),
      admin,
    );
    expect(allParticipantDetailResponse.status).toBe(200);
    const allParticipantDetail =
      allParticipantDetailResponse.body as v1.finance.MoneyTransaction;
    expect(allParticipantDetail).toMatchObject({
      id: allParticipantRoles.id,
      category: null,
      counterparty: { id: customer.userId },
      recipient: { id: secondAdmin.userId },
      debtor: { id: admin.userId },
      creditor: { id: secondAdmin.userId },
      recordedBy: { id: admin.userId },
      balanceChanges: [],
    });

    const allParticipantListResponse = await authenticate(
      req().get(
        `${v1.finance.ROUTES.transactions.list}?status=DRAFT&type=ADJUSTMENT&userId=${customer.userId}`,
      ),
      admin,
    );
    expect(allParticipantListResponse.status).toBe(200);
    expect(
      (
        allParticipantListResponse.body as v1.finance.MoneyTransactionList
      ).items.find((item) => item.id === allParticipantRoles.id),
    ).toEqual(allParticipantDetail);

    // Legacy/imported rows may also predate recorder attribution entirely.
    const noOptionalParticipants = await prisma.moneyTransaction.create({
      data: {
        type: "ADJUSTMENT",
        status: "DRAFT",
        amount: "1.00",
        currency: "RON",
        financialScope: "COMPANY",
        paymentMethod: null,
        billingStatus: "NOT_APPLICABLE",
        occurredAt: new Date(),
        idempotencyKey: `finance:${runId}:no-optional-participants`,
      },
      select: { id: true },
    });
    const noOptionalDetailResponse = await authenticate(
      req().get(v1.finance.ROUTES.transactions.get(noOptionalParticipants.id)),
      admin,
    );
    expect(noOptionalDetailResponse.status).toBe(200);
    expect(noOptionalDetailResponse.body).toMatchObject({
      id: noOptionalParticipants.id,
      category: null,
      counterparty: null,
      recipient: null,
      debtor: null,
      creditor: null,
      recordedBy: null,
      balanceChanges: [],
    });

    await prisma.user.update({
      where: { id: customer.userId },
      data: { deletedAt: new Date() },
    });
    try {
      const deletedParticipantResponse = await authenticate(
        req().get(v1.finance.ROUTES.transactions.get(draft.id)),
        admin,
      );
      expect(deletedParticipantResponse.status).toBe(200);
      expect(
        (deletedParticipantResponse.body as v1.finance.MoneyTransaction)
          .counterparty,
      ).toEqual({
        id: customer.userId,
        email: customer.email,
        firstName: "Customer",
        lastName: "Example",
      });
    } finally {
      await prisma.user.update({
        where: { id: customer.userId },
        data: { deletedAt: null },
      });
    }

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
    expect(transferResponse.body).toMatchObject({
      category: null,
      counterparty: null,
      recipient: null,
      debtor: null,
      creditor: null,
      recordedBy: { id: admin.userId },
    });
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
    const bankIncome = incomeResponse.body as v1.finance.MoneyTransaction;

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
    expect(reversal).toMatchObject({
      recordedBy: { id: admin.userId },
      balanceChanges: [
        {
          wallet: { id: companyBankWallet.id },
        },
      ],
    });
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
    expect(
      (originalResponse.body as v1.finance.MoneyTransaction)
        .reversalTransactionId,
    ).toBe(reversal.id);

    const customerTransactions = await authenticate(
      req().get(
        `${v1.finance.ROUTES.transactions.list}?userId=${customer.userId}`,
      ),
      admin,
    );
    expect(customerTransactions.status).toBe(200);
    expect(
      (customerTransactions.body as v1.finance.MoneyTransactionList).items.map(
        (item) => item.id,
      ),
    ).not.toContain(bankIncome.id);

    const recordedByAdmin = await authenticate(
      req().get(
        `${v1.finance.ROUTES.transactions.list}?recordedByUserId=${admin.userId}`,
      ),
      admin,
    );
    expect(recordedByAdmin.status).toBe(200);
    expect(
      (recordedByAdmin.body as v1.finance.MoneyTransactionList).items.map(
        (item) => item.id,
      ),
    ).toContain(bankIncome.id);
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
        debtor: {
          id: admin.userId,
          email: admin.email,
          firstName: "Ada",
          lastName: "Lovelace",
        },
        creditor: {
          id: secondAdmin.userId,
          email: secondAdmin.email,
          firstName: "Grace",
          lastName: "Hopper",
        },
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
        debtor: {
          id: secondAdmin.userId,
          email: secondAdmin.email,
          firstName: "Grace",
          lastName: "Hopper",
        },
        creditor: {
          id: admin.userId,
          email: admin.email,
          firstName: "Ada",
          lastName: "Lovelace",
        },
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

  it("filters and paginates wallet selectors without returning every wallet", async () => {
    const ownerSearch = await authenticate(
      req().get(
        `${v1.finance.ROUTES.wallets.list}?search=${encodeURIComponent(`finance-${runId}-0@example.com`)}&page=1&pageSize=1`,
      ),
      admin,
    );
    expect(ownerSearch.status).toBe(200);
    expect(ownerSearch.body).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 1,
      items: [{ id: adminWallet.id, ownerUserId: admin.userId }],
    });

    const fullNameSearch = await authenticate(
      req().get(
        `${v1.finance.ROUTES.wallets.list}?search=${encodeURIComponent("  Ada   Lovelace  ")}&ownerRole=ADMIN&ownerIsActive=true`,
      ),
      admin,
    );
    expect(fullNameSearch.status).toBe(200);
    expect(fullNameSearch.body).toMatchObject({
      total: 1,
      items: [
        {
          id: adminWallet.id,
          owner: {
            id: admin.userId,
            firstName: "Ada",
            lastName: "Lovelace",
          },
        },
      ],
    });

    const exactFilters = await authenticate(
      req().get(
        `${v1.finance.ROUTES.wallets.list}?type=USER&ownerUserId=${admin.userId}&isActive=true`,
      ),
      admin,
    );
    expect(exactFilters.status).toBe(200);
    expect(exactFilters.body).toMatchObject({
      page: 1,
      pageSize: 25,
      total: 1,
      items: [{ id: adminWallet.id }],
    });

    const companyNameSearch = await authenticate(
      req().get(
        `${v1.finance.ROUTES.wallets.list}?search=${encodeURIComponent(`Cash desk ${runId}`)}`,
      ),
      admin,
    );
    expect(companyNameSearch.status).toBe(200);
    expect(companyNameSearch.body).toMatchObject({
      total: 1,
      items: [{ id: companyCashWallet.id }],
    });

    const customerExcludedFromAdminOptions = await authenticate(
      req().get(
        `${v1.finance.ROUTES.wallets.list}?search=${encodeURIComponent("Customer Example")}&ownerRole=ADMIN`,
      ),
      admin,
    );
    expect(customerExcludedFromAdminOptions.status).toBe(200);
    expect(customerExcludedFromAdminOptions.body).toMatchObject({
      total: 0,
      items: [],
    });

    const literalWildcardSearch = await authenticate(
      req().get(
        `${v1.finance.ROUTES.wallets.list}?search=${encodeURIComponent("%")}`,
      ),
      admin,
    );
    expect(literalWildcardSearch.status).toBe(200);
    expect(literalWildcardSearch.body).toMatchObject({
      total: 0,
      items: [],
    });

    const unsupportedOwnerRole = await authenticate(
      req().get(`${v1.finance.ROUTES.wallets.list}?ownerRole=USER`),
      admin,
    );
    expect(unsupportedOwnerRole.status).toBe(400);

    await prisma.user.update({
      where: { id: secondAdmin.userId },
      data: { deletedAt: new Date() },
    });
    try {
      const inactiveOwnerExcluded = await authenticate(
        req().get(
          `${v1.finance.ROUTES.wallets.list}?search=${encodeURIComponent("Grace Hopper")}&ownerRole=ADMIN&ownerIsActive=true`,
        ),
        admin,
      );
      expect(inactiveOwnerExcluded.status).toBe(200);
      expect(inactiveOwnerExcluded.body).toMatchObject({
        total: 0,
        items: [],
      });

      const inactiveAdminOption = await authenticate(
        req().get(
          `${v1.finance.ROUTES.walletOptions}?search=${encodeURIComponent("Grace Hopper")}&ownerRole=ADMIN`,
        ),
        admin,
      );
      expect(inactiveAdminOption.status).toBe(200);
      expect(inactiveAdminOption.body).toEqual({
        items: [],
        nextCursor: null,
      });

      const inactiveUserOption = await authenticate(
        req().get(
          `${v1.finance.ROUTES.walletOptions}?type=USER&ownerUserId=${secondAdmin.userId}&isActive=true`,
        ),
        admin,
      );
      expect(inactiveUserOption.status).toBe(200);
      expect(inactiveUserOption.body).toEqual({
        items: [],
        nextCursor: null,
      });
    } finally {
      await prisma.user.update({
        where: { id: secondAdmin.userId },
        data: { deletedAt: null },
      });
    }

    const oversizedPage = await authenticate(
      req().get(`${v1.finance.ROUTES.wallets.list}?pageSize=101`),
      admin,
    );
    expect(oversizedPage.status).toBe(400);
  });

  it("serves lightweight, filtered wallet options with stable cursors", async () => {
    const duplicateName = `Selector duplicate ${runId}`;
    const duplicateWallets = await Promise.all([
      prisma.wallet.create({
        data: {
          type: "COMPANY_CASH",
          name: duplicateName,
        },
        select: { id: true },
      }),
      prisma.wallet.create({
        data: {
          type: "COMPANY_CASH",
          name: duplicateName,
        },
        select: { id: true },
      }),
      prisma.wallet.create({
        data: {
          type: "COMPANY_CASH",
          name: duplicateName,
          isActive: false,
        },
        select: { id: true },
      }),
    ]);
    createdWalletIds.push(...duplicateWallets.map((wallet) => wallet.id));

    const ownerSearch = await authenticate(
      req().get(
        `${v1.finance.ROUTES.walletOptions}?search=${encodeURIComponent("  aDa   LOVElaCE  ")}&type=USER&ownerRole=ADMIN&ownerUserId=${admin.userId}&isActive=true`,
      ),
      admin,
    );
    expect(ownerSearch.status).toBe(200);
    const ownerSearchBody = ownerSearch.body as v1.finance.WalletOptionList;
    expect(ownerSearchBody).toEqual({
      items: [
        {
          id: adminWallet.id,
          type: "USER",
          name: "Personal wallet",
          isActive: true,
          owner: {
            id: admin.userId,
            email: admin.email,
            firstName: "Ada",
            lastName: "Lovelace",
          },
        },
      ],
      nextCursor: null,
    });
    expect(Object.keys(ownerSearchBody.items[0]).sort()).toEqual(
      ["id", "type", "name", "isActive", "owner"].sort(),
    );
    expect(ownerSearchBody.items[0]).not.toHaveProperty("balances");

    const companyOnly = await authenticate(
      req().get(
        `${v1.finance.ROUTES.walletOptions}?search=${encodeURIComponent(runId)}&companyOnly=true&pageSize=100`,
      ),
      admin,
    );
    expect(companyOnly.status).toBe(200);
    const companyOnlyBody = companyOnly.body as v1.finance.WalletOptionList;
    expect(
      companyOnlyBody.items.every(
        (wallet) => wallet.type !== "USER" && wallet.owner === null,
      ),
    ).toBe(true);
    expect(companyOnlyBody.items.map((wallet) => wallet.id)).toEqual(
      expect.arrayContaining([
        companyCashWallet.id,
        companyBankWallet.id,
        companyProcessorWallet.id,
      ]),
    );
    expect(companyOnlyBody.items.map((wallet) => wallet.id)).not.toContain(
      adminWallet.id,
    );

    const companyCashOnly = await authenticate(
      req().get(
        `${v1.finance.ROUTES.walletOptions}?search=${encodeURIComponent(runId)}&companyOnly=true&type=COMPANY_CASH&pageSize=100`,
      ),
      admin,
    );
    expect(companyCashOnly.status).toBe(200);
    expect(
      (companyCashOnly.body as v1.finance.WalletOptionList).items.every(
        (wallet) => wallet.type === "COMPANY_CASH",
      ),
    ).toBe(true);

    const inactiveOnly = await authenticate(
      req().get(
        `${v1.finance.ROUTES.walletOptions}?search=${encodeURIComponent(duplicateName)}&type=COMPANY_CASH&isActive=false`,
      ),
      admin,
    );
    expect(inactiveOnly.status).toBe(200);
    expect(inactiveOnly.body).toEqual({
      items: [
        {
          id: duplicateWallets[2]?.id,
          type: "COMPANY_CASH",
          name: duplicateName,
          isActive: false,
          owner: null,
        },
      ],
      nextCursor: null,
    });

    const seenWalletIds: string[] = [];
    let cursor: string | null = null;
    let firstCursor: string | null = null;
    let firstWalletId: string | null = null;
    for (let page = 0; page < duplicateWallets.length; page += 1) {
      const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
      const response = await authenticate(
        req().get(
          `${v1.finance.ROUTES.walletOptions}?search=${encodeURIComponent(duplicateName)}&type=COMPANY_CASH&isActive=true&pageSize=1${cursorQuery}`,
        ),
        admin,
      );
      expect(response.status).toBe(200);
      const body = response.body as v1.finance.WalletOptionList;
      expect(body.items).toHaveLength(1);
      seenWalletIds.push(body.items[0].id);
      if (page === 0) {
        firstCursor = body.nextCursor;
        firstWalletId = body.items[0].id;
      }
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    expect(seenWalletIds.sort()).toEqual(
      duplicateWallets
        .slice(0, 2)
        .map((wallet) => wallet.id)
        .sort(),
    );
    expect(new Set(seenWalletIds).size).toBe(seenWalletIds.length);
    expect(cursor).toBeNull();

    expect(firstCursor).not.toBeNull();
    expect(firstWalletId).not.toBeNull();
    if (!firstCursor || !firstWalletId) {
      throw new Error("Expected the first wallet-option page to have a cursor");
    }
    expect(
      Buffer.from(firstCursor, "base64url").toString("utf8"),
    ).not.toContain(duplicateName);

    const changedFilterCursor = await authenticate(
      req().get(
        `${v1.finance.ROUTES.walletOptions}?search=${encodeURIComponent(duplicateName)}&type=COMPANY_CASH&companyOnly=true&isActive=true&pageSize=1&cursor=${encodeURIComponent(firstCursor)}`,
      ),
      admin,
    );
    expect(changedFilterCursor.status).toBe(400);

    await prisma.wallet.update({
      where: { id: firstWalletId },
      data: { name: `Changed ${runId}` },
    });
    try {
      const staleCursor = await authenticate(
        req().get(
          `${v1.finance.ROUTES.walletOptions}?search=${encodeURIComponent(duplicateName)}&type=COMPANY_CASH&isActive=true&pageSize=1&cursor=${encodeURIComponent(firstCursor)}`,
        ),
        admin,
      );
      expect(staleCursor.status).toBe(400);
    } finally {
      await prisma.wallet.update({
        where: { id: firstWalletId },
        data: { name: duplicateName },
      });
    }

    const badCursor = await authenticate(
      req().get(`${v1.finance.ROUTES.walletOptions}?cursor=not-a-cursor`),
      admin,
    );
    expect(badCursor.status).toBe(400);

    const oversizedPage = await authenticate(
      req().get(`${v1.finance.ROUTES.walletOptions}?pageSize=101`),
      admin,
    );
    expect(oversizedPage.status).toBe(400);

    const forbidden = await authenticate(
      req().get(v1.finance.ROUTES.walletOptions),
      customer,
    );
    expect(forbidden.status).toBe(403);
  });

  it("keeps funds held by former admins visible in current balance snapshots", async () => {
    formerAdmin = await freshSession(["ADMIN"], {
      firstName: "Katherine",
      lastName: "Johnson",
    });
    formerAdminWallet = await getWalletForUser(formerAdmin);
    createdWalletIds.push(formerAdminWallet.id);

    const transferResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.create)
        .send({
          type: "TRANSFER",
          amount: "50.00",
          currency: "RON",
          financialScope: "COMPANY",
          billingStatus: "NOT_APPLICABLE",
          idempotencyKey: `finance:${runId}:former-admin-funds`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: companyBankWallet.id,
              bucket: "BUSINESS_FUNDS",
              currency: "RON",
              amountDelta: "-50.00",
            },
            {
              walletId: formerAdminWallet.id,
              bucket: "BUSINESS_FUNDS",
              currency: "RON",
              amountDelta: "50.00",
            },
          ],
          references: [],
        }),
      formerAdmin,
    );
    expect(transferResponse.status).toBe(201);

    await prisma.user.update({
      where: { id: formerAdmin.userId },
      data: { roles: ["USER"] },
    });
  });

  it("summarizes posted income and expenses in the requested range", async () => {
    await prisma.financialCategory.update({
      where: { id: operatingExpenseCategory.id },
      data: { isActive: false },
    });
    const from = encodeURIComponent(suiteStartedAt);
    const to = encodeURIComponent(new Date().toISOString());
    const response = await authenticate(
      req().get(`${v1.finance.ROUTES.summary}?from=${from}&to=${to}`),
      admin,
    );
    expect(response.status).toBe(200);

    const summary = response.body as v1.finance.FinanceSummary;
    expect(summary.period).toEqual({
      from: summary.from,
      to: summary.to,
    });
    expect(summary.income).toEqual([{ currency: "RON", amount: "2120.00" }]);
    expect(summary.expenses).toEqual([{ currency: "RON", amount: "300.00" }]);
    expect(summary.totals).toEqual([
      {
        currency: "RON",
        income: "2120.00",
        expenses: "300.00",
      },
    ]);
    expect(summary.incomeByPaymentMethod).toEqual([
      {
        paymentMethod: "BANK_TRANSFER",
        currency: "RON",
        amount: "500.00",
      },
      { paymentMethod: "CASH", currency: "RON", amount: "1620.00" },
    ]);
    expect(summary.expensesByCategory).toEqual([
      {
        category: {
          id: operatingExpenseCategory.id,
          code: operatingExpenseCategory.code,
          name: operatingExpenseCategory.name,
          kind: "EXPENSE",
        },
        currency: "RON",
        amount: "300.00",
      },
    ]);
    expect(summary.incomeByBillingStatus).toEqual([
      { billingStatus: "BILLED", currency: "RON", amount: "620.00" },
      { billingStatus: "NOT_BILLED", currency: "RON", amount: "1500.00" },
    ]);
    expect(summary.incomeByScope).toEqual([
      {
        financialScope: "ADMIN_PERSONAL",
        currency: "RON",
        amount: "1500.00",
      },
      {
        financialScope: "COMPANY",
        currency: "RON",
        amount: "620.00",
      },
    ]);
    expect(Number.isNaN(Date.parse(summary.generatedAt))).toBe(false);

    const companyCash = summary.currentBalances.company.find(
      (item) =>
        item.wallet.id === companyCashWallet.id &&
        item.bucket === "BUSINESS_FUNDS" &&
        item.currency === "RON",
    );
    expect(companyCash).toMatchObject({
      balance: "120.00",
      ownerIsActive: null,
      ownerIsAdmin: null,
      wallet: {
        id: companyCashWallet.id,
        type: "COMPANY_CASH",
        name: `Cash desk ${runId}`,
        ownerUserId: null,
        owner: null,
      },
    });
    expect(summary.companyMoney).toContainEqual({
      walletId: companyCashWallet.id,
      walletType: "COMPANY_CASH",
      walletName: `Cash desk ${runId}`,
      currency: "RON",
      amount: "120.00",
    });

    const adminPersonal = summary.currentBalances.admins.find(
      (item) =>
        item.wallet.id === adminWallet.id &&
        item.bucket === "ADMIN_PERSONAL_FUNDS" &&
        item.currency === "RON",
    );
    expect(adminPersonal).toMatchObject({
      ownerIsActive: true,
      ownerIsAdmin: true,
      wallet: {
        id: adminWallet.id,
        ownerUserId: admin.userId,
        owner: {
          id: admin.userId,
          firstName: "Ada",
          lastName: "Lovelace",
        },
      },
    });
    expect(adminPersonal?.balance).toMatch(/^-?\d+\.\d{2}$/);
    expect(summary.adminMoney).toContainEqual({
      admin: {
        id: admin.userId,
        email: admin.email,
        firstName: "Ada",
        lastName: "Lovelace",
      },
      currency: "RON",
      businessFunds: "0.00",
      personalFunds: "450.00",
      customerGuaranteeFunds: "0.00",
    });

    const processorBusiness = summary.currentBalances.company.find(
      (item) =>
        item.wallet.id === companyProcessorWallet.id &&
        item.bucket === "BUSINESS_FUNDS" &&
        item.currency === "RON",
    );
    expect(processorBusiness).toMatchObject({
      balance: "0.00",
      ownerIsActive: null,
      ownerIsAdmin: null,
    });

    const secondAdminBusiness = summary.currentBalances.admins.find(
      (item) =>
        item.wallet.id === secondAdminWallet.id &&
        item.bucket === "BUSINESS_FUNDS" &&
        item.currency === "RON",
    );
    expect(secondAdminBusiness).toMatchObject({
      balance: "0.00",
      ownerIsActive: true,
      ownerIsAdmin: true,
    });

    const formerAdminBusiness = summary.currentBalances.admins.find(
      (item) =>
        item.wallet.id === formerAdminWallet.id &&
        item.bucket === "BUSINESS_FUNDS" &&
        item.currency === "RON",
    );
    expect(formerAdminBusiness).toMatchObject({
      balance: "50.00",
      ownerIsActive: true,
      ownerIsAdmin: false,
    });
  });

  it("uses half-open timestamp ranges, separates currencies, and protects the summary route", async () => {
    async function recordIncome(input: {
      key: string;
      amount: string;
      currency: string;
      occurredAt: string;
      postImmediately: boolean;
    }): Promise<string> {
      const response = await authenticate(
        req()
          .post(v1.finance.ROUTES.transactions.create)
          .send({
            type: "INCOME",
            amount: input.amount,
            currency: input.currency,
            financialScope: "COMPANY",
            paymentMethod: "CASH",
            billingStatus: "BILLED",
            categoryId: rentalIncomeCategory.id,
            occurredAt: input.occurredAt,
            idempotencyKey: `finance:${runId}:summary-boundary:${input.key}`,
            postImmediately: input.postImmediately,
            balanceChanges: [
              {
                walletId: companyCashWallet.id,
                bucket: "BUSINESS_FUNDS",
                currency: input.currency,
                amountDelta: input.amount,
              },
            ],
            references: [],
          }),
        admin,
      );
      expect(response.status).toBe(201);
      return (response.body as v1.finance.MoneyTransaction).id;
    }

    const from = "2026-01-01T00:00:00.000+02:00";
    const to = "2026-01-02T00:00:00.000+02:00";
    const atFromId = await recordIncome({
      key: "from",
      amount: "10.00",
      currency: "RON",
      occurredAt: from,
      postImmediately: true,
    });
    const insideId = await recordIncome({
      key: "inside",
      amount: "20.00",
      currency: "EUR",
      occurredAt: "2026-01-01T23:59:59.999+02:00",
      postImmediately: true,
    });
    const atToId = await recordIncome({
      key: "to",
      amount: "30.00",
      currency: "RON",
      occurredAt: to,
      postImmediately: true,
    });
    const draftId = await recordIncome({
      key: "draft",
      amount: "99.00",
      currency: "RON",
      occurredAt: "2026-01-01T12:00:00.000+02:00",
      postImmediately: false,
    });
    await prisma.moneyTransaction.create({
      data: {
        type: "INCOME",
        status: "POSTED",
        amount: "7.00",
        currency: "XTS",
        financialScope: "COMPANY",
        paymentMethod: null,
        billingStatus: "BILLED",
        recordedByUserId: admin.userId,
        occurredAt: new Date("2026-01-01T10:00:00.000+02:00"),
        idempotencyKey: `finance:${runId}:summary-null-payment-method`,
      },
    });
    const uncategorizedExpense = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.create)
        .send({
          type: "EXPENSE",
          amount: "5.00",
          currency: "EUR",
          financialScope: "COMPANY",
          paymentMethod: "CASH",
          billingStatus: "BILLED",
          occurredAt: "2026-01-01T11:00:00.000+02:00",
          idempotencyKey: `finance:${runId}:summary-uncategorized-expense`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: companyCashWallet.id,
              bucket: "BUSINESS_FUNDS",
              currency: "EUR",
              amountDelta: "-5.00",
            },
          ],
          references: [],
        }),
      admin,
    );
    expect(uncategorizedExpense.status).toBe(201);

    const response = await authenticate(
      req().get(
        `${v1.finance.ROUTES.summary}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
      admin,
    );
    expect(response.status).toBe(200);
    expect((response.body as v1.finance.FinanceSummary).income).toEqual([
      { currency: "EUR", amount: "20.00" },
      { currency: "RON", amount: "10.00" },
      { currency: "XTS", amount: "7.00" },
    ]);
    const boundarySummary = response.body as v1.finance.FinanceSummary;
    expect(boundarySummary.expenses).toEqual([
      { currency: "EUR", amount: "5.00" },
    ]);
    expect(boundarySummary.incomeByPaymentMethod).toContainEqual({
      currency: "XTS",
      paymentMethod: null,
      amount: "7.00",
    });
    expect(boundarySummary.expensesByCategory).toEqual([
      {
        currency: "EUR",
        category: null,
        amount: "5.00",
      },
    ]);
    expect(boundarySummary.totals).toEqual([
      { currency: "EUR", income: "20.00", expenses: "5.00" },
      { currency: "RON", income: "10.00", expenses: "0.00" },
      { currency: "XTS", income: "7.00", expenses: "0.00" },
    ]);

    const ledgerResponse = await authenticate(
      req().get(
        `${v1.finance.ROUTES.transactions.list}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&status=POSTED&type=INCOME&paymentMethod=CASH`,
      ),
      admin,
    );
    expect(ledgerResponse.status).toBe(200);
    const ledgerIds = (
      ledgerResponse.body as v1.finance.MoneyTransactionList
    ).items.map((item) => item.id);
    expect(ledgerIds).toEqual([insideId, atFromId]);
    expect(ledgerIds).not.toContain(atToId);
    expect(ledgerIds).not.toContain(draftId);

    const zeroLength = await authenticate(
      req().get(
        `${v1.finance.ROUTES.summary}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(from)}`,
      ),
      admin,
    );
    expect(zeroLength.status).toBe(400);

    const invalidTimestamp = await authenticate(
      req().get(
        `${v1.finance.ROUTES.summary}?from=not-a-timestamp&to=${encodeURIComponent(to)}`,
      ),
      admin,
    );
    expect(invalidTimestamp.status).toBe(400);

    const excessiveRange = await authenticate(
      req().get(
        `${v1.finance.ROUTES.summary}?from=${encodeURIComponent("2024-01-01T00:00:00.000Z")}&to=${encodeURIComponent("2026-01-01T00:00:00.000Z")}`,
      ),
      admin,
    );
    expect(excessiveRange.status).toBe(400);

    const forbidden = await authenticate(
      req().get(
        `${v1.finance.ROUTES.summary}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
      customer,
    );
    expect(forbidden.status).toBe(403);
  });
});
