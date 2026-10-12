import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BrandTable } from "./BrandTable";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  refresh: vi.fn(),
  mayManage: true,
}));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.apiFetch } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({
    user: {
      effectiveScopes: mocks.mayManage
        ? { "scooter_brands.manage": ["ALL"] }
        : {},
    },
  }),
}));

const brand: v1.scooterBrands.ScooterBrand = {
  id: "brand-yamaha",
  name: "Yamaha",
  code: "YAM",
  scooterCount: 2,
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T10:00:00.000Z",
};

beforeEach(() => {
  mocks.mayManage = true;
  mocks.apiFetch.mockReset();
  mocks.refresh.mockReset();
});

describe("BrandTable", () => {
  it("renders one shared list and preserves edit access and deletion restrictions", async () => {
    const browser = userEvent.setup();
    renderBrands([brand]);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getAllByText("Yamaha")).toHaveLength(1);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete brand: Yamaha" }),
    ).toBeDisabled();
    await browser.click(
      screen.getByRole("button", { name: "Edit brand: Yamaha" }),
    );
    expect(screen.getByRole("dialog", { name: "Edit brand" })).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveValue("Yamaha");
  });

  it("renders read-only content without management actions", () => {
    mocks.mayManage = false;
    renderBrands([brand]);
    expect(screen.getByText("Yamaha")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

function renderBrands(brands: v1.scooterBrands.ScooterBrand[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <BrandTable brands={brands} />
    </NextIntlClientProvider>,
  );
}
