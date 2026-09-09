/**
 * Finance books, associates, chart of accounts, and reference data.
 *
 * Two associates own ScooterCity 50/50. They are seeded as ordinary `User`
 * rows with ADMIN — the finance module has no separate associate table, and
 * deliberately so: an associate is a user acting inside a finance book.
 *
 * Ledger accounts are not listed here. `provisionBookAccounts` and
 * `provisionAssociateAccounts` own the chart of accounts, so the seed and the
 * runtime path that adds a member create exactly the same accounts.
 *
 * Idempotent: every write is an upsert on a stable key.
 */
import { v1 } from "@repo/api-shared";

import {
  provisionAssociateAccounts,
  provisionBookAccounts,
} from "../../src/finance/infrastructure/finance-book.provisioner";
import type { PrismaClient } from "../../src/generated/prisma/client";

const FIXED_IDS = {
  companyBook: "seed-finance-book-company",
  poolBook: "seed-finance-book-pool",
  emiliano: "seed-user-emiliano",
  iusti: "seed-user-iusti",
} as const;

const HALF_SHARE_BASIS_POINTS = 5_000;

/** Shares run from a date safely before any seeded operation. */
const SHARES_VALID_FROM = new Date("2020-01-01T00:00:00.000Z");

interface AssociateSeed {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
}

const ASSOCIATES: readonly AssociateSeed[] = [
  {
    id: FIXED_IDS.emiliano,
    email: "seed-emiliano@example.com",
    firstName: "Emiliano",
    lastName: "Dogaru",
    displayName: "Emiliano",
  },
  {
    id: FIXED_IDS.iusti,
    email: "seed-iusti@example.com",
    firstName: "Iusti",
    lastName: "Popa",
    displayName: "Iusti",
  },
];

interface BookSeed {
  id: string;
  name: string;
  type: "COMPANY" | "ASSOCIATE_POOL";
}

const BOOKS: readonly BookSeed[] = [
  {
    id: FIXED_IDS.companyBook,
    name: "ScooterCity Company",
    type: "COMPANY",
  },
  {
    id: FIXED_IDS.poolBook,
    name: "ScooterCity Associate Pool",
    type: "ASSOCIATE_POOL",
  },
];

interface CategorySeed {
  code: string;
  name: string;
  defaultTreatment: "OPERATING_EXPENSE" | "CAPITAL_ASSET" | null;
}

/**
 * `defaultTreatment` only prefills the form. Fuel bought for an associate's
 * own car is still recorded as a non-operational company expense by choosing
 * that treatment explicitly — the category never decides it.
 */
const COMPANY_CATEGORIES: readonly CategorySeed[] = [
  { code: "FUEL", name: "Fuel", defaultTreatment: "OPERATING_EXPENSE" },
  { code: "REPAIRS", name: "Repairs", defaultTreatment: "OPERATING_EXPENSE" },
  { code: "PARTS", name: "Parts", defaultTreatment: "OPERATING_EXPENSE" },
  { code: "RENT", name: "Rent", defaultTreatment: "OPERATING_EXPENSE" },
  {
    code: "ACCOUNTING",
    name: "Accounting",
    defaultTreatment: "OPERATING_EXPENSE",
  },
  { code: "SOFTWARE", name: "Software", defaultTreatment: "OPERATING_EXPENSE" },
  {
    code: "INSURANCE",
    name: "Insurance",
    defaultTreatment: "OPERATING_EXPENSE",
  },
  {
    code: "ADVERTISING",
    name: "Advertising",
    defaultTreatment: "OPERATING_EXPENSE",
  },
  {
    code: "EQUIPMENT",
    name: "Equipment purchase",
    defaultTreatment: "CAPITAL_ASSET",
  },
  {
    code: "VEHICLE_PURCHASE",
    name: "Vehicle purchase",
    defaultTreatment: "CAPITAL_ASSET",
  },
  { code: "OTHER", name: "Other", defaultTreatment: null },
];

const POOL_CATEGORIES: readonly CategorySeed[] = [
  {
    code: "POOL_SHARED_COST",
    name: "Shared cost",
    defaultTreatment: null,
  },
  { code: "POOL_OTHER", name: "Other", defaultTreatment: null },
];

interface CostObjectSeed {
  code: string;
  name: string;
  type: "VEHICLE" | "OFFICE" | "FLEET" | "PROPERTY";
  ownershipType: "COMPANY" | "ASSOCIATE" | "SHARED";
  ownerKey?: keyof typeof FIXED_IDS;
  defaultAllocationType: "COMMON" | "ASSOCIATE_SPECIFIC" | null;
  defaultBeneficiaryKey?: keyof typeof FIXED_IDS;
}

/**
 * A personal vehicle owned by one associate defaults to allocating its
 * benefit to that associate — a prefill, not a rule. The user can change it,
 * and whatever they submit is what gets stored.
 */
