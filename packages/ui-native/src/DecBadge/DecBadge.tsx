import { View, Text, type ViewProps } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export type DecBadgeVariant =
  | "neutral"
  | "action"
  | "danger"
  | "success"
  | "warning";
export type DecBadgeSize = "sm" | "md";

export interface DecBadgeProps extends Omit<ViewProps, "children"> {
  variant?: DecBadgeVariant;
  size?: DecBadgeSize;
  children: string;
}

export const DecBadge = ({
  variant = "neutral",
  size = "sm",
  children,
  style,
  ...rest
}: DecBadgeProps) => {
  styles.useVariants({ variant, size });

  return (
    <View style={[styles.container, style]} {...rest}>
      <Text style={styles.label}>{children}</Text>
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    alignSelf: "flex-start",
    borderRadius: theme.radius.pill,
    variants: {
      variant: {
        neutral: { backgroundColor: theme.colors.surface.sunken },
        action: { backgroundColor: theme.colors.surface.actionSubtle },
        danger: { backgroundColor: theme.colors.surface.dangerSubtle },
        success: { backgroundColor: theme.colors.surface.successSubtle },
        warning: { backgroundColor: theme.colors.surface.warningSubtle },
      },
      size: {
        sm: {
          paddingHorizontal: theme.spacing[2],
          paddingVertical: theme.spacing[0.5],
        },
        md: {
          paddingHorizontal: theme.spacing[2.5],
          paddingVertical: theme.spacing[1],
        },
      },
    },
  },
  label: {
    fontWeight: theme.typography.fontWeight.medium.toString() as "500",
    variants: {
      variant: {
        neutral: { color: theme.colors.text.secondary },
        action: { color: theme.colors.text.link },
        danger: { color: theme.colors.surface.danger },
        success: { color: theme.colors.surface.success },
        warning: { color: theme.colors.text.warning },
      },
      size: {
        sm: { fontSize: theme.typography.fontSize.xs },
        md: { fontSize: theme.typography.fontSize.sm },
      },
    },
  },
}));
