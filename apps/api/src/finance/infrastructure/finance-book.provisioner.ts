/**
 * Creates the standard chart of accounts for a finance book.
 *
 * Two kinds of account exist:
 *
 * - **Book-wide** — the bank, the cash register, the expense and revenue
 *   accounts. One each per book.
 * - **Associate-scoped** — cash custody, payable, receivable, loan payable.
 *   One *set per member*. Adding an associate to a book has to create their
 *   accounts, because the posting policies resolve them by role and would
 *   otherwise fail at the moment somebody first pays for something.
 *
 * Every write is an upsert keyed on `(bookId, code)`, so this is safe to run
 * repeatedly — on every seed, and again whenever a member is added.
 *
 * Written against a plain client interface rather than `PrismaService` so the
 * standalone seed script can call it without bootstrapping NestJS.
 */
import { v1 } from "@repo/api-shared";

import type { PrismaClient } from "../../generated/prisma/client";

type Client = Pick<
  PrismaClient,
  "financeBook" | "ledgerAccount" | "financeBookMember" | "expenseCategory"
>;

interface AccountBlueprint {
  code: string;
  name: string;
  role: v1.finance.LedgerAccountRole;
  isDefault?: boolean;
}

/** Accounts every COMPANY book needs. */
const COMPANY_ACCOUNTS: readonly AccountBlueprint[] = [
  {
    code: "COMPANY_BANK_DEFAULT",
    name: "Default Company Bank",
    role: "BANK",
    isDefault: true,
  },
  {
    code: "COMPANY_CASH_REGISTER",
    name: "Company Cash Register",
    role: "CASH_REGISTER",
    isDefault: true,
  },
  {
    code: "COMPANY_OPERATING_EXPENSE",
    name: "Operating Expenses",
    role: "OPERATING_EXPENSE",
    isDefault: true,
  },
  {
    code: "COMPANY_NON_OPERATIONAL_EXPENSE",
    name: "Non-operational Company Expenses",
    role: "NON_OPERATIONAL_COMPANY_EXPENSE",
    isDefault: true,
  },
  {
    code: "COMPANY_FIXED_ASSET",
    name: "Fixed Assets",
    role: "FIXED_ASSET",
    isDefault: true,
  },
  {
    code: "COMPANY_CONTRIBUTED_CAPITAL",
    name: "Contributed Capital",
    role: "CONTRIBUTED_CAPITAL",
    isDefault: true,
  },
  {
    code: "COMPANY_RENTAL_REVENUE",
    name: "Rental Revenue",
    role: "RENTAL_REVENUE",
    isDefault: true,
  },
  {
    code: "COMPANY_SCOOTER_SALE_REVENUE",
    name: "Scooter Sale Revenue",
    role: "SCOOTER_SALE_REVENUE",
    isDefault: true,
  },
];

/** Accounts every ASSOCIATE_POOL book needs. */
const POOL_ACCOUNTS: readonly AccountBlueprint[] = [
  {
    code: "POOL_EXPENSE",
    name: "Associate Pool Expenses",
    role: "ASSOCIATE_POOL_EXPENSE",
    isDefault: true,
  },
  {
    code: "POOL_REVENUE",
    name: "Associate Pool Revenue",
    role: "ASSOCIATE_POOL_REVENUE",
    isDefault: true,
  },
];

/**
 * Per-member accounts, by book type.
 *
 * Company cash custody is worth pausing on: "Company Cash Held by Emiliano"
 * is a *company asset* that happens to be in Emiliano's pocket. It is not
 * Emiliano's money, and it is nothing like "Emiliano's personal funds" —
 * which is not an account at all, only a payment source.
 */
