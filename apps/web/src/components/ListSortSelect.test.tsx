import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ListSortSelect } from "./ListSortSelect";

describe("ListSortSelect", () => {
  it("shows every sort value in a content-sized popup and reports changes", async () => {
    const onValueChange = vi.fn();
    const browser = userEvent.setup();

    render(
      <ListSortSelect
        id="list-sort"
        label="Sort"
        value="newest"
        values={["newest", "leastRecentlyUpdated"]}
        getOptionLabel={(value) =>
          value === "newest" ? "Newest" : "Least recently updated"
        }
        onValueChange={onValueChange}
      />,
    );

    await browser.click(screen.getByRole("combobox", { name: "Sort" }));

    const longestOption = await screen.findByRole("option", {
      name: "Least recently updated",
    });
    const popup = longestOption.closest('[data-slot="select-content"]');

    expect(popup).toHaveClass(
      "w-max",
      "min-w-(--anchor-width)",
      "max-w-(--available-width)",
    );

    await browser.click(longestOption);

    expect(onValueChange).toHaveBeenCalledWith("leastRecentlyUpdated");
  });
});
