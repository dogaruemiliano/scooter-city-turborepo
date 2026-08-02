"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeftRightIcon,
  ArrowLeftIcon,
  BikeIcon,
  Building2Icon,
  ChartPieIcon,
  HandCoinsIcon,
  LayoutDashboardIcon,
  ReceiptTextIcon,
  Settings2Icon,
  TagsIcon,
  UsersRoundIcon,
  WalletCardsIcon,
  type LucideIcon,
} from "lucide-react";
import { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@repo/ui/components";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@repo/ui/components/sidebar";

import { useLogout } from "./auth/LogoutButton";
import { useSession } from "./auth/SessionProvider";
import { LanguageMenuSub } from "./LanguageSwitcher";
import { PageTitleOverrideContext } from "./PageTitleOverride";
import { webApi } from "../lib/api";
import { formatMoney } from "../lib/finance-format";
import {
  applyThemePreference,
  type ThemePreference,
} from "../lib/theme-cookie";
import type { SessionIdentity } from "../lib/auth-types";
import {
  getLocaleFromPathname,
  getUnprefixedPathname,
  isSignInPathname,
  localizePath,
} from "../i18n/paths";

const DASHBOARD_NAVIGATION_ITEM = {
  href: "/",
  labelKey: "dashboard",
  icon: LayoutDashboardIcon,
  exact: true,
} as const;

const NAVIGATION_GROUPS = [
  {
    labelKey: "operationsGroup",
    requiredRole: "ADMIN",
    items: [
      { href: "/persons", labelKey: "persons", icon: UsersRoundIcon },
      { href: "/scooters", labelKey: "scooters", icon: BikeIcon },
    ],
  },
  {
    labelKey: "financeGroup",
    requiredRole: "ADMIN",
    items: [
      {
        href: "/finance",
        labelKey: "financeOverview",
        icon: ChartPieIcon,
        exact: true,
      },
      {
        href: "/finance/transactions",
        labelKey: "financeTransactions",
        icon: ArrowLeftRightIcon,
      },
      {
        href: "/finance/expenses",
        labelKey: "financeExpenses",
        icon: ReceiptTextIcon,
      },
      {
        href: "/finance/companies",
        labelKey: "financeCompanies",
        icon: Building2Icon,
      },
      {
        href: "/finance/categories",
        labelKey: "financeCategories",
        icon: TagsIcon,
      },
      {
        href: "/finance/claims",
        labelKey: "financeClaims",
        icon: HandCoinsIcon,
      },
      {
        href: "/finance/settings/business",
        labelKey: "businessConfiguration",
        icon: Settings2Icon,
      },
    ],
  },
] as const;

const SIDEBAR_ROOT_ROUTES: ReadonlySet<string> = new Set([
  DASHBOARD_NAVIGATION_ITEM.href,
  ...NAVIGATION_GROUPS.flatMap((group) => group.items.map((item) => item.href)),
]);

const PAGE_TITLES: Record<string, string> = {
  "/": "dashboard",
  "/account/wallet": "myWallet",
  "/account/settings": "accountSettings",
  "/finance": "finance",
  "/finance/transactions": "financeTransactions",
  "/finance/transactions/new": "newFinanceTransaction",
  "/finance/expenses": "financeExpenses",
  "/finance/expenses/new": "newFinanceExpense",
  "/finance/settings/business": "financeBusinessSettings",
  "/finance/companies": "financeCompanies",
  "/finance/categories": "financeCategories",
  "/finance/claims": "financeClaims",
  "/persons": "persons",
  "/persons/new": "newPerson",
  "/scooters": "scooters",
  "/scooters/new": "newScooter",
};

export function AppShell({
  children,
  initialThemePreference,
}: {
  children: ReactNode;
  initialThemePreference: ThemePreference;
}) {
  const tPages = useTranslations("appShell.pages");
  const [pageTitleOverride, setPageTitleOverride] = useState<string | null>(
    null,
  );
  const pathname = usePathname();
  const routePathname = getUnprefixedPathname(pathname);
  const locale = getLocaleFromPathname(pathname);
  const pageTitleKey =
    PAGE_TITLES[routePathname] ?? getNestedFinancePageTitle(routePathname);
  const pageTitle =
    pageTitleOverride ?? (pageTitleKey ? tPages(pageTitleKey) : "Scooter City");

  if (isSignInPathname(pathname)) {
    return children;
  }

  return (
    <PageTitleOverrideContext.Provider value={setPageTitleOverride}>
      <SidebarProvider>
        <AppSidebar
          locale={locale}
          pathname={routePathname}
          initialThemePreference={initialThemePreference}
        />
        <SidebarInset>
          <header className="sticky top-0 z-sticky flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
            <HeaderNavigationButton pathname={routePathname} />
            <span className="text-sm font-medium">{pageTitle}</span>
          </header>
          <div className="flex flex-1 flex-col">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </PageTitleOverrideContext.Provider>
  );
}

function HeaderNavigationButton({ pathname }: { pathname: string }) {
  const t = useTranslations("appShell.actions");
  const router = useRouter();
  const { isMobile } = useSidebar();

  if (!isMobile || SIDEBAR_ROOT_ROUTES.has(pathname)) {
    return <SidebarTrigger />;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={t("back")}
      onClick={() => router.back()}
    >
      <ArrowLeftIcon aria-hidden="true" />
    </Button>
  );
}

function AppSidebar({
  locale,
  pathname,
  initialThemePreference,
}: {
  locale: SupportedLocale;
  pathname: string;
  initialThemePreference: ThemePreference;
}) {
  const tNav = useTranslations("appShell.nav");
  const { user } = useSession();
  const navigationGroups = NAVIGATION_GROUPS.filter(
    (group) =>
      !("requiredRole" in group) ||
      user?.roles.includes(group.requiredRole) === true,
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              aria-label={tNav("dashboard")}
              className="justify-start duration-normal ease-linear"
              render={<Link href={localizePath("/", locale)} />}
            >
              <span className="flex min-w-0 flex-1 items-center justify-start gap-2 overflow-hidden transition-[gap] duration-normal ease-linear group-data-[collapsible=icon]:gap-0">
                <span
                  className="flex h-8 w-16 shrink-0 items-center justify-center overflow-hidden transition-[width] duration-normal ease-linear group-data-[collapsible=icon]:w-8"
                  data-sidebar-logo-part="mark"
                >
                  <Image
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-contain"
                    data-sidebar-logo-theme="normal"
                    height={83}
                    src="/logo/scooter-city-logo-only-dark.svg"
                    unoptimized
                    width={224}
                  />
                  <Image
                    alt=""
                    aria-hidden="true"
                    className="hidden h-full w-full object-contain"
                    data-sidebar-logo-theme="light"
                    height={83}
                    src="/logo/scooter-city-logo-only-light.svg"
                    unoptimized
                    width={224}
                  />
                </span>
                <span
                  className="flex h-5 max-w-36 min-w-0 overflow-hidden opacity-100 transition-[max-width,opacity,transform] duration-normal ease-linear group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:-translate-x-1 group-data-[collapsible=icon]:opacity-0"
                  data-sidebar-logo-part="title"
                >
                  <Image
                    alt=""
                    aria-hidden="true"
                    className="h-full w-auto shrink-0 object-contain"
                    data-sidebar-logo-theme="normal"
                    height={52}
                    src="/logo/scooter-city-logo-title-tagline-only-dark.svg"
                    unoptimized
                    width={265}
                  />
                  <Image
                    alt=""
                    aria-hidden="true"
                    className="hidden h-full w-auto shrink-0 object-contain"
                    data-sidebar-logo-theme="light"
                    height={52}
                    src="/logo/scooter-city-logo-title-tagline-only-light.svg"
                    unoptimized
                    width={265}
                  />
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={tNav(DASHBOARD_NAVIGATION_ITEM.labelKey)}
                  isActive={isActiveNavigationItem(
                    pathname,
                    DASHBOARD_NAVIGATION_ITEM.href,
                    DASHBOARD_NAVIGATION_ITEM.exact,
                  )}
                  render={
                    <Link
                      href={localizePath(
                        DASHBOARD_NAVIGATION_ITEM.href,
                        locale,
                      )}
                    />
                  }
                >
                  <LayoutDashboardIcon aria-hidden="true" />
                  <span>{tNav(DASHBOARD_NAVIGATION_ITEM.labelKey)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {navigationGroups.map((group) => (
          <SidebarGroup key={group.labelKey}>
            <SidebarGroupLabel>{tNav(group.labelKey)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const label = tNav(item.labelKey);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        tooltip={label}
                        isActive={isActiveNavigationItem(
                          pathname,
                          item.href,
                          "exact" in item && item.exact,
                        )}
                        render={<Link href={localizePath(item.href, locale)} />}
                      >
                        <Icon aria-hidden="true" />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <AccountMenu
          key={user?.id ?? "signed-out"}
          locale={locale}
          initialThemePreference={initialThemePreference}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function isActiveNavigationItem(
  pathname: string,
  href: string,
  exact = false,
): boolean {
  return (
    pathname === href ||
    (!exact && href !== "/" && pathname.startsWith(`${href}/`))
  );
}

function AccountMenu({
  locale,
  initialThemePreference,
}: {
  locale: SupportedLocale;
  initialThemePreference: ThemePreference;
}) {
  const tAccount = useTranslations("appShell.accountMenu");
  const tTheme = useTranslations("theme");
  const tLogout = useTranslations("auth.logout");
  const { isMobile } = useSidebar();
  const { user } = useSession();
  const userId = user?.id;
  const { busy, logout } = useLogout();
  const [themePreference, setThemePreference] = useState(
    initialThemePreference,
  );
  const [personalWallet, setPersonalWallet] = useState<v1.finance.Wallet>();
  const [walletUnavailable, setWalletUnavailable] = useState(false);
  const email = user?.email ?? tAccount("noActiveSession");
  const displayName = user ? displayNameFromUser(user) : tAccount("account");
  const initials = user ? initialsFromUser(user) : "?";
  const personalBalance = personalWallet?.balances.find(
    (balance) => balance.bucket === "USER_SETTLEMENT",
  );
  const balanceSummary =
    walletUnavailable || (personalWallet && !personalBalance)
      ? tAccount("balanceUnavailable")
      : personalBalance
        ? tAccount("balanceValue", {
            amount: formatMoney(
              personalBalance.balance,
              personalBalance.currency,
              locale,
            ),
          })
        : tAccount("balanceLoading");

  useEffect(() => {
    if (!userId) {
      return;
    }

    const controller = new AbortController();

    void webApi
      .fetch(v1.finance.ROUTES.wallets.mine, v1.finance.walletSchema, {
        cache: "no-store",
        signal: controller.signal,
      })
      .then(setPersonalWallet)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setWalletUnavailable(true);
      });

    return () => controller.abort();
  }, [userId]);

  function changeTheme(nextPreference: unknown) {
    if (!isThemePreference(nextPreference)) {
      return;
    }

    applyThemePreference(nextPreference);
    setThemePreference(nextPreference);
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                aria-label={tAccount("open")}
                className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            <Avatar size="md">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{displayName}</span>
              <span className="truncate text-xs text-muted-foreground">
                {balanceSummary}
              </span>
            </span>
            <span className="ml-auto text-muted-foreground" aria-hidden="true">
              ...
            </span>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side={isMobile ? "bottom" : "right"}
            align="end"
            className="min-w-64"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col">
                <span className="truncate text-sm font-medium text-popover-foreground">
                  {displayName}
                </span>
                <span className="truncate font-normal">{email}</span>
              </DropdownMenuLabel>
              <AccountMenuLinkItem
                href={localizePath("/account/wallet", locale)}
                icon={WalletCardsIcon}
              >
                {tAccount("myWallet")}
              </AccountMenuLinkItem>
              <AccountMenuLinkItem
                href={localizePath("/account/settings", locale)}
                icon={Settings2Icon}
              >
                {tAccount("accountSettings")}
              </AccountMenuLinkItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  {tTheme("label")}
                  <span className="ml-auto capitalize text-muted-foreground">
                    {tTheme(`options.${themePreference}`)}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={themePreference}
                    onValueChange={changeTheme}
                  >
                    <DropdownMenuRadioItem value="light">
                      {tTheme("options.light")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">
                      {tTheme("options.dark")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system">
                      {tTheme("options.system")}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <LanguageMenuSub />
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={busy}
              onClick={() => void logout()}
            >
              {busy ? tLogout("busy") : tLogout("label")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function AccountMenuLinkItem({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  const { setOpenMobile } = useSidebar();

  return (
    <DropdownMenuItem
      onClick={() => setOpenMobile(false)}
      render={<Link href={href} />}
    >
      <Icon aria-hidden="true" />
      {children}
    </DropdownMenuItem>
  );
}

function getNestedFinancePageTitle(pathname: string): string | undefined {
  if (pathname.startsWith("/finance/transactions/")) {
    return "financeTransaction";
  }

  if (pathname.startsWith("/finance/wallets/")) {
    return "financeWallet";
  }

  return undefined;
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function displayNameFromUser(user: SessionIdentity): string {
  const parts = namePartsFromUser(user);
  if (parts.length > 0) {
    return parts.join(" ");
  }

  return displayNameFromEmail(user.email);
}

function initialsFromUser(user: SessionIdentity): string {
  const parts = namePartsFromUser(user);
  if (parts.length > 0) {
    return parts
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("");
  }

  return initialsFromEmail(user.email);
}

function namePartsFromUser(user: SessionIdentity): string[] {
  return [user.firstName, user.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
}

function displayNameFromEmail(email: string): string {
  return email
    .split("@", 1)[0]!
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

function initialsFromEmail(email: string): string {
  const parts = email
    .split("@", 1)[0]!
    .split(/[._-]+/)
    .filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
