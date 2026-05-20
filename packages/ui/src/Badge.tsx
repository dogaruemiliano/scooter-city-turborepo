import { forwardRef, type HTMLAttributes } from "react";

export type BadgeVariant =
  | "neutral"
  | "action"
  | "danger"
  | "success"
  | "warning";
export type BadgeSize = "sm" | "md";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
}

const variantClass: Record<BadgeVariant, string> = {
  neutral: "bg-surface-sunken text-text-secondary",
  action: "bg-surface-action-subtle text-text-link",
  danger: "bg-surface-danger-subtle text-surface-danger",
  success: "bg-surface-success-subtle text-surface-success",
  warning: "bg-surface-warning-subtle text-text-on-warning",
};

const sizeClass: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = "neutral", size = "sm", className, ...rest }, ref) => (
    <span
      ref={ref}
      className={[
        "inline-flex items-center rounded-pill font-medium",
        variantClass[variant],
        sizeClass[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  ),
);

Badge.displayName = "Badge";
