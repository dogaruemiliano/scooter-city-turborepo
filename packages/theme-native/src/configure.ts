import { StyleSheet } from "react-native-unistyles";
import { themes, breakpoints } from "./unistyles-themes";

StyleSheet.configure({
  themes,
  breakpoints,
  settings: {
    adaptiveThemes: true,
  },
});
