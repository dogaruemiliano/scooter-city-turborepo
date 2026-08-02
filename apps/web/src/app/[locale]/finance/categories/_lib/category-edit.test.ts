import type { v1 } from "@repo/api-shared";
import { describe, expect, it } from "vitest";

import { activeCategoryParentOptions } from "./category-edit";

const category = (
  id: string,
  isActive: boolean,
): v1.finance.FinancialCategory => ({
  id,
  code: id.toUpperCase(),
  name: `Category ${id}`,
  kind: "EXPENSE",
  parentCategoryId: null,
  isActive,
  createdAt: "2026-07-29T08:00:00.000Z",
  updatedAt: "2026-07-29T08:00:00.000Z",
});

describe("category edit parent options", () => {
  it("offers only active categories and excludes the edited category", () => {
    expect(
      activeCategoryParentOptions(
        [
          category("current", true),
          category("active-parent", true),
          category("inactive-parent", false),
        ],
        "current",
      ).map((item) => item.id),
    ).toEqual(["active-parent"]);
  });
});
