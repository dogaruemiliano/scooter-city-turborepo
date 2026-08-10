import { messages } from "@repo/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { BrandSelect } from "./BrandSelect";

vi.mock("@/lib/api", () => ({ webApi: { fetch: vi.fn() } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const brands = [
  {
    id: "brand-1",
    name: "Niu",
    code: "NIU",
    scooterCount: 0,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
  },
];

describe("BrandSelect", () => {
  it("focuses the search input when the sheet opens", async () => {
    const browser = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <BrandSelect
          id="brand"
          label="Brand"
          value=""
          onChange={vi.fn()}
          brands={brands}
        />
      </NextIntlClientProvider>,
    );

    await browser.click(screen.getByRole("button", { name: "Brand" }));

    await waitFor(() =>
      expect(
        screen.getByPlaceholderText(messages.en.scooters.brandPicker.search),
      ).toHaveFocus(),
    );
  });
});
