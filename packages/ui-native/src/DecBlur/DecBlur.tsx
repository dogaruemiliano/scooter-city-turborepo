import type { ReactNode } from "react";
import {
  Platform,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { BlurView, type BlurTint } from "expo-blur";

export type DecBlurTint = BlurTint;

export interface DecBlurProps extends Omit<ViewProps, "children"> {
  /** 0-100; ignored on platforms without native blur. */
  intensity?: number;
  /** "default" follows system color scheme. */
  tint?: DecBlurTint;
  /**
   * Background color used on platforms without native blur (currently
   * everything other than iOS). Should typically be a semi-transparent
   * theme color (e.g. `theme.colors.surface.scrim`).
   */
  fallbackColor?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Cross-platform blur surface. Uses `expo-blur` on iOS for native
 * UIVisualEffectView; degrades to a tinted `View` everywhere else.
 */
export const DecBlur = ({
  intensity = 50,
  tint = "default",
  fallbackColor = "transparent",
  style,
  children,
  ...rest
}: DecBlurProps) => {
  if (Platform.OS === "ios") {
    return (
      <BlurView intensity={intensity} tint={tint} style={style} {...rest}>
        {children}
      </BlurView>
    );
  }
  return (
    <View style={[{ backgroundColor: fallbackColor }, style]} {...rest}>
      {children}
    </View>
  );
};
