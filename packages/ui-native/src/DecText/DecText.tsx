import { Text, type TextProps as RNTextProps } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export type DecTextSize =
  | "xs"
  | "sm"
  | "base"
  | "lg"
  | "xl"
  | "2xl"
  | "3xl"
  | "4xl"
  | "5xl";
export type DecTextWeight = "regular" | "medium" | "semibold" | "bold";
export type DecTextColor =
  | "primary"
  | "secondary"
  | "tertiary"
  | "disabled"
  | "danger";

export interface DecTextProps extends RNTextProps {
  size?: DecTextSize;
  weight?: DecTextWeight;
  color?: DecTextColor;
}

export const DecText = ({
  size = "base",
  weight = "regular",
  color = "primary",
  style,
  ...rest
}: DecTextProps) => {
  styles.useVariants({ size, weight, color });
  return <Text style={[styles.base, style]} {...rest} />;
};

const styles = StyleSheet.create((theme) => ({
  base: {
    variants: {
      size: {
        xs: {
          fontSize: theme.typography.fontSize.xs,
          lineHeight:
            theme.typography.fontSize.xs * theme.typography.lineHeight.normal,
        },
        sm: {
          fontSize: theme.typography.fontSize.sm,
          lineHeight:
            theme.typography.fontSize.sm * theme.typography.lineHeight.normal,
        },
        base: {
          fontSize: theme.typography.fontSize.base,
          lineHeight:
            theme.typography.fontSize.base * theme.typography.lineHeight.normal,
        },
        lg: {
          fontSize: theme.typography.fontSize.lg,
          lineHeight:
            theme.typography.fontSize.lg * theme.typography.lineHeight.normal,
        },
        xl: {
          fontSize: theme.typography.fontSize.xl,
          lineHeight:
            theme.typography.fontSize.xl * theme.typography.lineHeight.normal,
        },
        "2xl": {
          fontSize: theme.typography.fontSize["2xl"],
          lineHeight:
            theme.typography.fontSize["2xl"] *
            theme.typography.lineHeight.normal,
        },
        "3xl": {
          fontSize: theme.typography.fontSize["3xl"],
          lineHeight:
            theme.typography.fontSize["3xl"] *
            theme.typography.lineHeight.normal,
        },
        "4xl": {
          fontSize: theme.typography.fontSize["4xl"],
          lineHeight:
            theme.typography.fontSize["4xl"] *
            theme.typography.lineHeight.normal,
        },
        "5xl": {
          fontSize: theme.typography.fontSize["5xl"],
          lineHeight:
            theme.typography.fontSize["5xl"] *
            theme.typography.lineHeight.normal,
        },
      },
      weight: {
        regular: {
          fontFamily: theme.typography.fontFamilyByWeight.regular,
        },
        medium: {
          fontFamily: theme.typography.fontFamilyByWeight.medium,
        },
        semibold: {
          fontFamily: theme.typography.fontFamilyByWeight.semibold,
        },
        bold: {
          fontFamily: theme.typography.fontFamilyByWeight.bold,
        },
      },
      color: {
        primary: { color: theme.colors.foreground },
        secondary: { color: theme.colors.mutedForeground },
        tertiary: { color: theme.colors.mutedForeground },
        disabled: { color: theme.colors.disabledForeground },
        danger: { color: theme.colors.destructive },
      },
    },
  },
}));
