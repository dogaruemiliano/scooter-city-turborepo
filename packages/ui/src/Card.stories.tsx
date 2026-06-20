import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "./card";
import { Text } from "./Text";
import { Button } from "./button";

const meta = {
  title: "Components/Card",
  component: Card,
  tags: ["autodocs"],
  argTypes: {
    padding: { control: "inline-radio", options: ["sm", "md", "lg"] },
  },
  args: { padding: "md" },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Card {...args} className="max-w-sm">
      <Text as="p" size="base">
        A simple card. Surface, border, and radius all come from theme tokens.
      </Text>
    </Card>
  ),
};

export const WithHeaderAndAction: Story = {
  render: (args) => (
    <Card {...args} className="max-w-sm flex flex-col gap-3">
      <Text as="h3" size="xl" weight="semibold">
        Verify your email
      </Text>
      <Text as="p" color="secondary">
        We sent a 6-digit code to you@example.com. It expires in 10 minutes.
      </Text>
      <div className="flex gap-2">
        <Button variant="primary">Verify</Button>
        <Button variant="secondary">Resend</Button>
      </div>
    </Card>
  ),
};
