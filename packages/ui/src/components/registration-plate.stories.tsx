import type { Meta, StoryObj } from "@storybook/react-vite";
import { RegistrationPlate } from "./registration-plate";

const meta = {
  title: "Components/RegistrationPlate",
  component: RegistrationPlate,
  tags: ["autodocs"],
  args: {
    number: "B 123 ABC",
    variant: "national",
    readingLabel: "National plate: B 123 ABC",
  },
} satisfies Meta<typeof RegistrationPlate>;
export default meta;
type Story = StoryObj<typeof meta>;

export const National: Story = {};
export const Local: Story = {
  args: {
    number: "GJ-11-0134",
    variant: "local",
    readingLabel: "Local plate: GJ-11-0134",
  },
};
export const Temporary: Story = {
  args: {
    number: "B 012345",
    variant: "temporary",
    readingLabel: "Temporary plate: B 012345",
  },
};
export const LegacyLocal: Story = {
  args: {
    number: "TÂRGU MUREȘ 0012",
    variant: "local",
    readingLabel: "Local plate: TÂRGU MUREȘ 0012",
  },
};
export const TwoPartLocal: Story = {
  args: {
    number: "CJ-0012",
    variant: "local",
    readingLabel: "Local plate: CJ-0012",
  },
};
export const Unseparated: Story = {
  args: { number: "B123ABC", readingLabel: "National plate: B123ABC" },
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
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className="w-36">
        <Story />
      </div>
    ),
  ],
};
