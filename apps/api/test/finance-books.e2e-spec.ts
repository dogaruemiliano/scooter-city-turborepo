/** Run only against a disposable database whose name starts with finance_books_test. */
import { INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { v1 } from "@repo/api-shared";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { CoreAuthService } from "../src/auth/modules/core-auth/core-auth.service";
import * as provisioner from "../src/finance/infrastructure/finance-book.provisioner";
import { PrismaService } from "../src/prisma/prisma.service";

const isolatedDatabase = new URL(process.env.DATABASE_URL!).pathname.startsWith(
  "/finance_books_test",
);
const describeIsolated = isolatedDatabase ? describe : describe.skip;

describeIsolated("Finance book management (isolated PostgreSQL)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerId: string;
  let companyId: string;
  let adminToken: string;
  let superToken: string;
  const server = () => app.getHttpServer() as Server;
  const input = {
    type: "COMPANY",
    names: { ro: "  Firma mea  ", en: " My company " },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    if (await prisma.financeBook.count())
      throw new Error("This suite requires a fresh disposable database.");
    const auth = app.get(CoreAuthService);
    const owner = await prisma.user.create({
      data: {
        email: "finance-owner@example.test",
        roles: ["ADMIN", "SUPER_ADMIN"],
      },
    });
    const admin = await prisma.user.create({
      data: { email: "finance-admin@example.test", roles: ["ADMIN"] },
    });
    ownerId = owner.id;
    superToken = (await auth.issueSession({ user: owner })).accessToken;
    adminToken = (await auth.issueSession({ user: admin })).accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  it("denies anonymous and ordinary admin writes", async () => {
    await request(server())
      .post(v1.finance.ROUTES.books)
      .send(input)
      .expect(401);
    await request(server())
      .post(v1.finance.ROUTES.books)
      .set("authorization", `Bearer ${adminToken}`)
      .send(input)
      .expect(403);
    await request(server())
      .put(v1.finance.ROUTES.book("missing"))
      .set("authorization", `Bearer ${adminToken}`)
      .send({ names: input.names })
      .expect(403);
  });

  it("rejects missing Romanian and pool setup before company setup", async () => {
    await request(server())
      .post(v1.finance.ROUTES.books)
      .set("authorization", `Bearer ${superToken}`)
      .send({ type: "COMPANY", names: { en: "Company" } })
      .expect(400);
    await request(server())
      .post(v1.finance.ROUTES.books)
      .set("authorization", `Bearer ${superToken}`)
      .send({ type: "COMPANY", names: { ro: "   " } })
      .expect(400);
    await request(server())
      .post(v1.finance.ROUTES.books)
      .set("authorization", `Bearer ${superToken}`)
      .send({ type: "ASSOCIATE_POOL", names: { ro: "Asociați" } })
      .expect(422);
    expect(await prisma.financeBook.count()).toBe(0);
  });

  it("rolls back the book and accounts if provisioning fails", async () => {
    const spy = jest
      .spyOn(provisioner, "provisionBookCategories")
      .mockRejectedValueOnce(new Error("Simulated setup failure"));
    try {
      await request(server())
        .post(v1.finance.ROUTES.books)
        .set("authorization", `Bearer ${superToken}`)
        .send(input)
        .expect(500);
      expect(await prisma.financeBook.count()).toBe(0);
      expect(await prisma.ledgerAccount.count()).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("creates a usable company book with its owner and reference data", async () => {
    const response = await request(server())
      .post(v1.finance.ROUTES.books)
      .set("authorization", `Bearer ${superToken}`)
      .send(input)
      .expect(201);
    const book = v1.finance.financeBookSchema.parse(response.body);
    companyId = book.id;
    expect(book.names).toEqual({ ro: "Firma mea", en: "My company" });
    expect(book.functionalCurrency).toBe("RON");
    expect(book.members).toEqual([
      expect.objectContaining({
        associateId: ownerId,
        shareBasisPoints: 10_000,
      }),
    ]);
    expect(
      await prisma.ledgerAccount.count({ where: { bookId: companyId } }),
    ).toBe(12);
    expect(
      await prisma.expenseCategory.count({ where: { bookId: companyId } }),
    ).toBe(11);
  });

  it("rejects duplicate types without changing the existing book", async () => {
    await request(server())
      .post(v1.finance.ROUTES.books)
      .set("authorization", `Bearer ${superToken}`)
      .send(input)
      .expect(409);
    expect(await prisma.financeBook.count()).toBe(1);
  });

  it("updates names, removes English, and rejects changes to type/currency", async () => {
    const response = await request(server())
      .put(v1.finance.ROUTES.book(companyId))
      .set("authorization", `Bearer ${superToken}`)
      .send({ names: { ro: "Registru nou", en: "" } })
      .expect(200);
    const book = v1.finance.financeBookSchema.parse(response.body);
    expect(book.names).toEqual({ ro: "Registru nou" });
    expect(v1.finance.financeBookName(book, "en")).toBe("Registru nou");
    await request(server())
      .put(v1.finance.ROUTES.book(companyId))
      .set("authorization", `Bearer ${superToken}`)
      .send({ names: { ro: "Alt nume" }, type: "ASSOCIATE_POOL" })
      .expect(400);
    await request(server())
      .put(v1.finance.ROUTES.book(companyId))
      .set("authorization", `Bearer ${superToken}`)
      .send({ names: { ro: "Alt nume" }, functionalCurrency: "EUR" })
      .expect(400);
    await request(server())
      .put(v1.finance.ROUTES.book("missing"))
      .set("authorization", `Bearer ${superToken}`)
      .send({ names: { ro: "Lipsă" } })
      .expect(404);
  });

  it("initializes pool memberships from the company's current shares", async () => {
    const partner = await prisma.user.create({
      data: { email: "finance-partner@example.test", roles: ["ADMIN"] },
    });
    await prisma.financeBookMember.updateMany({
      where: { bookId: companyId },
      data: { shareBasisPoints: 6_000 },
    });
    await prisma.financeBookMember.create({
      data: {
        bookId: companyId,
        associateId: partner.id,
        shareBasisPoints: 4_000,
        validFrom: new Date(),
      },
    });
    const response = await request(server())
      .post(v1.finance.ROUTES.books)
      .set("authorization", `Bearer ${superToken}`)
      .send({ type: "ASSOCIATE_POOL", names: { ro: "Asociați" } })
      .expect(201);
    const pool = v1.finance.financeBookSchema.parse(response.body);
    expect(pool.members).toHaveLength(2);
    expect(pool.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          associateId: ownerId,
          shareBasisPoints: 6_000,
        }),
        expect.objectContaining({
          associateId: partner.id,
          shareBasisPoints: 4_000,
        }),
      ]),
    );
    expect(
      await prisma.ledgerAccount.count({ where: { bookId: pool.id } }),
    ).toBe(8);
    expect(
      await prisma.expenseCategory.count({ where: { bookId: pool.id } }),
    ).toBe(2);
    const list = await request(server())
      .get(v1.finance.ROUTES.books)
      .set("authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(
      v1.finance.financeBookListSchema.parse(list.body).items,
    ).toHaveLength(2);
  });
});
