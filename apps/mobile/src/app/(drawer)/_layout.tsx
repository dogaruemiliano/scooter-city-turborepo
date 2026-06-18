import { Drawer } from "expo-router/drawer";
import { useUnistyles } from "react-native-unistyles";
import { useTranslation } from "@/localization";

export default function DrawerLayout() {
  const { theme } = useUnistyles();
  const { t } = useTranslation();

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
        options={{ title: t("nav.home"), drawerLabel: t("nav.home") }}
      />
      <Drawer.Screen
        name="ui-kit"
        options={{ title: t("nav.uiKit"), drawerLabel: t("nav.uiKit") }}
      />
      <Drawer.Screen
        name="theme"
        options={{ title: t("nav.theme"), drawerLabel: t("nav.theme") }}
      />
    </Drawer>
  );
}
