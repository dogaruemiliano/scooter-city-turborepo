import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { DecText } from "@repo/ui-native/DecText";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <DecText size="3xl" weight="bold">
        Home
      </DecText>
      <DecText size="base" color="secondary">
        Welcome — open the drawer to navigate.
      </DecText>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    backgroundColor: theme.colors.background,
  },
}));
