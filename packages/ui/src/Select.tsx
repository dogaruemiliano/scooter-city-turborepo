import { forwardRef, type SelectHTMLAttributes } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ invalid = false, className, children, ...rest }, ref) => (
    <div className="relative w-full">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={[
          "w-full appearance-none bg-background text-foreground",
          "border rounded-md pl-3 pr-10 py-2.5 text-base shadow-sm",
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
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      >
        <path
          d="M6 8l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  ),
);

Select.displayName = "Select";
