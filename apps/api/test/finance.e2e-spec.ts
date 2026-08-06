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

interface AdminRoleSnapshot {
  id: string;
  roles: string[];
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
  let expenseEvidenceEntity: v1.finance.BusinessLegalEntity;
  let expenseEvidenceOwner: v1.finance.BusinessOwner;
  let expenseEvidencePayee: v1.finance.Company;
  let expenseEvidenceCategory: v1.finance.FinancialCategory;
  let expenseEvidenceCashWalletId: string;
  let expenseEvidenceCardWalletId: string;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const suiteStartedAt = new Date().toISOString();
  const expenseEvidenceTaxIdentifier = `RO${Date.now()}${Math.floor(
    Math.random() * 1_000,
  )}`;
  const createdUserIds: string[] = [];
  const createdWalletIds: string[] = [];
  const createdCategoryIds: string[] = [];
  let existingAdminRoleSnapshots: AdminRoleSnapshot[] = [];

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

  function claimsForSuiteAdmins(
    body: unknown,
  ): v1.finance.OutstandingPersonalClaim[] {
    const suiteAdminIds = new Set([admin.userId, secondAdmin.userId]);
    const { items } = body as {
      items: v1.finance.OutstandingPersonalClaim[];
    };

    return items.filter(
      (claim) =>
        suiteAdminIds.has(claim.debtorUserId) &&
        suiteAdminIds.has(claim.creditorUserId),
    );
  }

  function expensePayload(input: {
    key: string;
    source: v1.finance.ExpensePaymentSource;
    target?: v1.finance.ExpenseAttributionTarget;
    documents?: v1.finance.ExpenseDocumentInput[];
  }): v1.finance.CreateExpenseInput {
    const target = input.target ?? "BUSINESS";
    const isPersonal = input.source === "PERSONAL_FUNDS";
    return {
      legalEntityId: expenseEvidenceEntity.id,
      payeeId: expenseEvidencePayee.counterpartyId,
      categoryId: expenseEvidenceCategory.id,
      occurredOn: "2040-01-15",
      taxPointOn: "2040-01-15",
      currency: "RON",
      grossAmount: "25.00",
      idempotencyKey: `expense-e2e:${runId}:${input.key}`,
      postImmediately: false,
      payment: {
        source: input.source,
        companyWalletId: isPersonal
          ? null
          : input.source === "COMPANY_CASH_DESK"
            ? expenseEvidenceCashWalletId
            : expenseEvidenceCardWalletId,
        fundedByUserId: isPersonal ? admin.userId : null,
        paidByUserId: admin.userId,
        amount: "25.00",
        paidOn: "2040-01-15",
      },
      attribution: {
        target,
        businessOwnerId: target === "OWNER" ? expenseEvidenceOwner.id : null,
      },
      taxLines: [],
      references: [],
      documents: input.documents ?? [],
      scooterAllocations: [],
    };
  }

  async function createExpenseDraft(input: {
    key: string;
    source: v1.finance.ExpensePaymentSource;
    target?: v1.finance.ExpenseAttributionTarget;
    documents?: v1.finance.ExpenseDocumentInput[];
  }): Promise<v1.finance.Expense> {
    const response = await authenticate(
      req().post(v1.finance.EXPENSE_ROUTES.create).send(expensePayload(input)),
      admin,
    );
    expect(response.status).toBe(201);
    return response.body as v1.finance.Expense;
  }

