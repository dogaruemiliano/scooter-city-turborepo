import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { messages, type SupportedLocale } from "@repo/i18n";
import { TooltipProvider } from "@repo/ui/components/tooltip";
import { NextIntlClientProvider } from "next-intl";
import { useState, type AnchorHTMLAttributes, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell";
import { PageHeaderActions } from "./PageHeaderActions";
import { PageHeaderNavigation } from "./PageHeaderNavigation";
import { PageTitleOverride } from "./PageTitleOverride";
import { SessionProvider } from "./auth/SessionProvider";
import type { SessionIdentity } from "../lib/auth-types";

class TestPointerEvent extends MouseEvent {
  pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "";
  }
}

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  pathname: "/",
  back: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    back: mocks.back,
    push: mocks.push,
    refresh: mocks.refresh,
  }),
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
  mocks.apiFetch.mockReset();
  mocks.apiFetch.mockResolvedValue({});
  mocks.pathname = "/";
  mocks.back.mockReset();
  mocks.push.mockReset();
  mocks.refresh.mockReset();

  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1024,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      media: "",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: TestPointerEvent,
  });
});

describe("AppShell", () => {
  it("renders the application navigation and current user menu", async () => {
    renderAppShell();

    expect(
      screen
        .getAllByRole("link", { name: "Panou principal" })
        .map((link) => link.getAttribute("href")),
    ).toContain("/");
    expect(
      screen.queryByRole("link", { name: "Persoane" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Finanțe" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Portofelul meu" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Emilia Stone")).toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).getByText("Scooter City"),
    ).toBeInTheDocument();

    fireEvent.mouseDown(
      screen.getByRole("button", { name: "Deschide meniul contului" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "Setări cont" }),
    ).toHaveAttribute("href", "/account/settings");
    expect(screen.getByText("Temă")).toBeInTheDocument();
    expect(screen.getByText("Limbă")).toBeInTheDocument();
    expect(screen.getByText("Deconectare")).toBeInTheDocument();
  });

  it("uses profile names from the session in the current user menu", () => {
    renderAppShell({
      id: "user-1",
      email: "emilia.stone@example.com",
      roles: ["USER"],
      firstName: "Ada",
      lastName: "Lovelace",
    });

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(screen.queryByText("Emilia Stone")).not.toBeInTheDocument();
  });

  it("does not render the application shell on the sign-in route", () => {
    mocks.pathname = "/sign-in";

    renderAppShell();

    expect(screen.getByText("Page content")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Deschide meniul contului" }),
    ).not.toBeInTheDocument();
  });

  it("does not render the application shell on the English sign-in route", () => {
    mocks.pathname = "/en/sign-in";

    renderAppShell();

    expect(screen.getByText("Page content")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open account menu" }),
    ).not.toBeInTheDocument();
  });

  it("keeps navigation links on the English locale prefix", async () => {
    mocks.pathname = "/en";

    renderAppShell();

    expect(
      screen
        .getAllByRole("link", { name: "Dashboard" })
        .map((link) => link.getAttribute("href")),
    ).toContain("/en");

    fireEvent.mouseDown(
      screen.getByRole("button", { name: "Open account menu" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "Account settings" }),
    ).toHaveAttribute("href", "/en/account/settings");
  });

  it("layers an overlay behind the account menu", async () => {
    renderAppShell();

    expect(
      document.querySelector('[data-slot="account-menu-overlay"]'),
    ).not.toBeInTheDocument();

    fireEvent.mouseDown(
      screen.getByRole("button", { name: "Deschide meniul contului" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: /Limbă/ }),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="account-menu-overlay"]'),
    ).toHaveClass("z-overlay", "bg-scrim");
    expect(
      document.querySelector('[data-slot="account-menu-overlay"]')
        ?.parentElement,
    ).toHaveAttribute("data-slot", "sidebar-inner");
    expect(
      screen
        .getByRole("button", { name: "Deschide meniul contului" })
        .closest('[data-slot="sidebar-menu-item"]'),
    ).toHaveClass("z-modal");

    expect(
      document.querySelector('[data-slot="nested-menu-overlay"]'),
    ).not.toBeInTheDocument();
  });

  it("toggles the theme and language submenus closed on a second click", async () => {
    renderAppShell();

    fireEvent.mouseDown(
      screen.getByRole("button", { name: "Deschide meniul contului" }),
    );

    const themeTrigger = await screen.findByRole("menuitem", { name: /Temă/ });
    expect(themeTrigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.mouseDown(themeTrigger);
    await waitFor(() =>
      expect(themeTrigger).toHaveAttribute("aria-expanded", "true"),
    );

    fireEvent.mouseDown(themeTrigger);
    await waitFor(() =>
      expect(themeTrigger).toHaveAttribute("aria-expanded", "false"),
    );

    const languageTrigger = screen.getByRole("menuitem", { name: /Limbă/ });
    fireEvent.mouseDown(languageTrigger);
    await waitFor(() =>
      expect(languageTrigger).toHaveAttribute("aria-expanded", "true"),
    );

    fireEvent.mouseDown(languageTrigger);
    await waitFor(() =>
      expect(languageTrigger).toHaveAttribute("aria-expanded", "false"),
    );
  });

  it("closes the mobile drawer when a navigation link is pressed", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });

    renderAppShell({
      id: "admin-1",
      email: "admin@example.com",
      roles: ["ADMIN"],
    });

    const trigger = await screen.findByRole("button", {
      name: "Open navigation",
    });

    fireEvent.click(trigger);

    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "true"),
    );

    const personsLink = screen.getByRole("link", { name: "Persoane" });

    personsLink.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    fireEvent.click(personsLink);

    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "false"),
    );
  });

  it("shows a back button instead of the mobile navigation trigger on nested routes", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    mocks.pathname = "/persons/new";

    renderAppShell({
      id: "admin-1",
      email: "admin@example.com",
      roles: ["ADMIN"],
    });

    const backButton = await screen.findByRole("button", { name: "Înapoi" });

    expect(
      screen.queryByRole("button", { name: "Open navigation" }),
    ).not.toBeInTheDocument();

    fireEvent.click(backButton);

    expect(mocks.back).toHaveBeenCalledOnce();
  });

  it("keeps the mobile navigation trigger on routes listed in the sidebar", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    mocks.pathname = "/finance/operations";

    renderAppShell({
      id: "admin-1",
      email: "admin@example.com",
      roles: ["ADMIN"],
    });

    expect(
      await screen.findByRole("button", { name: "Open navigation" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Înapoi" }),
    ).not.toBeInTheDocument();
  });

  it("uses the latest page callbacks for mobile header navigation", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    mocks.pathname = "/persons/new";
    const onBack = vi.fn();
    const onForward = vi.fn();

    function Page() {
      const [value, setValue] = useState("initial");
      return (
        <>
          <PageHeaderNavigation
            onBack={() => onBack(value)}
            forwardAction={{
              onClick: () => onForward(value),
              label: "Return to review",
            }}
          />
          <button type="button" onClick={() => setValue("updated")}>
            Update form
          </button>
        </>
      );
    }

    renderAppShell(undefined, <Page />);

    const header = within(screen.getByRole("banner"));
    await header.findByRole("button", { name: "Return to review" });
    fireEvent.click(screen.getByRole("button", { name: "Update form" }));
    fireEvent.click(header.getByRole("button", { name: "Înapoi" }));
    fireEvent.click(header.getByRole("button", { name: "Return to review" }));

    expect(onBack).toHaveBeenCalledWith("updated");
    expect(onForward).toHaveBeenCalledWith("updated");
    expect(mocks.back).not.toHaveBeenCalled();
    expect(header.getByRole("button", { name: "Return to review" })).toBe(
      screen.getByRole("banner").lastElementChild?.firstElementChild,
    );
  });

  it("only shows the mobile forward action while the page provides one", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    mocks.pathname = "/persons/new";

    function Page() {
      const [isRevisiting, setIsRevisiting] = useState(false);
      return (
        <PageHeaderNavigation
          onBack={() => setIsRevisiting(true)}
          forwardAction={
            isRevisiting
              ? {
                  onClick: () => setIsRevisiting(false),
                  label: "Return to review",
                }
              : undefined
          }
        />
      );
    }

    renderAppShell(undefined, <Page />);
    const header = within(screen.getByRole("banner"));
    const back = await header.findByRole("button", { name: "Înapoi" });
    expect(
      header.queryByRole("button", { name: "Return to review" }),
    ).not.toBeInTheDocument();

    fireEvent.click(back);
    fireEvent.click(
      await header.findByRole("button", { name: "Return to review" }),
    );

    expect(
      header.queryByRole("button", { name: "Return to review" }),
    ).not.toBeInTheDocument();
    expect(mocks.back).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "disables mobile page navigation while busy (custom back: %s)",
    async (customBack) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: 390,
      });
      mocks.pathname = "/persons/new";
      const onBack = vi.fn();
      const onForward = vi.fn();

      renderAppShell(
        undefined,
        <PageHeaderNavigation
          onBack={customBack ? onBack : undefined}
          backDisabled
          forwardAction={{
            onClick: onForward,
            label: "Return to review",
            disabled: true,
          }}
        />,
      );

      const header = within(screen.getByRole("banner"));
      const back = await header.findByRole("button", { name: "Înapoi" });
      const forward = header.getByRole("button", { name: "Return to review" });
      expect(back).toBeDisabled();
      expect(forward).toBeDisabled();
      fireEvent.click(back);
      fireEvent.click(forward);

      expect(onBack).not.toHaveBeenCalled();
      expect(onForward).not.toHaveBeenCalled();
      expect(mocks.back).not.toHaveBeenCalled();
    },
  );

  it("restores route navigation when page controls unmount", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    mocks.pathname = "/persons/new";
    const onBack = vi.fn();

    function Page() {
      const [mounted, setMounted] = useState(true);
      return (
        <>
          {mounted ? (
            <PageHeaderNavigation
              onBack={onBack}
              forwardAction={{ onClick: vi.fn(), label: "Return to review" }}
            />
          ) : null}
          <button type="button" onClick={() => setMounted(false)}>
            Close form
          </button>
        </>
      );
    }

    renderAppShell(undefined, <Page />);
    const header = within(screen.getByRole("banner"));
    await header.findByRole("button", { name: "Return to review" });
    fireEvent.click(screen.getByRole("button", { name: "Close form" }));
    fireEvent.click(header.getByRole("button", { name: "Înapoi" }));

    expect(
      header.queryByRole("button", { name: "Return to review" }),
    ).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    expect(mocks.back).toHaveBeenCalledOnce();
  });

  it("keeps page navigation arrows out of the desktop header and content", () => {
    mocks.pathname = "/persons/new";

    renderAppShell(
      undefined,
      <PageHeaderNavigation
        onBack={vi.fn()}
        forwardAction={{ onClick: vi.fn(), label: "Return to review" }}
      />,
    );

    expect(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "Collapse sidebar",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Înapoi" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Return to review" }),
    ).not.toBeInTheDocument();
  });

  it("closes the mobile drawer when account settings is pressed in the account menu", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });

    renderAppShell();

    const trigger = await screen.findByRole("button", {
      name: "Open navigation",
    });

    fireEvent.click(trigger);

    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "true"),
    );

    fireEvent.mouseDown(
      screen.getByRole("button", { name: "Deschide meniul contului" }),
    );

    const settingsLink = await screen.findByRole("menuitem", {
      name: "Setări cont",
    });

    settingsLink.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    fireEvent.click(settingsLink);

    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "false"),
    );
  });

  it("renders company navigation for super admins", () => {
    mocks.pathname = "/persons";

    renderAppShell({
      id: "admin-1",
      email: "admin@example.com",
      roles: ["ADMIN", "SUPER_ADMIN"],
    });

    expect(screen.getByRole("link", { name: "Persoane" })).toHaveAttribute(
      "href",
      "/persons",
    );
    expect(
      within(screen.getByRole("banner")).getByText("Persoane"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Scutere" })).toHaveAttribute(
      "href",
      "/scooters",
    );
    expect(screen.getByRole("link", { name: "Service" })).toHaveAttribute(
      "href",
      "/service",
    );
    expect(
      screen.getByRole("link", { name: "Prezentare generală" }),
    ).toHaveAttribute("href", "/finance");
    expect(screen.queryByText("General")).not.toBeInTheDocument();
    expect(screen.getByText("Entități")).toBeInTheDocument();
    expect(screen.getAllByText("Scutere").length).toBeGreaterThan(0);
    expect(screen.getByText("Finanțe")).toBeInTheDocument();
    expect(screen.getByText("Firmă")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Setări" })).toHaveAttribute(
      "href",
      "/company/settings",
    );
    expect(screen.getByRole("link", { name: "Asociați" })).toHaveAttribute(
      "href",
      "/company/associates",
    );
  });

  it("hides company navigation from admins without the super-admin role", () => {
    renderAppShell({
      id: "admin-1",
      email: "admin@example.com",
      roles: ["ADMIN"],
    });

    expect(screen.queryByText("Firmă")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Setări" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Asociați" }),
    ).not.toBeInTheDocument();
  });

  it("renders finance navigation and static finance page titles for admins", () => {
    mocks.pathname = "/finance/accounts";

    renderAppShell({
      id: "admin-1",
      email: "admin@example.com",
      roles: ["ADMIN"],
    });

    expect(
      screen.getByRole("link", { name: "Prezentare generală" }),
    ).toHaveAttribute("href", "/finance");
    expect(screen.getByRole("link", { name: "Conturi" })).toHaveAttribute(
      "href",
      "/finance/accounts",
    );
    expect(screen.getByRole("link", { name: "Decontare" })).toHaveAttribute(
      "href",
      "/finance/settlement",
    );
    expect(
      within(screen.getByRole("banner")).getByText("Conturi"),
    ).toBeInTheDocument();
  });

  it("renders the camera expense route without application chrome", () => {
    mocks.pathname = "/en/finance/expenses/new";

    const { unmount } = renderAppShell({
      id: "admin-1",
      email: "admin@example.com",
      roles: ["ADMIN"],
    });

    expect(screen.getByText("Page content")).toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Overview" }),
    ).not.toBeInTheDocument();

    unmount();
    mocks.pathname = "/finance/expenses/new";

    renderAppShell({
      id: "admin-1",
      email: "admin@example.com",
      roles: ["ADMIN"],
    });

    expect(screen.getByText("Page content")).toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Prezentare generală" }),
    ).not.toBeInTheDocument();
  });

  it("renders expense-list and accounts page titles", () => {
    mocks.pathname = "/en/finance/expenses";

    const { unmount } = renderAppShell({
      id: "admin-1",
      email: "admin@example.com",
      roles: ["ADMIN"],
    });

    expect(
      within(screen.getByRole("banner")).getByText("Expenses"),
    ).toBeInTheDocument();

    unmount();
    mocks.pathname = "/finance/accounts";

    renderAppShell({
      id: "admin-1",
      email: "admin@example.com",
      roles: ["ADMIN"],
    });

    expect(
      within(screen.getByRole("banner")).getByText("Conturi"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Conturi" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("renders the finance settings title in the app header", () => {
    mocks.pathname = "/en/finance/settings";

    renderAppShell({
      id: "admin-1",
      email: "admin@example.com",
      roles: ["ADMIN"],
    });

    expect(
      within(screen.getByRole("banner")).getByText("Finance settings"),
    ).toBeInTheDocument();
  });

  it("uses finance detail titles for nested routes", () => {
    mocks.pathname = "/en/finance/operations/operation-1";

    renderAppShell({
      id: "admin-1",
      email: "admin@example.com",
      roles: ["ADMIN"],
    });

    expect(
      within(screen.getByRole("banner")).getByText("Operation details"),
    ).toBeInTheDocument();
  });

  it("renders the new person page title for admin nested person routes", () => {
    mocks.pathname = "/persons/new";

    renderAppShell({
      id: "admin-1",
      email: "admin@example.com",
      roles: ["ADMIN"],
    });

    expect(
      within(screen.getByRole("banner")).getByText("Adaugă persoană"),
    ).toBeInTheDocument();
  });

  it("renders the scooters navigation and page titles for admins", () => {
    mocks.pathname = "/scooters";

    renderAppShell({
      id: "admin-1",
      email: "admin@example.com",
      roles: ["ADMIN"],
    });

    expect(screen.getByRole("link", { name: "Scutere" })).toHaveAttribute(
      "href",
      "/scooters",
    );
    expect(
      within(screen.getByRole("banner")).getByText("Scutere"),
    ).toBeInTheDocument();

    mocks.pathname = "/scooters/new";
    renderAppShell({
      id: "admin-1",
      email: "admin@example.com",
      roles: ["ADMIN"],
    });

    expect(
      within(screen.getAllByRole("banner")[1]).getByText("Adaugă scuter"),
    ).toBeInTheDocument();
  });

  it("renders Service in operations and marks its route active", () => {
    mocks.pathname = "/service";

    renderAppShell({
      id: "admin-1",
      email: "admin@example.com",
      roles: ["ADMIN"],
    });

    expect(screen.getByRole("link", { name: "Service" })).toHaveAttribute(
      "href",
      "/service",
    );
    expect(screen.getByRole("link", { name: "Service" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(screen.getByRole("banner")).getByText("Service"),
    ).toBeInTheDocument();
  });

  it("renders a dynamic page title override", async () => {
    mocks.pathname = "/persons/person-1";

    renderAppShell(
      {
        id: "admin-1",
        email: "admin@example.com",
        roles: ["ADMIN"],
      },
      <>
        <PageTitleOverride title="Ada Lovelace" />
        <div>Page content</div>
      </>,
    );

    await waitFor(() =>
      expect(
        within(screen.getByRole("banner")).getByText("Ada Lovelace"),
      ).toBeInTheDocument(),
    );
  });

  it("renders page actions on the right side of the mobile header", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 375,
    });
    mocks.pathname = "/persons/person-1";

    renderAppShell(
      {
        id: "admin-1",
        email: "admin@example.com",
        roles: ["ADMIN"],
      },
      <>
        <PageTitleOverride title="Ada Lovelace" />
        <PageHeaderActions>
          <button type="button" aria-label="More actions">
            Actions
          </button>
        </PageHeaderActions>
        <div>Page content</div>
      </>,
    );

    const header = screen.getByRole("banner");
    await waitFor(() =>
      expect(
        within(header).getByRole("button", { name: "More actions" }),
      ).toBeInTheDocument(),
    );
    expect(within(header).getByRole("button", { name: "More actions" })).toBe(
      header.lastElementChild?.firstElementChild,
    );
  });
});

function renderAppShell(
  initialUser: SessionIdentity | null = {
    id: "user-1",
    email: "emilia.stone@example.com",
    roles: ["USER"],
  },
  children: ReactNode = <div>Page content</div>,
) {
  const locale: SupportedLocale = mocks.pathname.startsWith("/en")
    ? "en"
    : "ro";

  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <TooltipProvider>
        <SessionProvider initialUser={initialUser}>
          <AppShell initialThemePreference="system">{children}</AppShell>
        </SessionProvider>
      </TooltipProvider>
    </NextIntlClientProvider>,
  );
}

function prefixHref(href: string | undefined, locale: string): string {
  const safeHref = href ?? "/";
  return safeHref === "/" ? `/${locale}` : `/${locale}${safeHref}`;
}
