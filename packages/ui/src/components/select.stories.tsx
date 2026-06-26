import type { Meta, StoryObj } from "@storybook/react-vite";

import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

const meta = {
  title: "Shadcn/Select",
  component: Select,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Label id="language-label">Language</Label>
      <Select defaultValue="ro">
        <SelectTrigger aria-labelledby="language-label" className="w-full">
          <SelectValue placeholder="Choose language" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ro">Romanian</SelectItem>
          <SelectItem value="en">English</SelectItem>
          <SelectItem value="fr">French</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

export const Grouped: Story = {
  render: () => (
    <Select defaultValue="clinic">
      <SelectTrigger aria-label="Workspace" className="w-full">
        <SelectValue placeholder="Choose workspace" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Care teams</SelectLabel>
          <SelectItem value="clinic">Clinic operations</SelectItem>
          <SelectItem value="nursing">Nursing team</SelectItem>
          <SelectItem value="billing">Billing team</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Admin</SelectLabel>
          <SelectItem value="settings">Settings</SelectItem>
          <SelectItem value="reports">Reports</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};

export const Small: Story = {
  render: () => (
    <Select defaultValue="25">
      <SelectTrigger aria-label="Rows per page" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="10">10</SelectItem>
        <SelectItem value="25">25</SelectItem>
        <SelectItem value="50">50</SelectItem>
      </SelectContent>
    </Select>
  ),
};
