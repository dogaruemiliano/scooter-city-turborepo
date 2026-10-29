import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@repo/ui/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex min-w-0 max-w-full shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-center text-sm font-semibold whitespace-normal wrap-anywhere transition-all duration-fast ease-standard outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:bg-disabled disabled:text-disabled-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-primary hover:bg-primary-hover active:bg-primary-active disabled:shadow-disabled",
        warning:
          "bg-warning text-warning-foreground shadow-warning hover:bg-warning-hover active:bg-warning-active disabled:shadow-disabled",
        outline:
          "border-border bg-control text-foreground hover:bg-muted aria-expanded:bg-muted",
        secondary:
          "border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover active:bg-secondary-active aria-expanded:bg-secondary-hover",
        "secondary-destructive":
          "border-border bg-secondary text-secondary-foreground hover:border-destructive/20 hover:bg-destructive-subtle hover:text-destructive active:border-destructive active:bg-destructive-subtle active:text-destructive focus-visible:border-destructive focus-visible:ring-destructive",
        ghost: "text-foreground hover:bg-muted aria-expanded:bg-muted",
        text: "bg-transparent text-muted-foreground hover:text-foreground active:text-foreground disabled:bg-transparent",
        "media-text":
          "bg-transparent text-scrim-foreground hover:text-scrim-foreground active:text-scrim-foreground disabled:bg-transparent disabled:text-scrim-foreground",
        success:
          "bg-success text-success-foreground hover:bg-success-hover active:bg-success-active disabled:bg-success disabled:text-success-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive-hover active:bg-destructive-active focus-visible:border-destructive focus-visible:ring-destructive",
        link: "bg-transparent text-link underline-offset-4 hover:text-link-hover active:text-link-active hover:underline disabled:bg-transparent disabled:text-disabled-foreground disabled:no-underline",
      },
      size: {
        default:
          "min-h-12 gap-2 px-4 py-2 md:min-h-11 md:px-3 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 md:has-data-[icon=inline-end]:pr-2.5 md:has-data-[icon=inline-start]:pl-2.5",
        xs: "min-h-10 gap-1 rounded-md px-2 py-1 text-xs in-data-[slot=button-group]:rounded-lg md:min-h-8 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-12 gap-1.5 rounded-md px-3 py-2 text-sm in-data-[slot=button-group]:rounded-lg md:min-h-9 md:px-2.5 md:py-1 md:text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 md:has-data-[icon=inline-end]:pr-1.5 md:has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-4",
        lg: "min-h-14 gap-2 px-5 py-3 text-base md:min-h-12 md:px-4 md:py-2 md:text-sm has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4 md:has-data-[icon=inline-end]:pr-3 md:has-data-[icon=inline-start]:pl-3",
        icon: "size-10 min-h-10 min-w-10",
        "icon-xs":
          "size-10 rounded-md in-data-[slot=button-group]:rounded-lg md:size-8 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-12 rounded-md in-data-[slot=button-group]:rounded-lg md:size-9",
        "icon-lg": "size-14 md:size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = Omit<ButtonPrimitive.Props, "nativeButton" | "render"> &
  VariantProps<typeof buttonVariants>;

const Button = ({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonProps) => {
  return (
    <ButtonPrimitive
      nativeButton
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
};

export { Button, buttonVariants, type ButtonProps };
