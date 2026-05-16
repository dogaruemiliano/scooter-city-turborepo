import { useState } from "react";
import {
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { StyleSheet, useUnistyles } from "@repo/theme-native/styles";
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
        placeholderTextColor={theme.colors.text.tertiary}
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
    backgroundColor: theme.colors.surface.page,
    color: theme.colors.text.primary,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    fontSize: theme.typography.fontSize.base,
    variants: {
      focused: {
        true: {
          borderColor: theme.colors.border.focus,
          outlineStyle: "solid",
          outlineWidth: 2,
          outlineOffset: 0,
          outlineColor: theme.colors.border.focus,
        },
        false: {
          borderColor: theme.colors.border.default,
        },
      },
      invalid: {
        true: {
          borderColor: theme.colors.border.danger,
          outlineColor: theme.colors.border.danger,
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
