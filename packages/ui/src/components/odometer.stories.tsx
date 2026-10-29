import type { Meta, StoryObj } from "@storybook/react-vite";
import { Odometer } from "./odometer";

const meta = {
  title: "Components/Odometer",
  component: Odometer,
  tags: ["autodocs"],
  args: {
    value: 12_450,
    label: "Kilometri totali",
    readingLabel: "Kilometraj: 12.450 km",
  },
} satisfies Meta<typeof Odometer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const ShortReading: Story = {
  args: { value: 450, readingLabel: "Kilometraj: 450 km", label: undefined },
};
export const Zero: Story = {
  args: { value: 0, readingLabel: "Kilometraj: 0 km" },
};
export const Unknown: Story = {
  args: { value: null, readingLabel: "Kilometri totali: Necompletat" },
};
export const LargeReading: Story = {
  args: { value: 1_234_567, readingLabel: "Kilometraj: 1.234.567 km" },
};
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className="w-32">
        <Story />
      </div>
    ),
  ],
};
export const Dark: Story = {
  decorators: [
    (Story) => (
      <div className="dark bg-background p-4">
        <Story />
      </div>
    ),
  ],
};

export const WithoutLabel: Story = { args: { label: undefined } };
