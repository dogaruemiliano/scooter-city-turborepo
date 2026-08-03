import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import ServiceError from "../error";
import ServiceLoading from "../loading";

describe("service route states", () => {
  it("renders a localized, accessible loading state", () => {
    const { container } = renderRouteState(<ServiceLoading />);

    expect(
      screen.getByLabelText("Loading fleet service status"),
    ).toHaveAttribute("aria-busy", "true");
    expect(
      container.querySelectorAll('[data-slot="skeleton"]'),
    ).not.toHaveLength(0);
  });

  it("renders an error state and retries the segment", async () => {
    const reset = vi.fn();
    const browser = userEvent.setup();

    renderRouteState(
      <ServiceError error={new Error("API unavailable")} reset={reset} />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Service could not be loaded",
    );
    await browser.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("renders Romanian Service error copy", () => {
    renderRouteState(
      <ServiceError error={new Error("API unavailable")} reset={vi.fn()} />,
      "ro",
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Pagina Service nu a putut fi încărcată",
    );
  });
});

function renderRouteState(element: ReactNode, locale: SupportedLocale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      {element}
    </NextIntlClientProvider>,
  );
}
