import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UrlFilterSheet } from "@/components/UrlFilterSheet";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

describe("UrlFilterSheet", () => {
  beforeEach(() => {
    mocks.push.mockReset();
  });

  it("applies non-empty values and resets to the base URL", async () => {
    const browser = userEvent.setup();

    render(
      <UrlFilterSheet
        appliedCount={2}
        applyLabel="Apply filters"
        baseHref="/finance/transactions"
        description="Narrow the transaction list."
        formId="transaction-filters"
        resetLabel="Reset filters"
        title="Filters"
      >
        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue="">
          <option value="">All</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <input name="from" type="date" defaultValue="2026-08-01" />
      </UrlFilterSheet>,
    );

    const trigger = screen.getByRole("button", { name: "Filters" });
    expect(trigger).toHaveTextContent("2");
    await browser.click(trigger);
    await browser.selectOptions(screen.getByLabelText("Status"), "COMPLETED");
    await browser.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(mocks.push).toHaveBeenCalledWith(
      "/finance/transactions?status=COMPLETED&from=2026-08-01",
    );

    await browser.click(screen.getByRole("button", { name: "Filters" }));
    await browser.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(mocks.push).toHaveBeenLastCalledWith("/finance/transactions");
  });
});
