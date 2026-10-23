import { Send } from "lucide-react";
import { useId, useState } from "react";
import { motion } from "@repo/theme";
import { Input } from "./input";
import { Label } from "./label";
import type { SaveButtonState } from "./save-button";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { SaveButton } from "@repo/ui/components/save-button";

const meta = {
  title: "Components/SaveButton",
  component: SaveButton,
  tags: ["autodocs"],
  argTypes: {
    state: {
      control: "inline-radio",
      options: ["idle", "pending", "success", "error"],
    },
  },
  args: {
    idleLabel: "Save",
    pendingLabel: "Saving…",
    successLabel: "Saved",
    state: "idle",
  },
} satisfies Meta<typeof SaveButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const States: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <SaveButton {...args} state="idle" />
      <SaveButton {...args} state="pending" />
      <SaveButton {...args} state="success" />
      <SaveButton {...args} state="error" />
    </div>
  ),
};

export const FailedSubmission: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      <p role="alert" className="text-sm text-destructive">
        The changes could not be saved. Check your connection and try again.
      </p>
      <SaveButton {...args} state="error" aria-describedby="save-error" />
      <span id="save-error" className="sr-only">
        The previous save failed. Your changes are preserved.
      </span>
    </div>
  ),
};
export const Destructive: Story = {
  args: {
    variant: "destructive",
    idleLabel: "Delete document",
    pendingLabel: "Deleting…",
    successLabel: "Deleted",
  },
};
export const ReviewStep: Story = {
  args: {
    idleLabel: "Review changes",
    pendingLabel: "Reviewing…",
    successLabel: "Review ready",
  },
};
export const LongLabels: Story = {
  args: {
    idleLabel: "Salvează modificările responsabililor",
    pendingLabel: "Se salvează modificările…",
    successLabel: "Modificări salvate",
  },
};

function SubmissionExample() {
  const [state, setState] = useState<SaveButtonState>("idle");
  const [fail, setFail] = useState(true);
  const errorId = useId();
  return (
    <form
      className="flex w-full max-w-md flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (state === "pending" || state === "success") return;
        setState("pending");
        await new Promise((resolve) =>
          window.setTimeout(resolve, motion.duration.documentReviewPause),
        );
        setState(fail ? "error" : "success");
      }}
    >
      <Label htmlFor={`${errorId}-name`}>Name</Label>
      <Input
        id={`${errorId}-name`}
        defaultValue="Alex"
        required
        disabled={state === "pending"}
        onChange={() => setState("idle")}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={fail}
          disabled={state === "pending"}
          onChange={(event) => {
            setFail(event.target.checked);
            setState("idle");
          }}
        />
        Simulate a failed request
      </label>
      {state === "error" ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          The changes could not be saved. Your input is preserved. Try saving
          again.
        </p>
      ) : null}
      <SaveButton
        type="submit"
        state={state}
        idleLabel="Save changes"
        pendingLabel="Saving…"
        successLabel="Saved"
        aria-describedby={state === "error" ? errorId : undefined}
      />
    </form>
  );
}

export const SubmissionFlow: Story = { render: () => <SubmissionExample /> };

export const IconOnly: Story = {
  args: {
    iconOnly: true,
    icon: <Send aria-hidden="true" />,
    idleLabel: "Send comment",
    pendingLabel: "Sending comment…",
    successLabel: "Comment sent",
  },
  render: (args) => (
    <div className="flex gap-3">
      <SaveButton {...args} />
      <SaveButton {...args} state="pending" />
      <SaveButton {...args} state="success" />
      <SaveButton {...args} state="error" />
    </div>
  ),
};
