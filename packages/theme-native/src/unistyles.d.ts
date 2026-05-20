import type { AppThemes, AppBreakpoints } from "./unistyles-themes";

declare module "react-native-unistyles" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging requires interface form
  export interface UnistylesThemes extends AppThemes {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging requires interface form
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}
