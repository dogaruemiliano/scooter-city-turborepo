import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@repo/ui/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all duration-fast ease-standard outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:bg-disabled disabled:text-disabled-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
        outline:
          "border-border bg-background text-foreground hover:bg-muted aria-expanded:bg-muted",
        secondary:
          "border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover active:bg-secondary-active aria-expanded:bg-secondary-hover",
        ghost: "text-foreground hover:bg-muted aria-expanded:bg-muted",
        text: "bg-transparent text-muted-foreground hover:text-foreground active:text-foreground disabled:bg-transparent",
        success:
          "bg-success text-success-foreground hover:bg-success-hover active:bg-success-active disabled:bg-success disabled:text-success-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive-hover active:bg-destructive-active focus-visible:border-destructive focus-visible:ring-destructive",
        link: "bg-transparent text-link underline-offset-4 hover:text-link-hover active:text-link-active hover:underline disabled:bg-transparent disabled:text-disabled-foreground disabled:no-underline",
      },
      size: {
        default:
          "h-12 gap-2 px-4 md:h-11 md:px-3 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 md:has-data-[icon=inline-end]:pr-2.5 md:has-data-[icon=inline-start]:pl-2.5",
        xs: "h-10 gap-1 rounded-md px-2 text-xs in-data-[slot=button-group]:rounded-lg md:h-8 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-12 gap-1.5 rounded-md px-3 text-sm in-data-[slot=button-group]:rounded-lg md:h-9 md:px-2.5 md:text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 md:has-data-[icon=inline-end]:pr-1.5 md:has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-4",
        lg: "h-14 gap-2 px-5 text-base md:h-12 md:px-4 md:text-sm has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4 md:has-data-[icon=inline-end]:pr-3 md:has-data-[icon=inline-start]:pl-3",
        icon: "size-12 md:size-11",
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

const Button = ({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) => {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
};

export { Button, buttonVariants };
