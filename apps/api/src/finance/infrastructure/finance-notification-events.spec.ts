import type { PrismaService } from "../../prisma/prisma.service";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaFinanceBooksRepository } from "./prisma-finance-books.repository";
import { PrismaExpenseExtractionRepository } from "./prisma-expense-extraction.repository";

const operators = [true, false].map((isSuperAdmin) => ({
  id: isSuperAdmin ? "super-admin" : "ordinary-admin",
  firstName: "Staff",
  lastName: null,
  isSuperAdmin,
  accessRevision: 1,
  roleMemberships: [],
  permissionOverrides: [],
}));

function setup() {
  const tx = {
    user: {
      findMany: jest.fn().mockResolvedValue(operators),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    notificationEvent: {
      create: jest
        .fn<
          Promise<unknown>,
          [{ data: Prisma.NotificationEventUncheckedCreateInput }]
        >()
        .mockResolvedValue({ id: "event" }),
    },
    financeBook: { findUnique: jest.fn(), update: jest.fn() },
    financeLegalIdentity: { findUnique: jest.fn(), upsert: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((run: (db: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  } as unknown as PrismaService;
  return {
    tx,
    books: new PrismaFinanceBooksRepository(prisma),
    identities: new PrismaExpenseExtractionRepository(prisma),
  };
}

describe("finance configuration notification boundaries", () => {
  it("publishes a changed finance-book name in the same transaction, only to source-authorized super admins", async () => {
    const { tx, books } = setup();
    tx.financeBook.findUnique.mockResolvedValue({
      name: "Old",
      nameTranslations: {},
    });
    tx.financeBook.update.mockResolvedValue({
      id: "book",
      name: "New",
      nameTranslations: {},
      members: [],
    });
    await books.update("book", { names: { ro: "New" } }, "actor");
    expect(tx.notificationEvent.create.mock.calls[0][0].data).toMatchObject({
      type: "finance.book.updated",
      actorId: "actor",
      permissionKey: "super_admin",
      adminRecipientIds: ["super-admin"],
      subjectLabel: "New",
      changes: ["name"],
    });
  });

  it("does not create an event when book names were unchanged", async () => {
    const { tx, books } = setup();
    tx.financeBook.findUnique.mockResolvedValue({
      name: "Same",
      nameTranslations: {},
    });
    tx.financeBook.update.mockResolvedValue({
      id: "book",
      name: "Same",
      nameTranslations: {},
      members: [],
    });
    await books.update("book", { names: { ro: "Same" } }, "actor");
    expect(tx.notificationEvent.create).not.toHaveBeenCalled();
  });

  it("summarizes legal-identity changes without forwarding the identifiers", async () => {
    const { tx, identities } = setup();
    const input = {
      bookId: "book",
      legalName: "Company",
      normalizedLegalName: "COMPANY",
      taxIdentifier: "private-tax-id",
      normalizedTaxIdentifier: "PRIVATETAXID",
      nameAliases: [],
      countryCode: "RO",
    };
    tx.financeLegalIdentity.findUnique.mockResolvedValue(null);
    tx.financeLegalIdentity.upsert.mockResolvedValue({
      id: "identity",
      ...input,
    });
    await identities.upsertCompanyIdentity(input, "actor");
    const data = tx.notificationEvent.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      type: "finance.company.updated",
      permissionKey: "super_admin",
      adminRecipientIds: ["super-admin"],
    });
    expect(JSON.stringify(data)).not.toContain("private-tax-id");
  });

  it("propagates event persistence failure instead of reporting a successful configuration save", async () => {
    const { tx, books } = setup();
    tx.financeBook.findUnique.mockResolvedValue({
      name: "Old",
      nameTranslations: {},
    });
    tx.financeBook.update.mockResolvedValue({
      id: "book",
      name: "New",
      nameTranslations: {},
      members: [],
    });
    tx.notificationEvent.create.mockRejectedValue(
      new Error("event write failed"),
    );
    await expect(
      books.update("book", { names: { ro: "New" } }, "actor"),
    ).rejects.toThrow("event write failed");
  });
});
