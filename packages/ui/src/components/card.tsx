import * as React from "react";

import { cn } from "@repo/ui/lib/utils";

type CardElement = "div" | "article" | "section" | "form";

type CardProps<Element extends CardElement = "div"> = {
  as?: Element;
  size?: "default" | "sm" | "comfortable";
  surface?: "default" | "raised";
  border?: "transparent" | "default" | "primary";
} & Omit<React.ComponentProps<Element>, "as">;

function Card<Element extends CardElement = "div">({
  as,
  className,
  size = "default",
  surface = "default",
  border = "default",
  ...props
}: CardProps<Element>) {
  return React.createElement(as ?? "div", {
    "data-slot": "card",
    "data-size": size,
    "data-surface": surface,
    "data-border": border,
    className: cn(
      "group/card [--control-border:var(--border-elevated)] flex min-w-0 flex-col gap-(--card-spacing) overflow-hidden rounded-xl border bg-card py-(--card-spacing-y) text-sm text-card-foreground [--card-spacing:--spacing(3)] [--card-spacing-y:--spacing(3)] md:[--card-spacing:--spacing(5)] md:[--card-spacing-y:var(--card-spacing)] has-data-[slot=card-accent]:relative has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
      {
        transparent: "border-transparent",
        default: "border-border",
        primary: "border-primary",
      }[border],
      surface === "raised" &&
        "rounded-2xl bg-popover text-popover-foreground [--card-spacing:--spacing(3)] md:[--card-spacing:--spacing(6)]",
      size === "sm" &&
        "[--card-spacing:--spacing(3)] md:[--card-spacing:--spacing(3)]",
      size === "comfortable" &&
        "[--card-spacing:--spacing(5)] md:[--card-spacing:--spacing(5)]",
      className,
    ),
    ...props,
  });
}

/** A straight inset color strip, clipped by the card's outer silhouette. */
function CardAccent({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      {...props}
      aria-hidden="true"
      data-slot="card-accent"
      className={cn(
        "pointer-events-none absolute inset-y-0 left-0 w-1 bg-primary",
        className,
      )}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid min-w-0 auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [&>*]:min-w-0 [.border-b]:pb-(--card-spacing-y)",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "min-w-0 font-sans text-base leading-snug font-semibold wrap-anywhere group-data-[size=sm]/card:text-sm",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn(
        "min-w-0 text-sm text-muted-foreground wrap-anywhere",
        className,
      )}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("min-w-0 px-(--card-spacing)", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t border-border bg-inherit px-(--card-spacing) py-(--card-spacing-y)",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardAccent,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  type CardProps,
};
