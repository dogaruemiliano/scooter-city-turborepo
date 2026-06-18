import type { Meta, StoryObj } from "@storybook/react-vite";
import { Select } from "./Select";
import { Text } from "./Text";

const meta = {
  title: "Components/Select",
  component: Select,
  tags: ["autodocs"],
  argTypes: {
    invalid: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

const options = (
  <>
    <option value="">Select a treatment</option>
    <option value="implant">Single implant</option>
    <option value="all-on-4">All-on-4</option>
    <option value="veneers">Veneers</option>
  </>
);

export const Default: Story = {
  render: (args) => <Select {...args}>{options}</Select>,
};

export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => <Select {...args}>{options}</Select>,
};

export const Invalid: Story = {
  render: (args) => (
    <div className="flex flex-col gap-1">
      <Select {...args} invalid>
        {options}
      </Select>
      <Text size="sm" color="tertiary">
        Please select a treatment.
      </Text>
    </div>
  ),
};

export const WithLabel: Story = {
  render: (args) => (
    <label className="flex flex-col gap-1">
      <Text as="span" size="sm" weight="medium">
        Treatment
      </Text>
      <Select {...args}>{options}</Select>
    </label>
  ),
};
