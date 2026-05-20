import { forwardRef, type InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ invalid = false, className, ...rest }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={[
        "w-full bg-surface-page text-text-primary placeholder:text-text-tertiary",
        "border rounded-md px-3 py-2 text-base",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        invalid ? "border-border-danger" : "border-border-default",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  ),
);

Input.displayName = "Input";