const COMPANY_COST_OBJECTS: readonly CostObjectSeed[] = [
  {
    code: "VEHICLE_EMILIANO_PERSONAL",
    name: "Emiliano Personal Car",
    type: "VEHICLE",
    ownershipType: "ASSOCIATE",
    ownerKey: "emiliano",
    defaultAllocationType: "ASSOCIATE_SPECIFIC",
    defaultBeneficiaryKey: "emiliano",
  },
  {
    code: "VEHICLE_IUSTI_PERSONAL",
    name: "Iusti Personal Car",
    type: "VEHICLE",
    ownershipType: "ASSOCIATE",
    ownerKey: "iusti",
    defaultAllocationType: "ASSOCIATE_SPECIFIC",
    defaultBeneficiaryKey: "iusti",
  },
  {
    code: "VEHICLE_SHARED_VAN",
    name: "Shared Company Van",
    type: "VEHICLE",
    ownershipType: "COMPANY",
    defaultAllocationType: "COMMON",
  },
  {
    code: "OFFICE_BUCHAREST",
    name: "Bucharest Office",
    type: "OFFICE",
    ownershipType: "COMPANY",
    defaultAllocationType: "COMMON",
  },
  {
    code: "FLEET_GENERAL",
    name: "General Fleet",
    type: "FLEET",
    ownershipType: "COMPANY",
    defaultAllocationType: "COMMON",
  },
  {
    code: "PROPERTY_BUCHAREST_EMILIANO",
    name: "Bucharest Apartment — Emiliano",
    type: "PROPERTY",
    ownershipType: "ASSOCIATE",
    ownerKey: "emiliano",
    defaultAllocationType: "ASSOCIATE_SPECIFIC",
    defaultBeneficiaryKey: "emiliano",
  },
];

export async function seedFinance(prisma: PrismaClient): Promise<void> {
  for (const associate of ASSOCIATES) {
    await prisma.user.upsert({
      where: { id: associate.id },
      create: {
        id: associate.id,
        email: associate.email,
        firstName: associate.firstName,
        lastName: associate.lastName,
        roles: [v1.auth.AUTH_ROLES.ADMIN],
      },
      update: { roles: [v1.auth.AUTH_ROLES.ADMIN], deletedAt: null },
    });
  }

  for (const book of BOOKS) {
    await prisma.financeBook.upsert({
      where: { type: book.type },
      create: { id: book.id, name: book.name, type: book.type },
      update: { name: book.name },
    });

    const stored = await prisma.financeBook.findUniqueOrThrow({
      where: { type: book.type },
      select: { id: true },
    });

    await provisionBookAccounts(prisma, stored.id, book.type);

    for (const associate of ASSOCIATES) {
      await upsertMembership(prisma, stored.id, associate.id);
      await provisionAssociateAccounts(prisma, stored.id, book.type, associate);
    }

    const categories =
      book.type === "COMPANY" ? COMPANY_CATEGORIES : POOL_CATEGORIES;

    for (const category of categories) {
      await prisma.expenseCategory.upsert({
        where: { bookId_code: { bookId: stored.id, code: category.code } },
        create: {
          bookId: stored.id,
          code: category.code,
          name: category.name,
          defaultTreatment: category.defaultTreatment,
        },
        update: { name: category.name, isActive: true },
      });
    }

    if (book.type === "COMPANY") {
      for (const costObject of COMPANY_COST_OBJECTS) {
        await prisma.costObject.upsert({
          where: { bookId_code: { bookId: stored.id, code: costObject.code } },
          create: {
            bookId: stored.id,
            code: costObject.code,
            name: costObject.name,
            type: costObject.type,
            ownershipType: costObject.ownershipType,
            ownerAssociateId: costObject.ownerKey
              ? FIXED_IDS[costObject.ownerKey]
              : null,
            defaultAllocationType: costObject.defaultAllocationType,
            defaultBeneficiaryAssociateId: costObject.defaultBeneficiaryKey
              ? FIXED_IDS[costObject.defaultBeneficiaryKey]
              : null,
          },
          update: { name: costObject.name, isActive: true },
        });
      }
    }
  }
}

/**
 * Membership has no natural unique key — an associate can hold several
 * time-ranged rows as their share changes. The seed keeps exactly one open
 * row per associate per book.
 */
async function upsertMembership(
  prisma: PrismaClient,
  bookId: string,
  associateId: string,
): Promise<void> {
  const existing = await prisma.financeBookMember.findFirst({
    where: { bookId, associateId, validUntil: null },
    select: { id: true },
  });

  if (existing) {
    await prisma.financeBookMember.update({
      where: { id: existing.id },
      data: { shareBasisPoints: HALF_SHARE_BASIS_POINTS },
    });
    return;
  }

  await prisma.financeBookMember.create({
    data: {
      bookId,
      associateId,
      shareBasisPoints: HALF_SHARE_BASIS_POINTS,
      validFrom: SHARES_VALID_FROM,
    },
  });
}
