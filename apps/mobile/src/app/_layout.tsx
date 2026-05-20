import {
  DarkTheme,
  DefaultTheme,
  type Theme,
  ThemeProvider as NavThemeProvider,
} from "@react-navigation/native";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useTheme } from "@repo/theme-native";

export default function RootLayout() {
  const { scheme, colors } = useTheme();
  const isDark = scheme === "dark";
  const navTheme: Theme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    dark: isDark,
    colors: {
      primary: colors.surface.action,
      background: colors.surface.page,
      card: colors.surface.page,
      text: colors.text.primary,
      border: colors.border.subtle,
      notification: colors.surface.danger,
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <NavThemeProvider value={navTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(drawer)" />
          </Stack>
        </NavThemeProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
