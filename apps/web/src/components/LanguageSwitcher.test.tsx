import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageSwitcher } from "./LanguageSwitcher";

const mocks = vi.hoisted(() => ({
  pathname: "/account/settings",
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
}));

beforeEach(() => {
  mocks.pathname = "/account/settings";
  mocks.search = "tab=profile";
});

describe("LanguageSwitcher", () => {
  it("preserves the current path while switching from Romanian", () => {
    renderLanguageSwitcher("ro");

    expect(screen.getByLabelText("Limbă")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Limba curentă" })).toHaveAttribute(
      "href",
      "/account/settings?tab=profile",
    );
    expect(
      screen.getByRole("link", { name: "Schimbă limba în Engleză" }),
    ).toHaveAttribute("href", "/en/account/settings?tab=profile");
  });

  it("uses a temporary Romanian prefix when switching from English", () => {
    mocks.pathname = "/en/sign-in";
    mocks.search = "next=%2F";

    renderLanguageSwitcher("en");

    expect(
      screen.getByRole("link", { name: "Switch language to Romanian" }),
    ).toHaveAttribute("href", "/ro/sign-in?next=%2F");
    expect(
      screen.getByRole("link", { name: "Current language" }),
    ).toHaveAttribute("href", "/en/sign-in?next=%2F");
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
