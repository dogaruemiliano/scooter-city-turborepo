import { View, type ViewProps } from "react-native";
import { StyleSheet } from "react-native-unistyles";

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
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: theme.spacing.px,
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
