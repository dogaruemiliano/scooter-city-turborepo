import { messages } from "@repo/i18n";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultOperationFilters } from "../_lib/operation-list-query";
import { OperationFilters } from "./OperationFilters";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("page=5&kind=EXPENSE&view=ledger"),
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/finance/expenses",
  useRouter: () => ({ push: mocks.push }),
}));

function renderFilters() {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <OperationFilters
        value={{ ...defaultOperationFilters("EXPENSE"), status: "POSTED" }}
        books={[{ id: "company", name: "Company book", type: "COMPANY" }]}
        fixedKind="EXPENSE"
      />
    </NextIntlClientProvider>,
  );
}

describe("OperationFilters", () => {
  beforeEach(() => mocks.push.mockReset());

  it("uses nested sheets and commits only on Apply while retaining route scope", async () => {
    const user = userEvent.setup();
    renderFilters();
    await user.click(screen.getByRole("button", { name: "Filters" }));
    const filterSheet = screen.getByRole("dialog", { name: "Filters" });
    expect(filterSheet).toHaveClass("bg-popover");
    for (const surface of filterSheet.querySelectorAll(
      '[data-slot="bottom-sheet-content"], [data-slot="bottom-sheet-header"], [data-slot="bottom-sheet-body"], [data-slot="bottom-sheet-footer"]',
    )) {
      expect(surface).not.toHaveClass("bg-background");
    }
    await user.click(screen.getByRole("button", { name: "Status Posted" }));
    const statusSheet = screen.getByRole("dialog", { name: "Status" });
    await user.click(
      within(statusSheet).getByRole("button", { name: "Reversed" }),
    );
    expect(mocks.push).not.toHaveBeenCalled();
    const parent = await screen.findByRole("dialog", { name: "Filters" });
    expect(
      within(parent).getByRole("button", { name: "Status Reversed" }),
    ).toBeVisible();
    await user.click(
      within(parent).getByRole("button", {
        name: messages.en.shared.list.apply,
      }),
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalledOnce());
    const query = new URL(mocks.push.mock.calls[0]![0], "https://local.test")
      .searchParams;
    expect(query.get("status")).toBe("REVERSED");
    expect(query.get("kind")).toBe("EXPENSE");
    expect(query.get("view")).toBe("ledger");
    expect(query.has("page")).toBe(false);
  });

  it("discards reset on Cancel and keeps the fixed kind when reset is applied", async () => {
    const user = userEvent.setup();
    renderFilters();
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(
      screen.getByRole("button", { name: messages.en.shared.list.reset }),
    );
    expect(mocks.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("button", { name: "Status Posted" })).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: messages.en.shared.list.reset }),
    );
    await user.click(
      screen.getByRole("button", { name: messages.en.shared.list.apply }),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        "/finance/expenses?kind=EXPENSE&view=ledger",
      ),
    );
  });

  it("keeps an invalid date range open with a useful error", async () => {
    const user = userEvent.setup();
    renderFilters();
    await user.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(screen.getByLabelText("From (inclusive, UTC)"), {
      target: { value: "2026-10-03T12:00" },
    });
    fireEvent.change(screen.getByLabelText("Before (exclusive, UTC)"), {
      target: { value: "2026-10-01T12:00" },
    });
    await user.click(
      screen.getByRole("button", { name: messages.en.shared.list.apply }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      messages.en.finance.operations.filters.invalidRange,
    );
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeVisible();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("shows updating feedback while server navigation is pending", async () => {
    const user = userEvent.setup();
    let finishNavigation!: () => void;
    mocks.push.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishNavigation = resolve;
        }),
    );
    renderFilters();
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(
      screen.getByRole("button", { name: messages.en.shared.list.apply }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      messages.en.shared.status.refreshing,
    );
    expect(screen.getByRole("button", { name: "Filters" })).toBeDisabled();
    await act(async () => finishNavigation());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters" })).toBeEnabled();
  });

  it("disables unconfigured book types and replaces a book selection with its alternate selector", async () => {
    const user = userEvent.setup();
    renderFilters();
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(screen.getByRole("button", { name: "Book All" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Book" })).getByRole("button", {
        name: "Company book",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Book type All" }));
    const typeSheet = screen.getByRole("dialog", { name: "Book type" });
    expect(
      within(typeSheet).getByRole("button", { name: "Associate pool" }),
    ).toBeDisabled();
    await user.click(
      within(typeSheet).getByRole("button", { name: "Company" }),
    );
    expect(screen.getByRole("button", { name: "Book All" })).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: messages.en.shared.list.apply }),
    );
    const query = new URL(mocks.push.mock.calls[0]![0], "https://local.test")
      .searchParams;
    expect(query.get("bookType")).toBe("COMPANY");
    expect(query.has("bookId")).toBe(false);
  });
});
