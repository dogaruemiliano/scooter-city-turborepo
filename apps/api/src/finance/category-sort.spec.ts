import { sortFinancialCategories } from "./category-sort";

describe("sortFinancialCategories", () => {
  it("sorts parents and descendants alphabetically by their full path", () => {
    const categories = [
      {
        id: "scooter-tires",
        kind: "EXPENSE",
        name: "Anvelope",
        parentCategoryId: "scooters",
      },
      {
        id: "company-utilities",
        kind: "EXPENSE",
        name: "Utilități",
        parentCategoryId: "company",
      },
      {
        id: "scooters",
        kind: "EXPENSE",
        name: "Scutere",
        parentCategoryId: null,
      },
      {
        id: "company-lawyer",
        kind: "EXPENSE",
        name: "Avocat",
        parentCategoryId: "company",
      },
      {
        id: "company",
        kind: "EXPENSE",
        name: "Companie",
        parentCategoryId: null,
      },
      {
        id: "cloud-openai",
        kind: "EXPENSE",
        name: "OpenAI",
        parentCategoryId: "company-cloud",
      },
      {
        id: "company-cloud",
        kind: "EXPENSE",
        name: "Cloud",
        parentCategoryId: "company",
      },
    ];

    expect(sortFinancialCategories(categories).map(({ id }) => id)).toEqual([
      "company",
      "company-lawyer",
      "company-cloud",
      "cloud-openai",
      "company-utilities",
      "scooters",
      "scooter-tires",
    ]);
  });

  it("does not mutate the source collection", () => {
    const categories = [
      { id: "b", kind: "EXPENSE", name: "B", parentCategoryId: null },
      { id: "a", kind: "EXPENSE", name: "A", parentCategoryId: null },
    ] as const;

    sortFinancialCategories(categories);

    expect(categories.map(({ id }) => id)).toEqual(["b", "a"]);
  });

  it("keeps equal parent names separated by financial kind", () => {
    const categories = [
      {
        id: "income-interest",
        kind: "INCOME",
        name: "Dobânzi",
        parentCategoryId: "income-financial",
      },
      {
        id: "expense-financial",
        kind: "EXPENSE",
        name: "Financiar",
        parentCategoryId: null,
      },
      {
        id: "income-financial",
        kind: "INCOME",
        name: "Financiar",
        parentCategoryId: null,
      },
      {
        id: "expense-fees",
        kind: "EXPENSE",
        name: "Comisioane bancare",
        parentCategoryId: "expense-financial",
      },
    ];

    expect(sortFinancialCategories(categories).map(({ id }) => id)).toEqual([
      "expense-financial",
      "expense-fees",
      "income-financial",
      "income-interest",
    ]);
  });
});
