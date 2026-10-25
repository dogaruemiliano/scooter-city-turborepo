import { cn } from "@repo/ui/lib/utils";
import { CheckIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { Button } from "@repo/ui/components/button";
import { Spinner } from "@repo/ui/components/spinner";

type SaveButtonState = "idle" | "pending" | "success" | "error";

type SaveButtonProps = Omit<ComponentProps<typeof Button>, "children"> & {
  state?: SaveButtonState;
  icon?: React.ReactNode;
  /** Compact submission control; state labels remain available to screen readers. */
  iconOnly?: boolean;
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
  icon,
  iconOnly = false,
  size,
  className,
  variant = "default",
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
      size={size ?? (iconOnly ? "icon" : "default")}
      className={cn(iconOnly && "rounded-full", className)}
      aria-label={iconOnly ? label : props["aria-label"]}
      data-slot="save-button"
      data-state={state}
      variant={state === "success" ? "success" : variant}
      disabled={disabled || state === "pending" || state === "success"}
      aria-busy={state === "pending" ? true : undefined}
    >
      {state === "pending" ? (
        <Spinner data-icon="inline-start" />
      ) : state === "success" ? (
        <CheckIcon aria-hidden="true" data-icon="inline-start" />
      ) : icon ? (
        <span data-icon="inline-start">{icon}</span>
      ) : null}
      <span className={iconOnly ? "sr-only" : undefined} aria-live="polite">
        {label}
      </span>
    </Button>
  );
}

export { SaveButton };
export type { SaveButtonProps, SaveButtonState };
