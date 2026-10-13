import type { Meta, StoryObj } from "@storybook/react-vite";
import { StepProgress } from "./step-progress";

const meta = {
  title: "Shared UI/StepProgress",
  component: StepProgress,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-full max-w-96 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StepProgress>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DocumentReview: Story = {
  args: {
    labels: ["CIV", "Registration", "Insurance", "Import"],
    activeIndex: 1,
    label: "Document verification progress",
  },
};
export const SingleDocument: Story = {
  args: {
    labels: ["Registration"],
    activeIndex: 0,
    label: "Document verification progress",
  },
};
