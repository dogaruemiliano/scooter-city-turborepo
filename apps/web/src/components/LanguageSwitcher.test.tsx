import { messages, type SupportedLocale } from "@repo/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@repo/ui/components";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, useLocale } from "next-intl";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageMenuSub, LanguageSwitcher } from "./LanguageSwitcher";

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
    const currentLocale = useLocale();
    return <a href={prefixHref(href, locale ?? currentLocale)} {...props} />;
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
    const trigger = screen.getByRole("combobox", { name: "Limbă" });
    expect(trigger).not.toHaveTextContent("Română");
    expect(trigger).toHaveClass("border-0", "bg-transparent");
    expect(trigger.querySelector("img")).toHaveAttribute(
      "src",
      "/icons/flag-romania.svg",
    );
  });

  it("preserves the current path while switching language", async () => {
    const browser = userEvent.setup();
    mocks.pathname = "/en/sign-in";
    mocks.search = "next=%2F";

    renderLanguageSwitcher("en");

    await browser.click(screen.getByRole("combobox", { name: "Language" }));
    expect(
      await screen.findByRole("option", { name: "English" }),
    ).toHaveTextContent("English");
    await browser.click(
      await screen.findByRole("option", { name: "Romanian" }),
    );

    expect(mocks.replace).toHaveBeenCalledWith("/sign-in?next=%2F", {
      locale: "ro",
    });
  });

  it("does not navigate when selecting the current language", async () => {
    const browser = userEvent.setup();
    mocks.pathname = "/en";
    mocks.search = "";

    renderLanguageSwitcher("en");

    await browser.click(screen.getByRole("combobox", { name: "Language" }));
    await browser.click(await screen.findByRole("option", { name: "English" }));

    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe("LanguageMenuSub", () => {
  it.each([
    ["/en", "", "/en", "/ro"],
    [
      "/en/account/settings",
      "tab=profile",
      "/en/account/settings?tab=profile",
      "/ro/account/settings?tab=profile",
    ],
  ])(
    "does not duplicate the locale in links from %s",
    async (pathname, search, currentHref, otherHref) => {
      const browser = userEvent.setup();
      mocks.pathname = pathname;
      mocks.search = search;

      render(
        <NextIntlClientProvider locale="en" messages={messages.en}>
          <DropdownMenu>
            <DropdownMenuTrigger>Account</DropdownMenuTrigger>
            <DropdownMenuContent>
              <LanguageMenuSub />
            </DropdownMenuContent>
          </DropdownMenu>
        </NextIntlClientProvider>,
      );

      await browser.click(screen.getByRole("button", { name: "Account" }));
      await browser.click(
        await screen.findByRole("menuitem", { name: /Language/ }),
      );

      expect(
        await screen.findByRole("menuitemradio", {
          name: messages.en.language.current,
        }),
      ).toHaveAttribute("href", currentHref);
      expect(
        screen.getByRole("menuitemradio", { name: /Romanian/ }),
      ).toHaveAttribute("href", otherHref);
    },
  );
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
