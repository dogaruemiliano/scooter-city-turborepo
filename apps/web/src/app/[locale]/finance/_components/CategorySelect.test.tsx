import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CategorySelect } from "./CategorySelect";

const categories = [
  { id: "parent-1", label: "Operations", parentCategoryId: null },
  { id: "child-1", label: "Fuel", parentCategoryId: "parent-1" },
];

describe("CategorySelect", () => {
  it("focuses the search input when the sheet opens", async () => {
    const browser = userEvent.setup();

    render(
      <CategorySelect
        id="category"
        label="Category"
        value={null}
        onChange={vi.fn()}
        categories={categories}
      />,
    );

    await browser.click(screen.getByRole("button", { name: "Category" }));

    await waitFor(() =>
      expect(screen.getByPlaceholderText("Search categories")).toHaveFocus(),
    );
  });
});
