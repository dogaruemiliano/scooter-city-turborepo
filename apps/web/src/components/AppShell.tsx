"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
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
import {
  applyThemePreference,
  type ThemePreference,
} from "../lib/theme-cookie";

const NAVIGATION = [
  { href: "/", label: "Dashboard" },
  { href: "/shadcn", label: "UI showcase" },
] as const;

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/account/settings": "Account settings",
  "/shadcn": "UI showcase",
};

export function AppShell({
  children,
  initialThemePreference,
}: {
  children: ReactNode;
  initialThemePreference: ThemePreference;
}) {
  const pathname = usePathname();

  if (pathname.startsWith("/sign-in")) {
    return children;
  }

  return (
    <SidebarProvider>
      <AppSidebar
        pathname={pathname}
        initialThemePreference={initialThemePreference}
      />
      <SidebarInset>
        <header className="sticky top-0 z-sticky flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
          <SidebarTrigger />
          <span className="text-sm font-medium">
            {PAGE_TITLES[pathname] ?? "DecTech"}
          </span>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function AppSidebar({
  pathname,
  initialThemePreference,
}: {
  pathname: string;
  initialThemePreference: ThemePreference;
}) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <Avatar size="md">
                <AvatarFallback>DT</AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">DecTech</span>
                <span className="truncate text-xs text-muted-foreground">
                  Web workspace
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
              {NAVIGATION.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href}
                    render={<Link href={item.href} />}
                  >
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <AccountMenu initialThemePreference={initialThemePreference} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function AccountMenu({
  initialThemePreference,
}: {
  initialThemePreference: ThemePreference;
}) {
  const { isMobile } = useSidebar();
  const { user } = useSession();
  const { busy, logout } = useLogout();
  const [themePreference, setThemePreference] = useState(
    initialThemePreference,
  );
  const email = user?.email ?? "No active session";
  const displayName = user ? displayNameFromEmail(user.email) : "Account";
  const initials = user ? initialsFromEmail(user.email) : "?";

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
                aria-label="Open account menu"
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
              <DropdownMenuItem render={<Link href="/account/settings" />}>
                Account settings
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  Theme
                  <span className="ml-auto capitalize text-muted-foreground">
                    {themePreference}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={themePreference}
                    onValueChange={changeTheme}
                  >
                    <DropdownMenuRadioItem value="light">
                      Light
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">
                      Dark
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system">
                      System
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={busy}
              onClick={() => void logout()}
            >
              {busy ? "Signing out..." : "Sign out"}
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
