import { categoryCodeFromName, categoryCodeFromPath } from "./category-code";

describe("categoryCodeFromName", () => {
  it.each([
    ["Rental income", "RENTAL_INCOME"],
    ["  Reparații și întreținere  ", "REPARATII_SI_INTRETINERE"],
    ["2026 permits", "CATEGORY_2026_PERMITS"],
  ])("generates a stable code from %s", (name, expected) => {
    expect(categoryCodeFromName(name)).toBe(expected);
  });

  it("generates a deterministic fallback for names without Latin characters", () => {
    const first = categoryCodeFromName("Транспорт");

    expect(first).toMatch(/^CATEGORY_[A-F0-9]{12}$/);
    expect(categoryCodeFromName("Транспорт")).toBe(first);
  });

  it("uses the category path to disambiguate duplicate display names", () => {
    expect(categoryCodeFromPath({ kind: "EXPENSE", name: "Financiar" })).toBe(
      "EXPENSE_FINANCIAR",
    );
    expect(categoryCodeFromPath({ kind: "INCOME", name: "Financiar" })).toBe(
      "INCOME_FINANCIAR",
    );
    expect(
      categoryCodeFromPath({
        kind: "INCOME",
        name: "Revizie",
        parentCode: "INCOME_SERVICE",
      }),
    ).toBe("INCOME_SERVICE_REVIZIE");
  });
});
