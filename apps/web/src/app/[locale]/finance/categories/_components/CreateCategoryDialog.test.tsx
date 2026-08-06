import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreateCategoryDialog } from "./CreateCategoryDialog";

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

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.refresh.mockReset();
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("CreateCategoryDialog", () => {
  it("creates a category without asking the user for an internal code", async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      id: "category-1",
      code: "RENTAL_INCOME",
      name: "Rental income",
      kind: "EXPENSE",
      parentCategoryId: null,
      isActive: true,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    });
    const browser = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <CreateCategoryDialog categories={[]} />
      </NextIntlClientProvider>,
    );

    await browser.click(
      screen.getByRole("button", { name: "Create category" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Create category",
    });
    expect(within(dialog).queryByLabelText("Code")).toBeNull();
    await browser.type(within(dialog).getByLabelText("Name"), "Rental income");
    await browser.click(
      within(dialog).getByRole("button", { name: "Create category" }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.finance.ROUTES.categories.create,
        v1.finance.financialCategorySchema,
        {
          method: "POST",
          json: {
            name: "Rental income",
            kind: "EXPENSE",
            icon: null,
            parentCategoryId: null,
          },
        },
      ),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
