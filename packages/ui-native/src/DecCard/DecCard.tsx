import { View, type ViewProps } from "react-native";
import { StyleSheet } from "@repo/theme-native/styles";

export type DecCardPadding = "sm" | "md" | "lg";

export interface DecCardProps extends ViewProps {
  padding?: DecCardPadding;
}

export const DecCard = ({ padding = "md", style, ...rest }: DecCardProps) => {
  styles.useVariants({ padding });
  return <View style={[styles.base, style]} {...rest} />;
};

const styles = StyleSheet.create((theme) => ({
  base: {
    backgroundColor: theme.colors.surface.raised,
    borderColor: theme.colors.border.subtle,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    variants: {
      padding: {
        sm: { padding: theme.spacing[3] },
        md: { padding: theme.spacing[4] },
        lg: { padding: theme.spacing[6] },
      },
    },
  },
}));
