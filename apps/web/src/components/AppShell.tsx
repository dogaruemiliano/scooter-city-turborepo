"use client";

import { userAvatarSrc } from "@/lib/user-avatar";
import { canVisit, usesServiceDashboard } from "@/lib/access";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftRightIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BikeIcon,
  Building2Icon,
  ChartPieIcon,
  HandCoinsIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  MoreHorizontalIcon,
  ReceiptTextIcon,
  Settings2Icon,
  TagIcon,
  UsersRoundIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import type { SupportedLocale } from "@repo/i18n";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
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
import {
  PageHeaderActionsContext,
  type PageHeaderActionsContextValue,
} from "./PageHeaderActions";
import { useMobilePageScroll } from "./useMobilePageScroll";
import { PageTitleOverrideContext } from "./PageTitleOverride";
import {
  PageHeaderNavigationContext,
  type PageHeaderNavigationOptions,
} from "./PageHeaderNavigation";
import {
  applyThemePreference,
  isThemePreference,
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

const PRIMARY_NAVIGATION_ITEMS = [
  DASHBOARD_NAVIGATION_ITEM,
  { href: "/rentals", labelKey: "rentals", icon: BikeIcon },
  { href: "/my-rentals", labelKey: "myRentals", icon: BikeIcon },
  { href: "/persons", labelKey: "persons", icon: UsersRoundIcon },
  { href: "/problems", labelKey: "problems", icon: WrenchIcon },
] as const;

const NAVIGATION_GROUPS = [
  {
    labelKey: "scootersGroup",
    items: [
      { href: "/scooters", labelKey: "scooterList", icon: BikeIcon },
      { href: "/scooters/brands", labelKey: "scooterBrands", icon: TagIcon },
    ],
  },
  {
    labelKey: "financeGroup",
    items: [
      {
        href: "/finance",
        labelKey: "financeOverview",
        icon: ChartPieIcon,
        exact: true,
      },
      {
        href: "/finance/expenses",
        labelKey: "financeExpenses",
        icon: ReceiptTextIcon,
      },
      {
        href: "/finance/operations",
        labelKey: "financeOperations",
        icon: ArrowLeftRightIcon,
      },
      {
        href: "/finance/accounts",
        labelKey: "financeAccounts",
        icon: LandmarkIcon,
      },
      {
        href: "/finance/settlement",
        labelKey: "financeSettlement",
        icon: HandCoinsIcon,
      },
      {
        href: "/finance/settings",
        labelKey: "financeSettings",
        icon: Settings2Icon,
      },
    ],
  },
  {
    labelKey: "companyGroup",
    items: [
      {
        href: "/company/settings",
        labelKey: "companySettings",
        icon: Building2Icon,
      },
      {
        href: "/company/associates",
        labelKey: "companyAssociates",
        icon: UsersRoundIcon,
      },
    ],
  },
  {
    labelKey: "accessGroup",
    items: [
      { href: "/users", labelKey: "users", icon: UsersRoundIcon },
      { href: "/roles", labelKey: "roles", icon: Settings2Icon },
    ],
  },
] as const;

const SIDEBAR_ROOT_ROUTES: ReadonlySet<string> = new Set([
  ...PRIMARY_NAVIGATION_ITEMS.map((item) => item.href),
  ...NAVIGATION_GROUPS.flatMap((group) => group.items.map((item) => item.href)),
]);

const IMMERSIVE_ROUTES: ReadonlySet<string> = new Set([
  "/finance/expenses/new",
]);

const ALL_NAVIGATION_HREFS: readonly string[] = [
  ...PRIMARY_NAVIGATION_ITEMS.map((item) => item.href),
  ...NAVIGATION_GROUPS.flatMap((group) => group.items.map((item) => item.href)),
];

const PAGE_TITLES: Record<string, string> = {
  "/": "dashboard",
  "/account/settings": "accountSettings",
  "/finance": "finance",
  "/finance/expenses": "financeExpenses",
  "/finance/expenses/new": "newFinanceExpense",
  "/finance/expenses/new/manual": "newFinanceExpenseManual",
  "/finance/funding/new": "newFinanceFunding",
  "/finance/operations": "financeOperations",
  "/finance/accounts": "financeAccounts",
  "/finance/settings": "financeSettings",
  "/finance/settlement": "financeSettlement",
  "/company/settings": "companySettings",
  "/company/associates": "companyAssociates",
  "/persons": "persons",
  "/persons/new": "newPerson",
  "/rentals/new": "newRental",
  "/users/new": "newUser",
  "/scooters": "scooters",
  "/scooters/new": "newScooter",
  "/scooters/brands": "scooterBrands",
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

  const standalone =
    isSignInPathname(pathname) || IMMERSIVE_ROUTES.has(routePathname);
  const [pageScrollRef, onPageScroll] = useMobilePageScroll(
    pathname,
    !standalone,
  );

  if (standalone) {
    return children;
  }

  return (
    <PageTitleOverrideContext.Provider value={setPageTitleOverride}>
      <SidebarProvider
        data-app-shell=""
        className="[--sticky-content-top:0] md:[--sticky-content-top:var(--spacing-16)] fixed inset-0 h-dvh min-h-0 overflow-hidden overscroll-none md:relative md:inset-auto md:h-auto md:min-h-svh md:overflow-visible"
      >
        <AppShellContent
          locale={locale}
          pathname={routePathname}
          pageTitle={pageTitle}
          pageScrollRef={pageScrollRef}
          onPageScroll={onPageScroll}
          initialThemePreference={initialThemePreference}
        >
          {children}
        </AppShellContent>
      </SidebarProvider>
    </PageTitleOverrideContext.Provider>
  );
}

function AppShellContent({
  children,
  locale,
  pathname,
  pageTitle,
  pageScrollRef,
  onPageScroll,
  initialThemePreference,
}: {
  children: ReactNode;
  locale: SupportedLocale;
  pathname: string;
  pageTitle: string;
  pageScrollRef: ReturnType<typeof useMobilePageScroll>[0];
  onPageScroll: ReturnType<typeof useMobilePageScroll>[1];
  initialThemePreference: ThemePreference;
}) {
  const { isMobile } = useSidebar();
  const [pageHeaderActionsTarget, setPageHeaderActionsTarget] =
    useState<HTMLDivElement | null>(null);
  const pageHeaderActionsContext = useMemo<PageHeaderActionsContextValue>(
    () => ({ isMobile, target: pageHeaderActionsTarget }),
    [isMobile, pageHeaderActionsTarget],
  );
  const [headerNavigation, setHeaderNavigation] = useState<
    (PageHeaderNavigationOptions & { pathname: string }) | null
  >(null);
  const registerHeaderNavigation = useCallback(
    (options: PageHeaderNavigationOptions) => {
      const registration = { ...options, pathname };
      setHeaderNavigation(registration);

      return () => {
        setHeaderNavigation((current) =>
          current === registration ? null : current,
        );
      };
    },
    [pathname],
  );
  const navigation =
    headerNavigation?.pathname === pathname ? headerNavigation : undefined;
  const forwardAction = isMobile ? navigation?.forwardAction : undefined;

  return (
    <PageHeaderNavigationContext.Provider value={registerHeaderNavigation}>
      <PageHeaderActionsContext.Provider value={pageHeaderActionsContext}>
        <AppSidebar
          locale={locale}
          pathname={pathname}
          initialThemePreference={initialThemePreference}
        />
        <SidebarInset
          as="div"
          className="min-h-0 min-w-0 overflow-hidden md:overflow-visible"
        >
          <header className="relative z-sticky flex h-[calc(var(--spacing-16)+env(safe-area-inset-top))] shrink-0 items-center gap-3 border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)] md:sticky md:top-0 md:h-16 md:px-8 md:pt-0">
            <HeaderNavigationButton
              pathname={pathname}
              navigation={navigation}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {pageTitle}
            </span>
            <div
              ref={setPageHeaderActionsTarget}
              className="ml-auto flex shrink-0 gap-2 md:hidden"
            >
              {forwardAction ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={forwardAction.label}
                  disabled={forwardAction.disabled}
                  onClick={forwardAction.onClick}
                >
                  <ArrowRightIcon aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </header>
          <div
            ref={pageScrollRef}
            data-slot="app-page-scroll"
            onScroll={onPageScroll}
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain pb-[calc(var(--spacing-screen-bottom)+env(safe-area-inset-bottom))] md:overflow-visible md:overscroll-auto"
          >
            {children}
          </div>
        </SidebarInset>
      </PageHeaderActionsContext.Provider>
    </PageHeaderNavigationContext.Provider>
  );
}

function HeaderNavigationButton({
  pathname,
  navigation,
}: {
  pathname: string;
  navigation?: PageHeaderNavigationOptions;
}) {
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
      disabled={navigation?.backDisabled}
      onClick={navigation?.onBack ?? (() => router.back())}
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
  const serviceDashboard = usesServiceDashboard(user);
  // The mobile drawer unmounts AccountMenu when closed; keep the preference here.
  const [themePreference, setThemePreference] = useState(
    initialThemePreference,
  );

  function changeTheme(nextPreference: unknown) {
    if (!isThemePreference(nextPreference)) {
      return;
    }

    applyThemePreference(nextPreference);
    setThemePreference(nextPreference);
  }

  const primaryItems = PRIMARY_NAVIGATION_ITEMS.filter((item) =>
    serviceDashboard
      ? item.href === "/problems"
      : item.href === "/" || canVisit(user, item.href),
  );

  const navigationGroups = NAVIGATION_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !serviceDashboard && canVisit(user, item.href),
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border md:h-16 md:shrink-0 md:justify-center">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              aria-label={tNav(serviceDashboard ? "problems" : "dashboard")}
              className="justify-start duration-normal ease-linear"
              render={
                <Link
                  href={localizePath(
                    serviceDashboard ? "/problems" : "/",
                    locale,
                  )}
                />
              }
            >
              <span className="flex min-w-0 flex-1 items-center justify-start gap-2 overflow-hidden">
                <span
                  className="flex h-8 w-16 shrink-0 items-center justify-center overflow-hidden md:w-8"
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
                  className="flex h-5 w-36 shrink-0 overflow-hidden"
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
              {primaryItems.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      tooltip={tNav(item.labelKey)}
                      isActive={isActiveNavigationItem(
                        pathname,
                        item.href,
                        "exact" in item && item.exact,
                      )}
                      render={<Link href={localizePath(item.href, locale)} />}
                    >
                      <Icon aria-hidden="true" />
                      <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
                        {tNav(item.labelKey)}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {navigationGroups.map((group) => (
          <SidebarGroup key={group.labelKey}>
            <SidebarGroupLabel className="relative overflow-hidden group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:opacity-100 motion-reduce:transition-none">
              <span className="shrink-0 origin-center whitespace-nowrap transition-[transform,opacity] duration-normal ease-linear group-data-[collapsible=icon]:scale-y-0 group-data-[collapsible=icon]:opacity-0 motion-reduce:transition-none">
                {tNav(group.labelKey)}
              </span>
              <span
                aria-hidden="true"
                data-slot="sidebar-group-divider"
                className="absolute inset-x-2 h-px origin-center scale-x-0 bg-sidebar-border opacity-0 transition-[transform,opacity] duration-normal ease-linear group-data-[collapsible=icon]:scale-x-100 group-data-[collapsible=icon]:opacity-100 motion-reduce:transition-none"
              />
            </SidebarGroupLabel>
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
                        <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
                          {label}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <AccountMenu
          key={user?.id ?? "signed-out"}
          locale={locale}
          themePreference={themePreference}
          onThemeChange={changeTheme}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function matchesHref(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function getBestMatchingHref(pathname: string): string | null {
  let best: string | null = null;
  for (const href of ALL_NAVIGATION_HREFS) {
    if (
      matchesHref(pathname, href) &&
      (best === null || href.length > best.length)
    ) {
      best = href;
    }
  }
  return best;
}

function isActiveNavigationItem(
  pathname: string,
  href: string,
  exact = false,
): boolean {
  if (exact) {
    return pathname === href;
  }
  return getBestMatchingHref(pathname) === href;
}

function AccountMenu({
  locale,
  themePreference,
  onThemeChange,
}: {
  locale: SupportedLocale;
  themePreference: ThemePreference;
  onThemeChange: (preference: unknown) => void;
}) {
  const tAccount = useTranslations("appShell.accountMenu");
  const tTheme = useTranslations("theme");
  const tLogout = useTranslations("auth.logout");
  const { isMobile } = useSidebar();
  const { user } = useSession();
  const { busy, logout } = useLogout();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountMenuOverlayTarget, setAccountMenuOverlayTarget] =
    useState<HTMLElement | null>(null);
  const accountTriggerRef = useCallback((node: HTMLButtonElement | null) => {
    setAccountMenuOverlayTarget(
      node?.closest<HTMLElement>(
        '[data-slot="sidebar-inner"], [data-slot="sidebar"][data-mobile="true"]',
      ) ?? null,
    );
  }, []);
  const email = user?.email ?? tAccount("noActiveSession");
  const displayName = user ? displayNameFromUser(user) : tAccount("account");
  const initials = user ? initialsFromUser(user) : "?";

  return (
    <>
      {accountMenuOpen ? (
        <MenuLayerOverlay target={accountMenuOverlayTarget} />
      ) : null}
      <SidebarMenu>
        <SidebarMenuItem className={accountMenuOpen ? "z-modal" : undefined}>
          <DropdownMenu
            open={accountMenuOpen}
            onOpenChange={setAccountMenuOpen}
          >
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  ref={accountTriggerRef}
                  size="lg"
                  aria-label={tAccount("open")}
                  className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
                />
              }
            >
              <Avatar size="md">
                <AvatarImage src={userAvatarSrc(user?.avatarAssetId)} alt="" />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-1 flex-col md:w-[calc(var(--sidebar-width)-var(--spacing-24))] md:flex-none">
                <span className="truncate font-medium">{displayName}</span>
                <span className="truncate text-xs text-sidebar-muted-foreground">
                  {email}
                </span>
              </span>
              <MoreHorizontalIcon
                className="ml-auto text-sidebar-muted-foreground"
                aria-hidden="true"
              />
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
                  href={localizePath("/account/settings", locale)}
                  icon={Settings2Icon}
                >
                  {tAccount("accountSettings")}
                </AccountMenuLinkItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger openOnHover={false}>
                    {tTheme("label")}
                    <span className="ml-auto capitalize text-muted-foreground">
                      {tTheme(`options.${themePreference}`)}
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={themePreference}
                      onValueChange={onThemeChange}
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
    </>
  );
}

function MenuLayerOverlay({ target }: { target: HTMLElement | null }) {
  if (!target) {
    return null;
  }

  return createPortal(
    <div
      aria-hidden="true"
      data-slot="account-menu-overlay"
      className="pointer-events-none absolute inset-0 z-overlay bg-scrim"
    />,
    target,
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
  if (pathname.startsWith("/finance/expenses/extractions/")) {
    return "reviewFinanceExpense";
  }

  if (pathname.startsWith("/finance/operations/")) {
    return "financeOperation";
  }

  return undefined;
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
