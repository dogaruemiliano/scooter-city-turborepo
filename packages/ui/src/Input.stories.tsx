import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./Input";
import { Text } from "./Text";

const meta = {
  title: "Components/Input",
  component: Input,
  tags: ["autodocs"],
  argTypes: {
    invalid: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  args: { placeholder: "you@example.com" },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true, value: "locked@example.com" },
};

export const Invalid: Story = {
  render: (args) => (
    <div className="flex flex-col gap-1">
      <Input {...args} invalid defaultValue="not-an-email" />
      <Text size="sm" color="tertiary">
        Enter a valid email address.
      </Text>
    </div>
  ),
};

export const WithLabel: Story = {
  render: (args) => (
    <label className="flex flex-col gap-1">
      <Text as="span" size="sm" weight="medium">
        Email
      </Text>
      <Input {...args} />
    </label>
  ),
};
