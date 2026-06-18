import { Drawer } from "expo-router/drawer";
import { useUnistyles } from "react-native-unistyles";

export default function DrawerLayout() {
  const { theme } = useUnistyles();

  return (
    <Drawer
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.foreground,
        drawerStyle: { backgroundColor: theme.colors.card },
        drawerActiveTintColor: theme.colors.primary,
        drawerInactiveTintColor: theme.colors.mutedForeground,
      }}
    >
      <Drawer.Screen
        name="index"
        options={{ title: "Home", drawerLabel: "Home" }}
      />
      <Drawer.Screen
        name="ui-kit"
        options={{ title: "UI Kit", drawerLabel: "UI Kit" }}
      />
      <Drawer.Screen
        name="theme"
        options={{ title: "Theme", drawerLabel: "Theme" }}
      />
    </Drawer>
  );
}
