import { CheckIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { Button } from "@repo/ui/components/button";
import { Spinner } from "@repo/ui/components/spinner";

type SaveButtonState = "idle" | "pending" | "success";

type SaveButtonProps = Omit<
  ComponentProps<typeof Button>,
  "children" | "variant"
> & {
  state?: SaveButtonState;
  idleLabel: string;
  pendingLabel: string;
  successLabel: string;
};

function SaveButton({
  state = "idle",
  idleLabel,
  pendingLabel,
  successLabel,
  disabled,
  ...props
}: SaveButtonProps) {
  const label =
    state === "pending"
      ? pendingLabel
      : state === "success"
        ? successLabel
        : idleLabel;

  return (
    <Button
      {...props}
      data-slot="save-button"
      data-state={state}
      variant={state === "success" ? "success" : "default"}
      disabled={disabled || state !== "idle"}
      aria-busy={state === "pending" ? true : undefined}
    >
      {state === "pending" ? (
        <Spinner data-icon="inline-start" />
      ) : state === "success" ? (
        <CheckIcon aria-hidden="true" data-icon="inline-start" />
      ) : null}
      <span aria-live="polite">{label}</span>
    </Button>
  );
}

export { SaveButton };
export type { SaveButtonProps, SaveButtonState };
