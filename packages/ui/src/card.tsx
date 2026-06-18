import { forwardRef, type HTMLAttributes } from "react";

export type CardPadding = "sm" | "md" | "lg";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

const paddingClass: Record<CardPadding, string> = {
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ padding = "md", className, ...rest }, ref) => (
    <div
      ref={ref}
      className={[
        "bg-card text-card-foreground border border-border rounded-lg",
        paddingClass[padding],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  ),
);

Card.displayName = "Card";
