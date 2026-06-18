import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  BellIcon,
  CalendarDaysIcon,
  ChevronUpIcon,
  CircleHelpIcon,
  CreditCardIcon,
  FileChartColumnIcon,
  FolderKanbanIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SettingsIcon,
  StethoscopeIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@repo/ui/components/sidebar";

const meta = {
  title: "Shadcn/Sidebar",
  component: Sidebar,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

function BrandNavigation() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          tooltip="DecTech Health"
          render={<a href="#overview" />}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <StethoscopeIcon />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold">DecTech Health</span>
            <span className="truncate text-xs text-muted-foreground">
              Clinic workspace
            </span>
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function MainNavigation() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Workspace</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive
              tooltip="Overview"
              render={<a href="#overview" />}
            >
              <LayoutDashboardIcon />
              <span>Overview</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Patients"
              render={<a href="#patients" />}
            >
              <UsersIcon />
              <span>Patients</span>
            </SidebarMenuButton>
            <SidebarMenuBadge>12</SidebarMenuBadge>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Appointments"
              render={<a href="#appointments" />}
            >
              <CalendarDaysIcon />
              <span>Appointments</span>
            </SidebarMenuButton>
            <SidebarMenuAction showOnHover aria-label="Add appointment">
              <PlusIcon />
            </SidebarMenuAction>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Reports" render={<a href="#reports" />}>
              <FileChartColumnIcon />
              <span>Reports</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function ProjectsNavigation() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Care programs</SidebarGroupLabel>
      <SidebarGroupAction aria-label="Add care program">
        <PlusIcon />
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Diabetes care"
              render={<a href="#diabetes-care" />}
            >
              <FolderKanbanIcon />
              <span>Diabetes care</span>
            </SidebarMenuButton>
            <SidebarMenuAction showOnHover aria-label="Program actions">
              <MoreHorizontalIcon />
            </SidebarMenuAction>
            <SidebarMenuSub>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  isActive
                  render={<a href="#program-overview" />}
                >
                  <span>Program overview</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton render={<a href="#care-team" />}>
                  <span>Care team</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton render={<a href="#activity" />}>
                  <span>Activity</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            </SidebarMenuSub>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function AccountNavigation() {
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton tooltip="Help center" render={<a href="#help" />}>
          <CircleHelpIcon />
          <span>Help center</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
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
              <AvatarFallback>ES</AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">Emilia Stone</span>
              <span className="truncate text-xs text-muted-foreground">
                emilia@example.com
              </span>
            </span>
            <ChevronUpIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? "bottom" : "right"}
            align="end"
            className="min-w-64"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-2">
                <Avatar size="sm">
                  <AvatarFallback>ES</AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-popover-foreground">
                    Emilia Stone
                  </span>
                  <span className="truncate font-normal">
                    emilia@example.com
                  </span>
                </span>
              </DropdownMenuLabel>
              <DropdownMenuItem render={<a href="#account" />}>
                <UserRoundIcon />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem render={<a href="#notifications" />}>
                <BellIcon />
                Notifications
              </DropdownMenuItem>
              <DropdownMenuItem render={<a href="#billing" />}>
                <CreditCardIcon />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem render={<a href="#settings" />}>
                <SettingsIcon />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem render={<a href="#support" />}>
                <CircleHelpIcon />
                Support
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              render={<a href="#sign-out" />}
            >
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function ProductSidebar({
  collapsible = "icon",
}: {
  collapsible?: React.ComponentProps<typeof Sidebar>["collapsible"];
}) {
  return (
    <Sidebar collapsible={collapsible}>
      <SidebarHeader>
        <BrandNavigation />
        <SidebarInput
          aria-label="Search navigation"
          className="group-data-[collapsible=icon]:hidden"
          placeholder="Search"
        />
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <MainNavigation />
        <ProjectsNavigation />
      </SidebarContent>
      <SidebarFooter>
        <AccountNavigation />
      </SidebarFooter>
      {collapsible !== "none" && <SidebarRail />}
    </Sidebar>
  );
}

function ApplicationContent({
  controlledState,
}: {
  controlledState?: "Expanded" | "Collapsed";
}) {
  return (
    <SidebarInset>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger />
        <span className="text-sm font-medium">Clinic overview</span>
        {controlledState && (
          <Badge className="ml-auto" variant="secondary">
            {controlledState}
          </Badge>
        )}
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div>
          <h1 className="text-2xl font-semibold">Good morning, Emilia</h1>
          <p className="text-sm text-muted-foreground">
            Here is today&apos;s clinic activity.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Appointments</CardTitle>
              <CardDescription>Scheduled for today</CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">18</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Waiting room</CardTitle>
              <CardDescription>Patients checked in</CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">4</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Care plans</CardTitle>
              <CardDescription>Awaiting review</CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">7</CardContent>
          </Card>
        </div>
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Application content</CardTitle>
            <CardDescription>
              Resize the canvas below the medium breakpoint to exercise the
              mobile sheet. Press Control+B or Command+B to toggle the sidebar.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Each app owns this content and composes only the sidebar pieces it
            needs.
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  );
}

function SidebarApplication({
  defaultOpen = true,
  collapsible = "icon",
  hoverExpand,
}: {
  defaultOpen?: boolean;
  collapsible?: React.ComponentProps<typeof Sidebar>["collapsible"];
  hoverExpand?: boolean;
}) {
  return (
    <SidebarProvider defaultOpen={defaultOpen} hoverExpand={hoverExpand}>
      <ProductSidebar collapsible={collapsible} />
      <ApplicationContent />
    </SidebarProvider>
  );
}

function ControlledSidebarApplication() {
  const [open, setOpen] = React.useState(false);

  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      <ProductSidebar />
      <ApplicationContent controlledState={open ? "Expanded" : "Collapsed"} />
    </SidebarProvider>
  );
}

function OpenMobileSidebar() {
  const { setOpenMobile } = useSidebar();

  React.useEffect(() => {
    setOpenMobile(true);
  }, [setOpenMobile]);

  return null;
}

function MobileSheetApplication() {
  return (
    <SidebarProvider>
      <OpenMobileSidebar />
      <ProductSidebar />
      <ApplicationContent />
    </SidebarProvider>
  );
}

export const ComposedApplication: Story = {
  render: () => <SidebarApplication />,
};

export const CollapsedIcons: Story = {
  render: () => <SidebarApplication defaultOpen={false} />,
};

export const ClickOnlyCollapsedIcons: Story = {
  render: () => <SidebarApplication defaultOpen={false} hoverExpand={false} />,
};

export const Controlled: Story = {
  render: () => <ControlledSidebarApplication />,
};

export const MobileSheetOpen: Story = {
  render: () => <MobileSheetApplication />,
};

export const FixedNavigation: Story = {
  render: () => <SidebarApplication collapsible="none" />,
};

export const DarkTheme: Story = {
  render: () => (
    <div className="dark min-h-svh">
      <SidebarApplication />
    </div>
  ),
};

export const MinimalComposition: Story = {
  render: () => (
    <SidebarProvider>
      <Sidebar collapsible="none">
        <SidebarHeader>
          <BrandNavigation />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive render={<a href="#dashboard" />}>
                    <LayoutDashboardIcon />
                    <span>Dashboard</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton render={<a href="#settings" />}>
                    <SettingsIcon />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
          A fixed sidebar composed from only the required primitives.
        </div>
      </SidebarInset>
    </SidebarProvider>
  ),
};
