import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { SwipeAction } from "./swipe-action";

const meta = {
  title: "Interactions/SwipeAction",
  component: SwipeAction,
  tags: ["autodocs"],
  args: { children: "Task", action: <CheckCheck />, onAction: () => {} },
} satisfies Meta<typeof SwipeAction>;
export default meta;
type Story = StoryObj<typeof meta>;
function Example({ disabled = false }: { disabled?: boolean }) {
  const [requested, setRequested] = useState(false);
  return (
    <div className="flex max-w-md flex-col gap-4">
      <SwipeAction
        disabled={disabled}
        action={<CheckCheck />}
        onAction={() => setRequested(true)}
      >
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground">
          <span>Confirm workshop delivery</span>
        </div>
      </SwipeAction>
      <p role="status">
        {requested
          ? "Completion requested. The parent can now open its confirmation sheet."
          : "Swipe left to request completion. Task details provide the keyboard alternative."}
      </p>
    </div>
  );
}
export const Default: Story = { render: () => <Example /> };
export const Disabled: Story = { render: () => <Example disabled /> };
