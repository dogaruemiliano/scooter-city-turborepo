import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheckIcon, PencilIcon } from "lucide-react";
import { Button } from "./button";
import { PersonRow } from "./person-row";
import { PersonDocuments } from "./person-card";

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

/** Actions and selection stay above the bottom-right document indicators. */
export const DocumentsWithAction: Story = {
  args: {
    details: (
      <PersonDocuments
        documents={[
          {
            type: "identity",
            label: "Identity document: Valid",
            state: "valid",
          },
          {
            type: "driverLicense",
            label: "Driver license: Valid",
            state: "valid",
          },
        ]}
      />
    ),
  },
  render: SelectedPerson.render,
};
export const DocumentsWithSelection: Story = {
  args: {
    ...DocumentsWithAction.args,
    action: <CheckIcon aria-hidden="true" className="size-4" />,
  },
  render: SelectOption.render,
};
export const NarrowDocumentsWithAction: Story = {
  ...DocumentsWithAction,
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
  args: { ...DocumentsWithAction.args, ...LongIdentity.args },
};
