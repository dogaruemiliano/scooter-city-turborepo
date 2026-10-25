import { useState } from "react";
import { Button } from "./button";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StepProgress } from "./step-progress";

const meta = {
  title: "Shared UI/StepProgress",
  component: StepProgress,
  tags: ["autodocs"],
  args: {
    labels: ["Details", "Review"],
    activeIndex: 0,
    label: "Form progress",
  },
  parameters: {
    docs: {
      description: {
        component:
          "Equal-width segments fill through the current step. Changes animate in either direction; fractional gesture positions track directly. Optional navigation is authorized by the caller.",
      },
    },
  },
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

function AnimatedExample({
  disabled = false,
  rtl = false,
}: {
  disabled?: boolean;
  rtl?: boolean;
}) {
  const [index, setIndex] = useState(0);
  return (
    <div dir={rtl ? "rtl" : "ltr"} className="grid gap-4">
      <StepProgress
        labels={["Citizenship", "Documents", "Personal details", "Review"]}
        activeIndex={index}
        label="Add person progress"
        onStepSelect={setIndex}
        canSelectStep={() => true}
        disabled={disabled}
      />
      <div className="flex gap-2">
        <Button
          disabled={disabled || index === 0}
          onClick={() => setIndex(index - 1)}
        >
          Back
        </Button>
        <Button
          disabled={disabled || index === 3}
          onClick={() => setIndex(index + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
export const Interactive: Story = { render: () => <AnimatedExample /> };
export const Disabled: Story = { render: () => <AnimatedExample disabled /> };
export const RightToLeft: Story = { render: () => <AnimatedExample rtl /> };
export const GestureTracking: Story = {
  args: { ...DocumentReview.args, visualIndex: 1.5, tracking: true },
};
