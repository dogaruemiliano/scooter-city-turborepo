import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompanyDetailActions } from "./CompanyDetailActions";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
    push: mocks.push,
  }),
}));

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.refresh.mockReset();
  mocks.replace.mockReset();
  mocks.push.mockReset();

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("CompanyDetailActions", () => {
  it("navigates to the edit page", async () => {
    const browser = userEvent.setup();

    renderActions();
    await browser.click(screen.getByRole("button", { name: "More actions" }));
    await browser.click(await screen.findByText("Edit company"));

    expect(mocks.push).toHaveBeenCalledWith(
      "/en/finance/companies/company-1/edit",
    );
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("asks for confirmation before deleting", async () => {
    const browser = userEvent.setup();

    renderActions();
    await browser.click(screen.getByRole("button", { name: "More actions" }));
    await browser.click(await screen.findByText("Delete company"));

    expect(await screen.findByText("Delete this company?")).toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("soft-deletes on confirm and returns to the list", async () => {
    mocks.apiFetch.mockResolvedValueOnce(undefined);
    const browser = userEvent.setup();

    renderActions();
    await browser.click(screen.getByRole("button", { name: "More actions" }));
    await browser.click(await screen.findByText("Delete company"));
    const dialog = await screen.findByRole("dialog");
    await browser.click(
      within(dialog).getByRole("button", { name: "Delete company" }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.finance.ROUTES.companies.delete("company-1"),
        v1.common.noContentSchema,
        { method: "DELETE" },
      ),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/en/finance/companies");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the dialog open and shows the error when deletion fails", async () => {
    mocks.apiFetch.mockRejectedValueOnce(new Error("boom"));
    const browser = userEvent.setup();

    renderActions();
    await browser.click(screen.getByRole("button", { name: "More actions" }));
    await browser.click(await screen.findByText("Delete company"));
    const dialog = await screen.findByRole("dialog");
    await browser.click(
      within(dialog).getByRole("button", { name: "Delete company" }),
    );

    expect(
      await within(dialog).findByText("Something went wrong. Try again."),
    ).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

function renderActions() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <CompanyDetailActions
        companyId="company-1"
        companiesHref="/en/finance/companies"
        editHref="/en/finance/companies/company-1/edit"
      />
    </NextIntlClientProvider>,
  );
}
