import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useUnistyles } from "@repo/theme-native/styles";

const AppTabs = () => {
  const { theme } = useUnistyles();

  return (
    <NativeTabs
      backgroundColor={theme.colors.surface.page}
      indicatorColor={theme.colors.surface.raised}
      labelStyle={{ selected: { color: theme.colors.text.primary } }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require("@/assets/images/tabIcons/home.png")}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="components">
        <NativeTabs.Trigger.Label>Components</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require("@/assets/images/tabIcons/explore.png")}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
};

export default AppTabs;
