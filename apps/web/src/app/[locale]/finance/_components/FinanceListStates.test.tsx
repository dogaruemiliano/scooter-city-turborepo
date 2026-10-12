import { messages } from "@repo/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import FinanceListError from "./FinanceListError";
import FinanceListLoading from "./FinanceListLoading";

describe("finance list route states", () => {
  it("announces initial loading", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <FinanceListLoading />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      messages.en.shared.status.loading,
    );
  });

  it("retries fetching after a server error without exposing server details", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <FinanceListError
          error={new Error("internal server detail")}
          unstable_retry={retry}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      messages.en.shared.errors.generic,
    );
    expect(
      screen.queryByText("internal server detail"),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: messages.en.shared.actions.retry }),
    );
    expect(retry).toHaveBeenCalledOnce();
  });
});