const COMPANY_MEMBER_ACCOUNTS: readonly Omit<AccountBlueprint, "isDefault">[] =
  [
    {
      code: "COMPANY_CASH_CUSTODY",
      name: "Company Cash Held by",
      role: "COMPANY_CASH_CUSTODY",
    },
    {
      code: "COMPANY_PAYABLE",
      name: "Payable to",
      role: "PAYABLE_TO_ASSOCIATE",
    },
    {
      code: "COMPANY_RECEIVABLE",
      name: "Receivable from",
      role: "RECEIVABLE_FROM_ASSOCIATE",
    },
    {
      code: "COMPANY_LOAN_PAYABLE",
      name: "Associate Loan Payable to",
      role: "ASSOCIATE_LOAN_PAYABLE",
    },
  ];

const POOL_MEMBER_ACCOUNTS: readonly Omit<AccountBlueprint, "isDefault">[] = [
  {
    code: "POOL_CASH_CUSTODY",
    name: "Pool Cash Held by",
    role: "ASSOCIATE_POOL_CASH_CUSTODY",
  },
  {
    code: "POOL_PAYABLE",
    name: "Pool Payable to",
    role: "PAYABLE_TO_ASSOCIATE",
  },
  {
    code: "POOL_RECEIVABLE",
    name: "Pool Receivable from",
    role: "RECEIVABLE_FROM_ASSOCIATE",
  },
];

export interface AssociateIdentity {
  id: string;
  /** Used to label the account, e.g. "Payable to Emiliano". */
  displayName: string;
}

/** Ensures a book's book-wide accounts exist. */
export async function provisionBookAccounts(
  client: Client,
  bookId: string,
  bookType: v1.finance.FinanceBookType,
): Promise<void> {
  const blueprints = bookType === "COMPANY" ? COMPANY_ACCOUNTS : POOL_ACCOUNTS;

  for (const blueprint of blueprints) {
    await upsertAccount(client, bookId, blueprint, null);
  }
}

/**
 * Ensures one associate's accounts exist in a book. Call this whenever an
 * associate becomes a member — without it, the first expense they pay for
 * fails with "no payable account for that associate".
 */
export async function provisionAssociateAccounts(
  client: Client,
  bookId: string,
  bookType: v1.finance.FinanceBookType,
  associate: AssociateIdentity,
): Promise<void> {
  const blueprints =
    bookType === "COMPANY" ? COMPANY_MEMBER_ACCOUNTS : POOL_MEMBER_ACCOUNTS;

  for (const blueprint of blueprints) {
    await upsertAccount(
      client,
      bookId,
      {
        code: `${blueprint.code}_${associate.id}`,
        name: `${blueprint.name} ${associate.displayName}`,
        role: blueprint.role,
      },
      associate.id,
    );
  }
}

async function upsertAccount(
  client: Client,
  bookId: string,
  blueprint: AccountBlueprint,
  associateId: string | null,
): Promise<void> {
  const category = v1.finance.LEDGER_ROLE_CATEGORY[blueprint.role];

  await client.ledgerAccount.upsert({
    where: { bookId_code: { bookId, code: blueprint.code } },
    // Names and defaults may be corrected over time; the role and category
    // must not change under postings that already reference the account.
    update: {
      name: blueprint.name,
      isDefault: blueprint.isDefault ?? false,
      isActive: true,
    },
    create: {
      bookId,
      code: blueprint.code,
      name: blueprint.name,
      category,
      role: blueprint.role,
      associateId,
      isDefault: blueprint.isDefault ?? false,
      isSystem: true,
    },
  });
}

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

/** Standard categories shared by initial setup and the development seed. */
export async function provisionBookCategories(
  client: Client,
  bookId: string,
  type: v1.finance.FinanceBookType,
): Promise<void> {
  for (const category of type === "COMPANY"
    ? COMPANY_CATEGORIES
    : POOL_CATEGORIES) {
    await client.expenseCategory.upsert({
      where: { bookId_code: { bookId, code: category.code } },
      create: { bookId, ...category },
      update: { name: category.name, isActive: true },
    });
  }
}
