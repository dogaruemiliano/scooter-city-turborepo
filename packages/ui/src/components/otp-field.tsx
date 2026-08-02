"use client";

import { OTPField as OTPFieldPrimitive } from "@base-ui/react/otp-field";

import { cn } from "@repo/ui/lib/utils";

type OTPFieldProps = Omit<
  OTPFieldPrimitive.Root.Props,
  "children" | "length"
> & {
  length?: number;
  inputClassName?: string;
  autoFocus?: boolean;
  invalid?: boolean;
};

function OTPField({
  className,
  inputClassName,
  length = 6,
  autoFocus = false,
  invalid = false,
  ...props
}: OTPFieldProps) {
  return (
    <OTPFieldPrimitive.Root
      data-slot="otp-field"
      aria-invalid={invalid || undefined}
      className={cn(
        "flex w-full items-center justify-center gap-1 md:w-auto md:gap-2",
        className,
      )}
      length={length}
      {...props}
    >
      {Array.from({ length }, (_, index) => (
        <OTPFieldPrimitive.Input
          key={index}
          data-slot="otp-field-input"
          aria-invalid={invalid || undefined}
          autoFocus={autoFocus && index === 0}
          className={cn(
            "h-12 min-w-0 max-w-12 flex-1 basis-12 rounded-lg border border-input bg-background text-center text-base font-medium transition-colors duration-fast ease-standard outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive data-invalid:border-destructive data-invalid:ring-2 data-invalid:ring-destructive md:size-11 md:flex-none",
            inputClassName,
          )}
        />
      ))}
    </OTPFieldPrimitive.Root>
  );
}

export { OTPField };
export type { OTPFieldProps };
