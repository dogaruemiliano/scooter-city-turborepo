import { useState } from "react";
import {
  Platform,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { DecText } from "../DecText";

export interface DecInputProps extends Omit<TextInputProps, "style"> {
  label?: string;
  hint?: string;
  error?: string;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export const DecInput = ({
  label,
  hint,
  error,
  editable = true,
  style,
  inputStyle,
  onFocus,
  onBlur,
  ...rest
}: DecInputProps) => {
  const [focused, setFocused] = useState(false);
  const { theme } = useUnistyles();
  const invalid = !!error;
  const helperText = invalid ? error : hint;

  styles.useVariants({
    focused,
    invalid,
    editable,
  });

  return (
    <View style={[styles.container, style]}>
      {label ? (
        <DecText size="sm" weight="medium" color="secondary">
          {label}
        </DecText>
      ) : null}
      <TextInput
        placeholderTextColor={theme.colors.mutedForeground}
        editable={editable}
        aria-invalid={invalid}
        style={[styles.input, inputStyle]}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
      {helperText ? (
        <DecText size="xs" color={invalid ? "danger" : "tertiary"}>
          {helperText}
        </DecText>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[1],
  },
  input: {
    backgroundColor: theme.colors.background,
    color: theme.colors.foreground,
    fontFamily: theme.typography.fontFamilyByWeight.regular,
    borderRadius: theme.radius.md,
    borderWidth: theme.spacing.px,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    fontSize: theme.typography.fontSize.base,
    variants: {
      focused: {
        true: {
          borderColor: theme.colors.ring,
          ...Platform.select({
            android: undefined,
            default: {
              outlineStyle: "solid",
              outlineWidth: StyleSheet.hairlineWidth,
              outlineColor: theme.colors.ring,
            },
          }),
        },
        false: {
          borderColor: theme.colors.input,
        },
      },
      invalid: {
        true: {
          borderColor: theme.colors.destructive,
          outlineColor: theme.colors.destructive,
        },
        false: {},
      },
      editable: {
        true: { opacity: 1 },
        false: { opacity: 0.5 },
      },
    },
  },
}));
