import {
  Tabs,
  TabList,
  TabSlot,
  TabTrigger,
  type TabTriggerSlotProps,
} from "expo-router/ui";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "@repo/theme-native/styles";

const AppTabs = () => {
  return (
    <Tabs>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <View style={styles.list}>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Home</TabButton>
          </TabTrigger>
          <TabTrigger name="components" href="/components" asChild>
            <TabButton>Components</TabButton>
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
};

const TabButton = ({ children, isFocused, ...props }: TabTriggerSlotProps) => {
  styles.useVariants({ focused: !!isFocused });
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <View style={styles.button}>
        <Text style={styles.buttonLabel}>{children}</Text>
      </View>
    </Pressable>
  );
};

export default AppTabs;

const styles = StyleSheet.create((theme) => ({
  slot: {
    height: "100%",
  },
  list: {
    position: "absolute",
    width: "100%",
    padding: theme.spacing[4],
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  button: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.radius.md,
    variants: {
      focused: {
        true: { backgroundColor: theme.colors.surface.sunken },
        false: { backgroundColor: theme.colors.surface.raised },
      },
    },
  },
  buttonLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium.toString() as "500",
    variants: {
      focused: {
        true: { color: theme.colors.text.primary },
        false: { color: theme.colors.text.secondary },
      },
    },
  },
  pressed: {
    opacity: 0.7,
  },
}));
