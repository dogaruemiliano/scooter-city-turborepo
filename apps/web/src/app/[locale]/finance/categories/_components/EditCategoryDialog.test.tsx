import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditCategoryDialog } from "./EditCategoryDialog";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
  }),
}));

const category: v1.finance.FinancialCategory = {
  id: "category-1",
  code: "RENTAL",
  name: "Rental income",
  kind: "INCOME",
  parentCategoryId: null,
  isActive: true,
  createdAt: "2026-07-29T08:00:00.000Z",
  updatedAt: "2026-07-29T08:00:00.000Z",
};

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.refresh.mockReset();
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("EditCategoryDialog", () => {
  it("validates and submits backend-supported category fields", async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ...category,
      name: "Scooter rental income",
    });
    const browser = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <EditCategoryDialog
          category={category}
          trigger={<button type="button">Rental income</button>}
          categories={[
            category,
            {
              ...category,
              id: "category-2",
              code: "OPERATIONS",
              name: "Operations",
            },
          ]}
        />
      </NextIntlClientProvider>,
    );

    await browser.click(
      screen.getByRole("button", {
        name: "Edit category: Rental income",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Edit category",
    });
    expect(
      within(dialog).queryByText(
        "Update the category name, kind, or place in the hierarchy.",
      ),
    ).toBeNull();
    expect(within(dialog).getAllByRole("radio")).toHaveLength(2);
    expect(
      within(dialog).queryByRole("radio", { name: "Income and expense" }),
    ).toBeNull();
    const name = within(dialog).getByLabelText("Name");
    await browser.clear(name);
    await browser.type(name, "Scooter rental income");
    await browser.click(within(dialog).getByRole("radio", { name: "Expense" }));
    await browser.click(within(dialog).getByRole("switch", { name: "Status" }));
    await browser.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.finance.ROUTES.categories.update(category.id),
        v1.finance.financialCategorySchema,
        {
          method: "PATCH",
          json: {
            name: "Scooter rental income",
            kind: "EXPENSE",
            isActive: false,
          },
        },
      ),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
