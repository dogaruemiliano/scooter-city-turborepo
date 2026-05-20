import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const base =
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50 disabled:cursor-not-allowed";

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-surface-action text-text-on-action hover:bg-surface-action-hover active:bg-surface-action-active",
  secondary:
    "bg-surface-raised text-text-primary border border-border-default hover:bg-surface-sunken",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-base",
  lg: "px-5 py-3 text-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, ...rest }, ref) => (
    <button
      ref={ref}
      className={[base, variantClass[variant], sizeClass[size], className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  ),
);

Button.displayName = "Button";
