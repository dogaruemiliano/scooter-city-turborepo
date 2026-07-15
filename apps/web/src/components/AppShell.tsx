"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import type { SupportedLocale } from "@repo/i18n";
import {
  Avatar,
  AvatarFallback,
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

const NAVIGATION = [
  { href: "/", labelKey: "dashboard" },
  { href: "/persons", labelKey: "persons", requiredRole: "ADMIN" },
  { href: "/scooters", labelKey: "scooters", requiredRole: "ADMIN" },
] as const;

const PAGE_TITLES: Record<string, string> = {
  "/": "dashboard",
  "/account/settings": "accountSettings",
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
  const pageTitleKey = PAGE_TITLES[routePathname];
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
            <SidebarTrigger />
            <span className="text-sm font-medium">{pageTitle}</span>
          </header>
          <div className="flex flex-1 flex-col">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </PageTitleOverrideContext.Provider>
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
  const navigation = NAVIGATION.filter(
    (item) =>
      !("requiredRole" in item) ||
      user?.roles.includes(item.requiredRole) === true,
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
              {navigation.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isActiveNavigationItem(pathname, item.href)}
                    render={<Link href={localizePath(item.href, locale)} />}
                  >
                    <span>{tNav(item.labelKey)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <AccountMenu
          locale={locale}
          initialThemePreference={initialThemePreference}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function isActiveNavigationItem(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
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
  const { busy, logout } = useLogout();
  const [themePreference, setThemePreference] = useState(
    initialThemePreference,
  );
  const email = user?.email ?? tAccount("noActiveSession");
  const displayName = user ? displayNameFromUser(user) : tAccount("account");
  const initials = user ? initialsFromUser(user) : "?";

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
                {email}
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
              <DropdownMenuItem
                render={
                  <Link href={localizePath("/account/settings", locale)} />
                }
              >
                {tAccount("accountSettings")}
              </DropdownMenuItem>
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
