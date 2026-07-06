import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageSwitcher } from "./LanguageSwitcher";

const mocks = vi.hoisted(() => ({
  pathname: "/account/settings",
  replace: vi.fn(),
  search: "tab=profile",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

type MockLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href?: string;
  locale?: string;
};

vi.mock("../i18n/navigation", () => ({
  Link({ href, locale, ...props }: MockLinkProps) {
    return <a href={locale ? prefixHref(href, locale) : href} {...props} />;
  },
  useRouter: () => ({
    replace: mocks.replace,
  }),
}));

beforeEach(() => {
  mocks.pathname = "/account/settings";
  mocks.replace.mockClear();
  mocks.search = "tab=profile";
});

describe("LanguageSwitcher", () => {
  it("renders a language select without a visible label", () => {
    renderLanguageSwitcher("ro");

    expect(screen.getByRole("combobox", { name: "Limbă" })).toBeInTheDocument();
    expect(screen.queryByText("Limbă")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Limbă" })).toHaveTextContent(
      "🇷🇴Română",
    );
  });

  it("preserves the current path while switching language", async () => {
    const browser = userEvent.setup();
    mocks.pathname = "/en/sign-in";
    mocks.search = "next=%2F";

    renderLanguageSwitcher("en");

    await browser.click(screen.getByRole("combobox", { name: "Language" }));
    await browser.click(
      await screen.findByRole("option", { name: "Romanian" }),
    );

    expect(mocks.replace).toHaveBeenCalledWith("/sign-in?next=%2F", {
      locale: "ro",
    });
  });
});

function renderLanguageSwitcher(locale: SupportedLocale) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <LanguageSwitcher />
    </NextIntlClientProvider>,
  );
}

function prefixHref(href: string | undefined, locale: string): string {
  const safeHref = href ?? "/";
  return safeHref === "/" ? `/${locale}` : `/${locale}${safeHref}`;
}
