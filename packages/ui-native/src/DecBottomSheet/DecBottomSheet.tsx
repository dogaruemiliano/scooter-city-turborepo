import { forwardRef, useCallback, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  useBottomSheetModal,
  type BottomSheetBackdropProps,
  type BottomSheetModalProps,
} from "@gorhom/bottom-sheet";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { DecBlur } from "../DecBlur";
import { DecText } from "../DecText";
import { BlurTint } from "expo-blur";

export type DecBottomSheetRef = BottomSheetModal;

export interface DecBottomSheetProps extends Omit<
  BottomSheetModalProps,
  | "snapPoints"
  | "backdropComponent"
  | "backgroundStyle"
  | "handleStyle"
  | "handleIndicatorStyle"
  | "enableDynamicSizing"
  | "children"
> {
  /**
   * Optional header. Pass a string to render the default header (title +
   * close button); pass a ReactNode to take over the slot entirely.
   */
  header?: string | ReactNode;
  /** Show the drag indicator. Default true. */
  showHandle?: boolean;
  /**
   * Optional fixed snap points (e.g. `["50%", "90%"]`). Omit to enable
   * dynamic sizing — the sheet fits its content.
   */
  snapPoints?: (string | number)[];
  children: ReactNode;
}

export const DecBottomSheet = forwardRef<
  DecBottomSheetRef,
  DecBottomSheetProps
>(function DecBottomSheet(
  { header, showHandle = true, snapPoints, children, ...rest },
  ref,
) {
  const { theme, rt } = useUnistyles();
  const dynamicSizing = !snapPoints;
  const blurTint: BlurTint =
    rt.themeName === "dark"
      ? "systemThickMaterialDark"
      : "systemThickMaterialDark";

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={1}
        pressBehavior="close"
        style={[props.style, styles.backdropTransparent]}
      >
        <DecBlur
          intensity={15}
          tint={blurTint}
          fallbackColor={theme.colors.scrim}
          style={StyleSheet.absoluteFillObject}
        />
      </BottomSheetBackdrop>
    ),
    [blurTint, theme.colors.scrim],
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing={dynamicSizing}
      snapPoints={snapPoints}
      enablePanDownToClose
      handleStyle={showHandle ? styles.handle : styles.handleHidden}
      handleIndicatorStyle={styles.handleIndicator}
      backgroundStyle={styles.background}
      backdropComponent={renderBackdrop}
      {...rest}
    >
      <BottomSheetView style={styles.content}>
        {header !== undefined ? <SheetHeader header={header} /> : null}
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

const SheetHeader = ({ header }: { header: string | ReactNode }) => {
  const { dismiss } = useBottomSheetModal();

  if (typeof header !== "string") {
    return <>{header}</>;
  }

  return (
    <View style={styles.headerRow}>
      <DecText size="lg" weight="semibold" style={styles.headerTitle}>
        {header}
      </DecText>
      <Pressable
        onPress={() => dismiss()}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={({ pressed }) => [
          styles.closeButton,
          pressed && styles.closeButtonPressed,
        ]}
      >
        <DecText size="lg" color="secondary">
          ✕
        </DecText>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  backdropTransparent: {
    backgroundColor: "transparent",
  },
  background: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
  },
  handle: {
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  handleHidden: {
    height: 0,
    padding: 0,
  },
  handleIndicator: {
    backgroundColor: theme.colors.borderStrong,
    width: theme.spacing[9],
  },
  content: {
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[6],
    gap: theme.spacing[4],
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  headerTitle: {
    flex: 1,
  },
  closeButton: {
    width: theme.spacing[8],
    height: theme.spacing[8],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  closeButtonPressed: {
    backgroundColor: theme.colors.muted,
  },
}));
