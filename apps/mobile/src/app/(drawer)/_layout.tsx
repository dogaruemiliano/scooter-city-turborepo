import { Drawer } from "expo-router/drawer";
import { useUnistyles } from "react-native-unistyles";

export default function DrawerLayout() {
  const { theme } = useUnistyles();

  return (
    <Drawer
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface.page },
        headerTintColor: theme.colors.text.primary,
        drawerStyle: { backgroundColor: theme.colors.surface.raised },
        drawerActiveTintColor: theme.colors.surface.action,
        drawerInactiveTintColor: theme.colors.text.secondary,
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
