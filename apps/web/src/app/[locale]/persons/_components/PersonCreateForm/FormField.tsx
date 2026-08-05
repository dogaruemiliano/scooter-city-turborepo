import { Label } from "@repo/ui/components";
import type { ReactNode } from "react";

export function FormField({
  id,
  label,
  required = false,
  disabled = false,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-disabled={disabled || undefined}
      className={["flex min-w-0 flex-col gap-2", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={[
          "flex items-center gap-1",
          disabled ? "text-disabled-foreground" : undefined,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Label htmlFor={id}>{label}</Label>
        {required ? (
          <span
            aria-hidden="true"
            className={
              disabled ? "text-disabled-foreground" : "text-destructive"
            }
          >
            *
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
