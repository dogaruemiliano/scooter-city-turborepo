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
        "w-full bg-background text-foreground placeholder:text-muted-foreground",
        "border rounded-md px-3 py-2.5 text-base shadow-sm",
        "transition-colors duration-fast ease-standard",
        "hover:border-border-strong",
        "focus:outline-none focus-visible:ring-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        invalid
          ? "border-destructive focus-visible:ring-destructive"
          : "border-input focus-visible:border-ring focus-visible:ring-ring",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  ),
);

Input.displayName = "Input";
