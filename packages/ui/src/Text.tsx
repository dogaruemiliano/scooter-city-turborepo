import {
  createElement,
  forwardRef,
  type ElementType,
  type HTMLAttributes,
} from "react";

export type TextSize =
  | "xs"
  | "sm"
  | "base"
  | "lg"
  | "xl"
  | "2xl"
  | "3xl"
  | "4xl"
  | "5xl";
export type TextWeight = "regular" | "medium" | "semibold" | "bold";
export type TextColor = "primary" | "secondary" | "tertiary" | "disabled";

export interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  size?: TextSize;
  weight?: TextWeight;
  color?: TextColor;
}

const sizeClass: Record<TextSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
  "3xl": "text-3xl",
  "4xl": "text-4xl",
  "5xl": "text-5xl",
};

const weightClass: Record<TextWeight, string> = {
  regular: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
};

const colorClass: Record<TextColor, string> = {
  primary: "text-foreground",
  secondary: "text-muted-foreground",
  tertiary: "text-muted-foreground",
  disabled: "text-disabled-foreground",
};

export const Text = forwardRef<HTMLElement, TextProps>(
  (
    {
      as = "span",
      size = "base",
      weight = "regular",
      color = "primary",
      className,
      ...rest
    },
    ref,
  ) =>
    createElement(as, {
      ref,
      className: [
        sizeClass[size],
        weightClass[weight],
        colorClass[color],
        "leading-normal",
        className,
      ]
        .filter(Boolean)
        .join(" "),
      ...rest,
    }),
);

Text.displayName = "Text";
