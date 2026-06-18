import { Pressable, Text, type PressableProps } from "react-native";
import { StyleSheet } from "react-native-unistyles";

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
      <Text style={[styles.label, disabled && styles.disabledLabel]}>
        {children}
      </Text>
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
          backgroundColor: theme.colors.primary,
          borderWidth: 0,
        },
        secondary: {
          backgroundColor: theme.colors.secondary,
          borderWidth: theme.spacing.px,
          borderColor: theme.colors.border,
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
    fontFamily: theme.typography.fontFamilyByWeight.medium,
    variants: {
      variant: {
        primary: { color: theme.colors.primaryForeground },
        secondary: { color: theme.colors.secondaryForeground },
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
        primary: { backgroundColor: theme.colors.primaryHover },
        secondary: { backgroundColor: theme.colors.secondaryHover },
      },
    },
  },
  disabled: {
    backgroundColor: theme.colors.disabled,
  },
  disabledLabel: {
    color: theme.colors.disabledForeground,
  },
}));