  async function attachExpenseDocumentOriginal(
    documentId: string,
    key: string,
  ): Promise<void> {
    const asset = await prisma.mediaAsset.create({
      data: {
        provider: "e2e",
        bucket: "expense-e2e",
        storageKey: `expense-e2e/${runId}/${key}`,
        contentType: "image/jpeg",
        byteSize: 1,
        checksumSha256: "a".repeat(64),
        uploadedByUserId: admin.userId,
      },
      select: { id: true },
    });
    await prisma.expenseDocumentAsset.create({
      data: {
        documentId,
        assetId: asset.id,
        role: "ORIGINAL",
        imageWidth: 1,
        imageHeight: 1,
      },
    });
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

    // The API E2E command runs suites in-band. Isolate the active-admin set
    // atomically so personal-income claim generation sees only this suite's
    // two admins, while preserving every pre-existing user's exact roles.
    existingAdminRoleSnapshots = await prisma.$transaction(async (tx) => {
      const snapshots = await tx.user.findMany({
        where: { roles: { has: "ADMIN" }, deletedAt: null },
        select: { id: true, roles: true },
        orderBy: { id: "asc" },
      });

      for (const snapshot of snapshots) {
        await tx.user.update({
          where: { id: snapshot.id },
          data: {
            roles: snapshot.roles.filter((role) => role !== "ADMIN"),
          },
        });
      }

      return snapshots;
    });

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

    const entityResponse = await authenticate(
      req()
        .post(v1.finance.EXPENSE_ROUTES.legalEntities.create)
        .send({
          company: {
            legalName: `Expense Evidence Entity ${runId}`,
            legalForm: "SRL",
            taxIdentifier: expenseEvidenceTaxIdentifier,
          },
          defaultCurrency: "RON",
          walletIds: [],
          bankAccounts: [
            {
              name: "Expense evidence card account",
              cardHolderUserId: admin.userId,
            },
          ],
        }),
      admin,
    );
    expect(entityResponse.status).toBe(201);
    expenseEvidenceEntity =
      entityResponse.body as v1.finance.BusinessLegalEntity;
    const cashWallet = expenseEvidenceEntity.wallets.find(
      (wallet) => wallet.type === "COMPANY_CASH",
    );
    const cardWallet = expenseEvidenceEntity.wallets.find(
      (wallet) => wallet.type === "COMPANY_BANK",
    );
    if (!cashWallet || !cardWallet) {
      throw new Error(
        "Expense evidence entity must expose cash and card wallets",
      );
    }
    expenseEvidenceCashWalletId = cashWallet.id;
    expenseEvidenceCardWalletId = cardWallet.id;
    createdWalletIds.push(...expenseEvidenceEntity.wallets.map(({ id }) => id));

    const ownerResponse = await authenticate(
      req()
        .post(
          v1.finance.EXPENSE_ROUTES.legalEntities.owners.create(
            expenseEvidenceEntity.id,
          ),
        )
        .send({ userId: admin.userId, effectiveFrom: "2000-01-01" }),
      admin,
    );
    expect(ownerResponse.status).toBe(201);
    expenseEvidenceOwner = ownerResponse.body as v1.finance.BusinessOwner;

    const payeeResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.companies.create)
        .send({
          legalName: `Expense Evidence Vendor ${runId}`,
          legalForm: "SRL",
          taxIdentifier: `${expenseEvidenceTaxIdentifier}1`,
        }),
      admin,
    );
    expect(payeeResponse.status).toBe(201);
    expenseEvidencePayee = payeeResponse.body as v1.finance.Company;

    const categoryResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.categories.create)
        .send({ name: `Expense evidence ${runId}`, kind: "EXPENSE" }),
      admin,
    );
    expect(categoryResponse.status).toBe(201);
    expenseEvidenceCategory =
      categoryResponse.body as v1.finance.FinancialCategory;
    createdCategoryIds.push(expenseEvidenceCategory.id);
  });

  afterAll(async () => {
    let expenseCleanupError: unknown;
    if (prisma) {
      try {
        await prisma.$transaction(async (tx) => {
          // Expense history is deliberately append-only in production. This
          // transaction-local PostgreSQL setting disables user triggers only on
          // this E2E connection so the suite can remove its own isolated rows.
          await tx.$executeRawUnsafe(
            "SET LOCAL session_replication_role = 'replica'",
          );
          const expenses = await tx.expense.findMany({
            where: {
              idempotencyKey: { startsWith: `expense-e2e:${runId}:` },
            },
            select: { id: true },
          });
          const expenseIds = expenses.map(({ id }) => id);
          if (expenseIds.length === 0) return;

          const [postings, documents, pools, snapshots, claims] =
            await Promise.all([
              tx.expensePosting.findMany({
                where: { expenseId: { in: expenseIds } },
                select: { moneyTransactionId: true },
              }),
              tx.expenseDocument.findMany({
                where: { expenseId: { in: expenseIds } },
                select: { id: true },
              }),
              tx.expenseCostPool.findMany({
                where: { expenseId: { in: expenseIds } },
                select: { id: true },
              }),
              tx.expenseTaxSnapshot.findMany({
                where: { expenseId: { in: expenseIds } },
                select: { id: true },
              }),
              tx.expenseReimbursementClaim.findMany({
                where: { expenseId: { in: expenseIds } },
                select: { id: true },
              }),
            ]);
          const transactionIds = postings.map(
            ({ moneyTransactionId }) => moneyTransactionId,
          );
          const documentIds = documents.map(({ id }) => id);
          const poolIds = pools.map(({ id }) => id);
          const snapshotIds = snapshots.map(({ id }) => id);
          const claimIds = claims.map(({ id }) => id);
          const assetLinks =
            documentIds.length === 0
              ? []
              : await tx.expenseDocumentAsset.findMany({
                  where: { documentId: { in: documentIds } },
                  select: { assetId: true },
                });

          await tx.expensePosting.deleteMany({
            where: { expenseId: { in: expenseIds } },
          });
          if (transactionIds.length > 0) {
            await tx.moneyTransactionReference.deleteMany({
              where: { moneyTransactionId: { in: transactionIds } },
            });
            await tx.walletBalanceChange.deleteMany({
              where: { moneyTransactionId: { in: transactionIds } },
            });
            await tx.moneyTransaction.deleteMany({
              where: { id: { in: transactionIds } },
            });
          }
          if (claimIds.length > 0) {
            await tx.expenseReimbursementSettlement.deleteMany({
              where: { claimId: { in: claimIds } },
            });
            await tx.expenseReimbursementClaim.deleteMany({
              where: { id: { in: claimIds } },
            });
          }
          if (documentIds.length > 0) {
            await tx.expenseDocumentAsset.deleteMany({
              where: { documentId: { in: documentIds } },
            });
            await tx.expenseDocument.deleteMany({
              where: { id: { in: documentIds } },
            });
          }
          if (snapshotIds.length > 0) {
            await tx.expenseTaxLine.deleteMany({
              where: { taxSnapshotId: { in: snapshotIds } },
            });
            await tx.expenseTaxSnapshot.deleteMany({
              where: { id: { in: snapshotIds } },
            });
          }
          await tx.expenseReference.deleteMany({
            where: { expenseId: { in: expenseIds } },
          });
          if (poolIds.length > 0) {
            await tx.expenseCostAttribution.deleteMany({
              where: { costPoolId: { in: poolIds } },
            });
            await tx.expenseCostPool.deleteMany({
              where: { id: { in: poolIds } },
            });
          }
          await tx.expensePayment.deleteMany({
            where: { expenseId: { in: expenseIds } },
          });
          await tx.expense.deleteMany({ where: { id: { in: expenseIds } } });
          if (assetLinks.length > 0) {
            await tx.mediaAsset.deleteMany({
              where: { id: { in: assetLinks.map(({ assetId }) => assetId) } },
            });
          }
        });

        if (expenseEvidenceEntity) {
          await prisma.$transaction(async (tx) => {
            await tx.businessOwner.deleteMany({
              where: { legalEntityId: expenseEvidenceEntity.id },
            });
            await tx.businessLegalEntityWallet.deleteMany({
              where: { legalEntityId: expenseEvidenceEntity.id },
            });
            await tx.businessLegalEntity.delete({
              where: { id: expenseEvidenceEntity.id },
            });

            const companyIds = [
              expenseEvidenceEntity.companyId,
              expenseEvidencePayee?.id,
            ].filter((id): id is string => Boolean(id));
            await tx.counterparty.deleteMany({
              where: { companyId: { in: companyIds } },
            });
            await tx.company.deleteMany({ where: { id: { in: companyIds } } });
          });
        }
      } catch (error) {
        expenseCleanupError = error;
      }
    }

    if (prisma && existingAdminRoleSnapshots.length > 0) {
      await prisma.$transaction(
        existingAdminRoleSnapshots.map((snapshot) =>
          prisma.user.update({
            where: { id: snapshot.id },
            data: { roles: snapshot.roles },
          }),
        ),
      );
      existingAdminRoleSnapshots = [];
    }

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
    if (expenseCleanupError instanceof Error) throw expenseCleanupError;
    if (expenseCleanupError) {
      throw new Error("Expense fixture cleanup failed");
    }
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
          name: `Rental income ${runId}`,
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
          name: `Operating expense ${runId}`,
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
      name: rentalIncomeCategory.name,
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
      category: {
        id: rentalIncomeCategory.id,
        name: rentalIncomeCategory.name,
      },
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
          counterpartyUserId: customer.userId,
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
        name: "expense without category",
        input: {
          type: "EXPENSE",
          amount: "10.00",
          currency: "RON",
          financialScope: "COMPANY",
          paymentMethod: "CASH",
          billingStatus: "BILLED",
          idempotencyKey: `finance:${runId}:invalid-categoryless-expense`,
          postImmediately: true,
          balanceChanges: [
            {
              walletId: companyCashWallet.id,
              bucket: "BUSINESS_FUNDS",
              currency: "RON",
              amountDelta: "-10.00",
            },
          ],
          references: [],
        },
      },
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
    expect(claimsForSuiteAdmins(claimsResponse.body)).toEqual([
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
    expect(claimsForSuiteAdmins(settledClaimsResponse.body)).toEqual([]);

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
          counterpartyUserId: customer.userId,
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
          counterpartyUserId: customer.userId,
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
    expect(claimsForSuiteAdmins(netClaimsResponse.body)).toEqual([
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
    expect(claimsForSuiteAdmins(finalClaimsResponse.body)).toEqual([]);
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
          cardHolderUserId: null,
          cardHolder: null,
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
      [
        "id",
        "type",
        "name",
        "isActive",
        "owner",
        "cardHolderUserId",
        "cardHolder",
      ].sort(),
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
          cardHolderUserId: null,
          cardHolder: null,
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
    const unusualExpenseCategoryResponse = await authenticate(
      req()
        .post(v1.finance.ROUTES.categories.create)
        .send({
          name: `Other expenses ${runId}`,
          kind: "EXPENSE",
        }),
      admin,
    );
    expect(unusualExpenseCategoryResponse.status).toBe(201);
    const unusualExpenseCategory =
      unusualExpenseCategoryResponse.body as v1.finance.FinancialCategory;
    createdCategoryIds.push(unusualExpenseCategory.id);

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
            counterpartyUserId: customer.userId,
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
    const unusualExpense = await authenticate(
      req()
        .post(v1.finance.ROUTES.transactions.create)
        .send({
          type: "EXPENSE",
          amount: "5.00",
          currency: "EUR",
          financialScope: "COMPANY",
          paymentMethod: "CASH",
          billingStatus: "BILLED",
          categoryId: unusualExpenseCategory.id,
          occurredAt: "2026-01-01T11:00:00.000+02:00",
          idempotencyKey: `finance:${runId}:summary-unusual-expense`,
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
    expect(unusualExpense.status).toBe(201);

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
        category: {
          id: unusualExpenseCategory.id,
          code: unusualExpenseCategory.code,
          name: unusualExpenseCategory.name,
          kind: "EXPENSE",
        },
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

  it("keeps incomplete company-funded expenses editable as drafts", async () => {
    const draft = await createExpenseDraft({
      key: "incomplete-company-card-draft",
      source: "COMPANY_CARD",
    });

    expect(draft).toMatchObject({
      status: "DRAFT",
      payment: {
        source: "COMPANY_CARD",
        companyWalletId: expenseEvidenceCardWalletId,
      },
      documents: [],
    });
  });

  it("posts a cash expense attributed to an owner when matched fiscal evidence has a live original", async () => {
    const draft = await createExpenseDraft({
      key: "cash-owner-with-original",
      source: "COMPANY_CASH_DESK",
      target: "OWNER",
      documents: [
        {
          type: "FISCAL_RECEIPT",
          documentNumber: `CASH-${runId}`,
          issuedOn: "2040-01-15",
          buyerTaxIdentifier: expenseEvidenceTaxIdentifier,
          buyerCuiStatus: "MATCHED",
          reviewStatus: "CONFIRMED",
        },
      ],
    });
    const fiscalDocument = draft.documents[0];
    if (!fiscalDocument) throw new Error("Expected a fiscal document");
    await attachExpenseDocumentOriginal(
      fiscalDocument.id,
      "cash-owner-fiscal-original",
    );

    const response = await authenticate(
      req()
        .post(v1.finance.EXPENSE_ROUTES.post(draft.id))
        .send({
          idempotencyKey: `expense-e2e:${runId}:cash-owner-post`,
        }),
      admin,
    );

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: draft.id,
      status: "POSTED",
      payment: { source: "COMPANY_CASH_DESK" },
      costPool: {
        attribution: {
          target: "OWNER",
          businessOwnerId: expenseEvidenceOwner.id,
        },
      },
      postings: [{ role: "EXPENSE_PAYMENT" }],
    });
  });

  it("rejects a company-card post when its POS receipt has no live original", async () => {
    const draft = await createExpenseDraft({
      key: "card-missing-pos-original",
      source: "COMPANY_CARD",
      documents: [
        {
          type: "INVOICE",
          documentNumber: `CARD-${runId}`,
          issuedOn: "2040-01-15",
          buyerTaxIdentifier: expenseEvidenceTaxIdentifier,
          buyerCuiStatus: "MATCHED",
          reviewStatus: "CONFIRMED",
        },
        {
          type: "POS_RECEIPT",
          documentNumber: `POS-${runId}`,
          issuedOn: "2040-01-15",
          buyerCuiStatus: "NOT_APPLICABLE",
          reviewStatus: "CONFIRMED",
        },
      ],
    });
    const fiscalDocument = draft.documents.find(
      (document) => document.type === "INVOICE",
    );
    if (!fiscalDocument) throw new Error("Expected an invoice");
    await attachExpenseDocumentOriginal(
      fiscalDocument.id,
      "card-fiscal-original",
    );

    const response = await authenticate(
      req()
        .post(v1.finance.EXPENSE_ROUTES.post(draft.id))
        .send({ idempotencyKey: `expense-e2e:${runId}:card-post` }),
      admin,
    );

    expect(response.status).toBe(400);
    const errorBody = response.body as {
      error: { code: string; message: string };
    };
    expect(errorBody.error.code).toBe("BAD_REQUEST");
    expect(errorBody.error.message).toContain("POS receipt");
    expect(
      await prisma.expense.findUnique({
        where: { id: draft.id },
        select: { status: true },
      }),
    ).toEqual({ status: "DRAFT" });
  });

  it("posts a personal-funds expense without receipt evidence", async () => {
    const draft = await createExpenseDraft({
      key: "personal-no-evidence",
      source: "PERSONAL_FUNDS",
    });

    const response = await authenticate(
      req()
        .post(v1.finance.EXPENSE_ROUTES.post(draft.id))
        .send({ idempotencyKey: `expense-e2e:${runId}:personal-post` }),
      admin,
    );

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: "POSTED",
      payment: {
        source: "PERSONAL_FUNDS",
        fundedByUserId: admin.userId,
        fundingTreatment: "REIMBURSABLE",
      },
      documents: [],
      reimbursementClaim: {
        claimantUserId: admin.userId,
        status: "OPEN",
        originalAmount: "25.00",
      },
    });
  });

  it("rejects matched company-buyer evidence on a personal-funds expense", async () => {
    const draft = await createExpenseDraft({
      key: "personal-matched-buyer",
      source: "PERSONAL_FUNDS",
      documents: [
        {
          type: "FISCAL_RECEIPT",
          documentNumber: `PERSONAL-${runId}`,
          issuedOn: "2040-01-15",
          buyerTaxIdentifier: expenseEvidenceTaxIdentifier,
          buyerCuiStatus: "MATCHED",
          reviewStatus: "CONFIRMED",
        },
      ],
    });
    const fiscalDocument = draft.documents[0];
    if (!fiscalDocument) throw new Error("Expected a fiscal document");
    await attachExpenseDocumentOriginal(
      fiscalDocument.id,
      "personal-fiscal-original",
    );

    const response = await authenticate(
      req()
        .post(v1.finance.EXPENSE_ROUTES.post(draft.id))
        .send({
          idempotencyKey: `expense-e2e:${runId}:personal-matched-post`,
        }),
      admin,
    );

    expect(response.status).toBe(400);
    const errorBody = response.body as {
      error: { code: string; message: string };
    };
    expect(errorBody.error.code).toBe("BAD_REQUEST");
    expect(errorBody.error.message).toContain("matched company-buyer evidence");
    expect(
      await prisma.expense.findUnique({
        where: { id: draft.id },
        select: { status: true },
      }),
    ).toEqual({ status: "DRAFT" });
  });
});
