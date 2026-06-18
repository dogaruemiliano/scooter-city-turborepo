import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { DecText } from "@repo/ui-native/DecText";
import { useTranslation } from "@/localization";

export default function HomeScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <DecText size="3xl" weight="bold">
        {t("home.title")}
      </DecText>
      <DecText size="base" color="secondary">
        {t("home.welcome")}
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
