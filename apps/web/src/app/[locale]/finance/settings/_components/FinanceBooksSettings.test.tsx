import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceBooksSettings } from "./FinanceBooksSettings";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
const book: v1.finance.FinanceBook = {
  id: "company",
  name: "Registrul firmei",
  names: { ro: "Registrul firmei" },
  type: "COMPANY",
  functionalCurrency: "RON",
  members: [],
};
function setup(books: v1.finance.FinanceBook[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <FinanceBooksSettings initialBooks={books} />
    </NextIntlClientProvider>,
  );
}
beforeEach(() => vi.clearAllMocks());

describe("Finance book configuration", () => {
  it("requires Romanian, creates the company book, then enables pool setup", async () => {
    mocks.fetch.mockResolvedValue(book);
    setup();
    const user = userEvent.setup();
    const company = within(screen.getByRole("form", { name: "Company" }));
    const pool = within(screen.getByRole("form", { name: "Associate pool" }));
    expect(pool.getByRole("button", { name: "Create book" })).toBeDisabled();
    await user.click(company.getByRole("button", { name: "Create book" }));
    expect(mocks.fetch).not.toHaveBeenCalled();
    await user.type(
      company.getByRole("textbox", { name: /Name in Romanian/ }),
      "Registrul firmei",
    );
    await user.click(company.getByRole("button", { name: "Create book" }));
    await waitFor(() =>
      expect(
        company.getByRole("button", { name: "Save names" }),
      ).toBeDisabled(),
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      v1.finance.ROUTES.books,
      expect.anything(),
      {
        method: "POST",
        json: { type: "COMPANY", names: { ro: "Registrul firmei", en: "" } },
      },
    );
    expect(pool.getByRole("button", { name: "Create book" })).toBeEnabled();
    expect(
      screen.getByRole("heading", { name: "Registrul firmei" }),
    ).toBeInTheDocument();
  });

  it("edits English and supports clearing it to restore Romanian fallback", async () => {
    setup([{ ...book, names: { ro: book.name, en: "Company book" } }]);
    mocks.fetch.mockResolvedValue(book);
    const user = userEvent.setup();
    const company = within(screen.getByRole("form", { name: "Company" }));
    expect(
      screen.getByRole("heading", { name: "Company book" }),
    ).toBeInTheDocument();
    await user.clear(company.getByRole("textbox", { name: /Name in English/ }));
    await user.click(company.getByRole("button", { name: "Save names" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Registrul firmei" }),
      ).toBeInTheDocument(),
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      v1.finance.ROUTES.book(book.id),
      expect.anything(),
      { method: "PUT", json: { names: { ro: book.name, en: "" } } },
    );
  });

  it("preserves entered names when a request fails and allows retry", async () => {
    mocks.fetch.mockRejectedValue(new Error("offline"));
    setup();
    const user = userEvent.setup();
    const company = within(screen.getByRole("form", { name: "Company" }));
    await user.type(
      company.getByRole("textbox", { name: /Name in Romanian/ }),
      "Firma mea",
    );
    await user.click(company.getByRole("button", { name: "Create book" }));
    expect(
      await screen.findByText(messages.en.finance.configuration.saveFailed),
    ).toBeInTheDocument();
    expect(
      company.getByRole("textbox", { name: /Name in Romanian/ }),
    ).toHaveValue("Firma mea");
    expect(company.getByRole("button", { name: "Create book" })).toBeEnabled();
  });
});
