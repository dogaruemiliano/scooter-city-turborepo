import type { Meta, StoryObj } from "@storybook/react-vite";
import { Text } from "./Text";

const meta = {
  title: "Components/Text",
  component: Text,
  tags: ["autodocs"],
  args: { children: "The quick brown fox jumps over the lazy dog" },
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      <Text {...args} size="xs" />
      <Text {...args} size="sm" />
      <Text {...args} size="base" />
      <Text {...args} size="lg" />
      <Text {...args} size="xl" />
      <Text {...args} size="2xl" />
      <Text {...args} size="3xl" />
    </div>
  ),
};

export const Weights: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      <Text {...args} weight="regular" />
      <Text {...args} weight="medium" />
      <Text {...args} weight="semibold" />
      <Text {...args} weight="bold" />
    </div>
  ),
};

export const Colors: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      <Text {...args} color="primary" />
      <Text {...args} color="secondary" />
      <Text {...args} color="tertiary" />
      <Text {...args} color="disabled" />
    </div>
  ),
};

export const AsHeading: Story = {
  args: {
    as: "h1",
    size: "4xl",
    weight: "bold",
    children: "Heading level one",
  },
};
