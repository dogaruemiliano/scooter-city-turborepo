import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  BellIcon,
  CheckIcon,
  CreditCardIcon,
  LogOutIcon,
  SettingsIcon,
  UserRoundIcon,
} from "lucide-react";

import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";

const meta = {
  title: "Shadcn/Dropdown Menu",
  component: DropdownMenu,
  tags: ["autodocs"],
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        Open menu
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56">
        <DropdownMenuLabel>Account</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <UserRoundIcon />
            Profile
            <DropdownMenuShortcut>Cmd+P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <CreditCardIcon />
            Billing
            <DropdownMenuShortcut>Cmd+B</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <SettingsIcon />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const WithChecksAndRadio: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        Preferences
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked>
          <BellIcon />
          Email alerts
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>SMS alerts</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value="weekly">
          <DropdownMenuRadioItem value="daily">
            Daily digest
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="weekly">
            Weekly digest
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="off">No digest</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const WithSubmenu: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        Assign status
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-48">
        <DropdownMenuItem>
          <CheckIcon />
          Mark reviewed
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Move to queue</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Clinical review</DropdownMenuItem>
            <DropdownMenuItem>Billing review</DropdownMenuItem>
            <DropdownMenuItem>Archive</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};
