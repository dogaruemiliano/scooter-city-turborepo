import type { Meta, StoryObj } from "@storybook/react-vite";
import { PencilIcon } from "lucide-react";
import { Button } from "./button";
import { PersonRow } from "./person-row";

const meta = {
  title: "Components/PersonRow",
  component: PersonRow,
  tags: ["autodocs"],
  args: {
    name: "Ada Lovelace",
    description: "+40 712 345 678",
    email: "ada@example.com",
  },
} satisfies Meta<typeof PersonRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SelectOption: Story = {
  render: (args) => (
    <div className="rounded-2xl border border-border bg-popover p-4 text-popover-foreground">
      <PersonRow {...args} />
    </div>
  ),
};

export const SelectedPerson: Story = {
  render: (args) => (
    <div className="rounded-lg border border-border bg-selectable-row p-4">
      <PersonRow
        {...args}
        action={
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Change person"
          >
            <PencilIcon />
          </Button>
        }
      />
    </div>
  ),
};

export const LongIdentity: Story = {
  args: {
    name: "Alexandru Constantin Popescu Ionescu",
    email: "alexandru.constantin.popescu.ionescu@example.com",
  },
  render: (args) => (
    <div className="max-w-sm">
      <PersonRow {...args} />
    </div>
  ),
};
