import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CategoryTable } from "./CategoryTable";

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

const categories: v1.finance.FinancialCategory[] = [
  {
    id: "category-parent",
    code: "OPERATIONS",
    name: "Operations",
    kind: "EXPENSE",
    icon: null,
    keywords: [],
    parentCategoryId: null,
    isActive: true,
    createdAt: "2026-07-29T08:00:00.000Z",
    updatedAt: "2026-07-29T08:00:00.000Z",
  },
  {
    id: "category-child",
    code: "BATTERY_SERVICE",
    name: "Battery service",
    kind: "EXPENSE",
    icon: null,
    keywords: [],
    parentCategoryId: "category-parent",
    isActive: false,
    createdAt: "2026-07-29T08:00:00.000Z",
    updatedAt: "2026-07-29T08:00:00.000Z",
  },
];

function renderCategoryTable() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <CategoryTable categories={categories} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.refresh.mockReset();
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("CategoryTable", () => {
  it("provides a desktop table and a mobile category list", () => {
    renderCategoryTable();
    const desktopTable = screen.getByRole("table");
    const mobileList = screen.getByRole("list");

    expect(desktopTable.parentElement?.parentElement).toHaveClass(
      "hidden",
      "md:block",
    );
    expect(mobileList).toHaveClass("md:hidden");
    expect(within(mobileList).getByText("Battery service")).toBeVisible();
    expect(within(mobileList).getAllByText("Operations")).toHaveLength(2);
    expect(within(mobileList).queryByText("No parent category")).toBeNull();
    const parentCard = within(mobileList).getAllByRole("listitem")[0];
    expect(
      parentCard!.querySelector('[data-icon="hierarchy-root"]'),
    ).toBeInTheDocument();
    expect(within(parentCard!).getByText("Parent category")).toHaveClass(
      "sr-only",
    );
    expect(
      parentCard!.querySelector('[data-icon="hierarchy-connector"]'),
    ).not.toBeInTheDocument();
    const childCard = within(mobileList).getAllByRole("listitem")[1];
    expect(
      childCard!.querySelector('[data-icon="hierarchy-connector"]'),
    ).toBeInTheDocument();
    expect(
      childCard!.querySelector('[data-icon="hierarchy-root"]'),
    ).not.toBeInTheDocument();
    const childName = within(childCard!).getByText("Battery service");
    const childParent = within(childCard!).getByText("Operations");
    expect(
      childParent.compareDocumentPosition(childName) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(mobileList).queryByText("BATTERY_SERVICE")).toBeNull();
    expect(within(mobileList).getAllByText("Expense")[0]).toHaveClass(
      "bg-destructive-subtle",
      "text-destructive",
    );
    expect(within(mobileList).queryByText("Inactive")).toBeNull();
    expect(mobileList).not.toHaveTextContent("Status");
    expect(within(mobileList).queryByRole("switch")).toBeNull();
  });

  it("opens the category editor by pressing the mobile card", async () => {
    const browser = userEvent.setup();
    renderCategoryTable();
    const mobileList = screen.getByRole("list");

    await browser.click(
      within(mobileList).getByRole("button", {
        name: "Edit category: Battery service",
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Edit category",
    });
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "Battery service",
    );
    expect(
      within(dialog).getByRole("switch", { name: "Status" }),
    ).not.toBeChecked();
    expect(
      within(dialog).getByRole("radio", { name: "Expense" }),
    ).toBeChecked();
  });
});
