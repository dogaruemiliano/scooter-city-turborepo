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
    borderRadius: theme.radius.full,
    variants: {
      variant: {
        neutral: { backgroundColor: theme.colors.muted },
        action: { backgroundColor: theme.colors.infoSubtle },
        danger: { backgroundColor: theme.colors.destructiveSubtle },
        success: { backgroundColor: theme.colors.successSubtle },
        warning: { backgroundColor: theme.colors.warningSubtle },
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
    fontFamily: theme.typography.fontFamilyByWeight.medium,
    variants: {
      variant: {
        neutral: { color: theme.colors.mutedForeground },
        action: { color: theme.colors.info },
        danger: { color: theme.colors.destructive },
        success: { color: theme.colors.success },
        warning: { color: theme.colors.warning },
      },
      size: {
        sm: { fontSize: theme.typography.fontSize.xs },
        md: { fontSize: theme.typography.fontSize.sm },
      },
    },
  },
}));
