import type { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { Button } from "@repo/ui/components";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { ExpenseSupplierPicker } from "./ExpenseSupplierPicker";

vi.mock("../_lib/expense-api", () => ({
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
}));

vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({
    user: { effectiveScopes: { "finance.suppliers.read": ["ALL"] } },
  }),
}));

const supplier: v1.finance.Supplier = {
  id: "supplier-one",
  name: "Parts company",
  taxIdentifier: "12345678",
  isVatPayer: false,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("Supplier selection permissions", () => {
  it("lets readers select a supplier without exposing create/edit and keeps the sheet surface distinct", async () => {
    const selected = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ExpenseSupplierPicker
          trigger={<Button>Supplier</Button>}
          initialSuppliers={[supplier]}
          selectedSupplierId={supplier.id}
          detectedName="New vendor"
          detectedTaxIdentifier="98765432"
          onSupplierChange={selected}
        />
      </NextIntlClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /supplier/i }));
    await screen.findByRole("dialog");
    const t = messages.en.finance.expense.captureSheet.supplierPicker;
    expect(
      screen.queryByRole("button", { name: t.add }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: t.save }),
    ).not.toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(dialog.classList.contains("bg-background")).toBe(false);
    for (const surface of dialog.querySelectorAll(
      '[data-slot^="bottom-sheet"]',
    )) {
      expect(surface.classList.contains("bg-background")).toBe(false);
    }
    await user.click(screen.getByRole("button", { name: /Parts company/ }));
    expect(selected).toHaveBeenCalledWith(supplier);
  });
});
