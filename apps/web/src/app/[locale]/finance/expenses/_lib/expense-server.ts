import "server-only";

import { v1 } from "@repo/api-shared";

import { webApi } from "@/lib/api";
import type {
  ExpenseCategoryOption,
  ExpenseEntityOption,
  ExpenseFormBootstrap,
  ExpenseOwnerOption,
  ExpenseUserOption,
  ExpenseVatPeriodOption,
} from "./expense-options";

export interface BusinessSetupCompanyOption {
  id: string;
  label: string;
  taxIdentifier: string | null;
}

export interface BusinessSetupVatPeriodOption extends ExpenseVatPeriodOption {
  countryCode: string;
}

export interface BusinessSetupBootstrap {
  companies: BusinessSetupCompanyOption[];
  entities: ExpenseEntityOption[];
  owners: ExpenseOwnerOption[];
  vatPeriods: BusinessSetupVatPeriodOption[];
  users: ExpenseUserOption[];
  usersNextCursor: string | null;
  today: string;
}

export async function loadExpenseFormBootstrap(options: {
  cookieHeader: string;
  currentUserId: string;
  today: string;
}): Promise<ExpenseFormBootstrap> {
  const headers = { cookie: options.cookieHeader };
  const usersQuery = new URLSearchParams({ pageSize: "100" });

  const [entities, users, categoryList] = await Promise.all([
    webApi.fetch(
      v1.finance.EXPENSE_ROUTES.options.entities,
      v1.finance.businessLegalEntityListSchema,
      { headers, cache: "no-store" },
    ),
    webApi.fetch(
      `${v1.finance.EXPENSE_ROUTES.options.users}?${usersQuery}`,
      v1.finance.expenseUserOptionListSchema,
      { headers, cache: "no-store" },
    ),
    webApi.fetch(
      v1.finance.ROUTES.categories.list,
      v1.finance.financialCategoryListSchema,
      { headers, cache: "no-store" },
    ),
  ]);
  const [ownerLists, vatPeriodLists] = await Promise.all([
    Promise.all(
      entities.items.map((entity) =>
        expenseOwnersForEntity(entity.id, options.cookieHeader),
      ),
    ),
    Promise.all(
      entities.items.map((entity) =>
        expenseVatPeriodsForEntity(entity.id, options.cookieHeader),
      ),
    ),
  ]);
  const owners = ownerLists.flatMap((list) => list.items);
  const vatPeriods = vatPeriodLists.flatMap((list) => list.items);
  const categoryById = new Map(
    categoryList.items.map((category) => [category.id, category]),
  );

  return {
    entities: entities.items.map(mapEntity),
    users: users.items.map(mapUser),
    owners: owners.map(mapOwner),
    categories: categoryList.items
      .filter((category) => category.isActive && category.kind === "EXPENSE")
      .map((category): ExpenseCategoryOption => {
        const parent = category.parentCategoryId
          ? categoryById.get(category.parentCategoryId)
          : undefined;
        return {
          id: category.id,
          label: parent ? `${parent.name} › ${category.name}` : category.name,
          parentCategoryId: category.parentCategoryId,
          icon: category.icon,
        };
      }),
    vatPeriods: vatPeriods.map(
      (period): ExpenseVatPeriodOption => ({
        id: period.id,
        legalEntityId: period.legalEntityId,
        vatNumber: period.vatNumber,
        effectiveFrom: period.effectiveFrom,
        effectiveTo: period.effectiveTo,
      }),
    ),
    currentUserId: options.currentUserId,
    today: options.today,
  };
}

export async function loadBusinessSetupBootstrap(options: {
  cookieHeader: string;
  today: string;
}): Promise<BusinessSetupBootstrap> {
  const headers = { cookie: options.cookieHeader };
  const [companies, users, entities] = await Promise.all([
    webApi.fetch(
      `${v1.finance.ROUTES.companies.list}?page=1&pageSize=100`,
      v1.finance.companyListSchema,
      { headers, cache: "no-store" },
    ),
    webApi.fetch(
      `${v1.finance.EXPENSE_ROUTES.options.users}?pageSize=20&purpose=BUSINESS_OWNER`,
      v1.finance.expenseUserOptionListSchema,
      { headers, cache: "no-store" },
    ),
    webApi.fetch(
      `${v1.finance.EXPENSE_ROUTES.options.entities}?includeInactive=true`,
      v1.finance.businessLegalEntityListSchema,
      { headers, cache: "no-store" },
    ),
  ]);
  const [ownerLists, vatPeriodLists] = await Promise.all([
    Promise.all(
      entities.items.map((entity) =>
        expenseOwnersForEntity(entity.id, options.cookieHeader),
      ),
    ),
    Promise.all(
      entities.items.map((entity) =>
        expenseVatPeriodsForEntity(entity.id, options.cookieHeader),
      ),
    ),
  ]);
  const owners = ownerLists.flatMap((list) => list.items);
  const vatPeriods = vatPeriodLists.flatMap((list) => list.items);

  return {
    companies: companies.items.map((company) => ({
      id: company.id,
      label: company.tradingName ?? company.legalName,
      taxIdentifier: company.taxIdentifier,
    })),
    entities: entities.items.map(mapEntity),
    owners: owners.map(mapOwner),
    vatPeriods: vatPeriods.map((period) => ({
      id: period.id,
      legalEntityId: period.legalEntityId,
      countryCode: period.countryCode,
      vatNumber: period.vatNumber,
      effectiveFrom: period.effectiveFrom,
      effectiveTo: period.effectiveTo,
    })),
    users: users.items.map(mapUser),
    usersNextCursor: users.nextCursor,
    today: options.today,
  };
}

function expenseOwnersForEntity(legalEntityId: string, cookieHeader: string) {
  const params = new URLSearchParams({
    legalEntityId,
  });
  return webApi.fetch(
    `${v1.finance.EXPENSE_ROUTES.options.owners}?${params}`,
    v1.finance.businessOwnerListSchema,
    { headers: { cookie: cookieHeader }, cache: "no-store" },
  );
}

function expenseVatPeriodsForEntity(
  legalEntityId: string,
  cookieHeader: string,
) {
  const params = new URLSearchParams({
    legalEntityId,
    includeInactive: "true",
  });
  return webApi.fetch(
    `${v1.finance.EXPENSE_ROUTES.options.vatPeriods}?${params}`,
    v1.finance.vatRegistrationPeriodListSchema,
    { headers: { cookie: cookieHeader }, cache: "no-store" },
  );
}

function mapEntity(
  entity: v1.finance.BusinessLegalEntity,
): ExpenseEntityOption {
  return {
    id: entity.id,
    label: entity.company.tradingName ?? entity.company.legalName,
    taxIdentifier: entity.company.taxIdentifier,
    defaultCurrency: entity.defaultCurrency,
    wallets: entity.wallets.map((wallet) => ({
      id: wallet.id,
      name: wallet.name,
      type: wallet.type,
    })),
  };
}

function mapUser(user: v1.finance.ExpenseUserOption): ExpenseUserOption {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return {
    id: user.id,
    label: name || user.email,
    email: user.email,
  };
}

function mapOwner(owner: v1.finance.BusinessOwner): ExpenseOwnerOption {
  const user = mapUser(owner.user);
  return {
    id: owner.id,
    legalEntityId: owner.legalEntityId,
    userId: owner.userId,
    label: user.label,
    email: user.email,
    effectiveFrom: owner.effectiveFrom,
    effectiveTo: owner.effectiveTo,
  };
}
