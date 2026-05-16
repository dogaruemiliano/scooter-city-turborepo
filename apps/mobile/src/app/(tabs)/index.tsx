import { View, Text } from "react-native";
import { StyleSheet } from "@repo/theme-native/styles";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface.page,
  },
  title: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize["2xl"],
    fontWeight: theme.typography.fontWeight.semibold.toString() as "600",
  },
}));
