import { Pressable, Text, type PressableProps } from "react-native";
import { StyleSheet } from "@repo/theme-native/styles";

export type DecButtonVariant = "primary" | "secondary";
export type DecButtonSize = "sm" | "md" | "lg";

export interface DecButtonProps extends Omit<
  PressableProps,
  "children" | "style"
> {
  variant?: DecButtonVariant;
  size?: DecButtonSize;
  children: string;
}

export const DecButton = ({
  variant = "primary",
  size = "md",
  disabled,
  children,
  ...rest
}: DecButtonProps) => {
  styles.useVariants({ variant, size });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
      {...rest}
    >
      <Text style={styles.label}>{children}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create((theme) => ({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.md,
    borderWidth: 0,
    variants: {
      variant: {
        primary: {
          backgroundColor: theme.colors.surface.action,
          borderWidth: 0,
        },
        secondary: {
          backgroundColor: theme.colors.surface.raised,
          borderWidth: 1,
          borderColor: theme.colors.border.default,
        },
      },
      size: {
        sm: {
          paddingHorizontal: theme.spacing[3],
          paddingVertical: theme.spacing[1.5],
        },
        md: {
          paddingHorizontal: theme.spacing[4],
          paddingVertical: theme.spacing[2],
        },
        lg: {
          paddingHorizontal: theme.spacing[5],
          paddingVertical: theme.spacing[3],
        },
      },
    },
  },
  label: {
    fontWeight: theme.typography.fontWeight.medium.toString() as "500",
    variants: {
      variant: {
        primary: { color: theme.colors.text.onAction },
        secondary: { color: theme.colors.text.primary },
      },
      size: {
        sm: { fontSize: theme.typography.fontSize.sm },
        md: { fontSize: theme.typography.fontSize.base },
        lg: { fontSize: theme.typography.fontSize.lg },
      },
    },
  },
  pressed: {
    variants: {
      variant: {
        primary: { backgroundColor: theme.colors.surface.actionHover },
        secondary: { backgroundColor: theme.colors.surface.sunken },
      },
    },
  },
  disabled: {
    opacity: 0.5,
  },
}));
