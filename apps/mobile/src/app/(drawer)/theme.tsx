import { ScrollView, View, type ViewStyle } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { localeLabels, supportedLocales } from "@repo/i18n";
import { DecButton } from "@repo/ui-native/DecButton";
import { DecCard } from "@repo/ui-native/DecCard";
import {
  DecText,
  type DecTextSize,
  type DecTextWeight,
} from "@repo/ui-native/DecText";
import type { ReactNode } from "react";
import { useLocale } from "@/localization";

export default function ThemeScreen() {
  const { theme } = useUnistyles();
  const { locale, manualLocale, setLocale, clearLocalePreference, t } =
    useLocale();

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Section title={t("preferences.language.title")}>
        <DecCard>
          <View style={styles.preferenceCard}>
            <View style={styles.preferenceHeader}>
              <DecText size="sm" color="secondary">
                {t("preferences.language.subtitle")}
              </DecText>
              <DecText size="sm">
                {t("preferences.language.current", {
                  language: localeLabels[locale].label,
                })}
              </DecText>
              <DecText size="xs" color="tertiary">
                {manualLocale === null
                  ? t("preferences.language.sourceDevice")
                  : t("preferences.language.sourceManual")}
              </DecText>
            </View>
            <View style={styles.localeButtonRow}>
              <DecButton
                variant={manualLocale === null ? "primary" : "secondary"}
                onPress={() => {
                  void clearLocalePreference();
                }}
              >
                {t("preferences.language.device")}
              </DecButton>
              {supportedLocales.map((option) => (
                <DecButton
                  key={option}
                  variant={manualLocale === option ? "primary" : "secondary"}
                  onPress={() => {
                    void setLocale(option);
                  }}
                >
                  {localeLabels[option].label}
                </DecButton>
              ))}
            </View>
          </View>
        </DecCard>
      </Section>

      <Section title={t("theme.sections.colors")}>
        <View style={styles.swatchRow}>
          {Object.entries(theme.colors).map(([name, hex]) => (
            <Swatch key={name} name={name} hex={hex} />
          ))}
        </View>
      </Section>

      <Section title={t("theme.sections.spacing")}>
        {Object.entries(theme.spacing).map(([key, value]) => (
          <View key={key} style={styles.row}>
            <DecText size="sm" style={styles.rowLabel}>
              {key}
            </DecText>
            <View style={[styles.spacingBar, { width: value as number }]} />
            <DecText size="xs" color="secondary" style={styles.rowValue}>
              {t("theme.units.pixels", { value: value as number })}
            </DecText>
          </View>
        ))}
      </Section>

      <Section title={t("theme.sections.radius")}>
        <View style={styles.tileRow}>
          {Object.entries(theme.radius).map(([key, value]) => (
            <View key={key} style={styles.tileItem}>
              <View
                style={[styles.radiusBox, { borderRadius: value as number }]}
              />
              <DecText size="xs">{key}</DecText>
              <DecText size="xs" color="tertiary">
                {(value as number) === theme.radius.full
                  ? t("theme.values.full")
                  : t("theme.units.pixels", { value: value as number })}
              </DecText>
            </View>
          ))}
        </View>
      </Section>

      <Section title={t("theme.sections.typographySize")}>
        {Object.entries(theme.typography.fontSize).map(([key, value]) => (
          <View key={key} style={styles.typeSizeItem}>
            <DecText size={key as DecTextSize}>
              {t("theme.samples.size", { name: key })}
            </DecText>
            <DecText size="xs" color="secondary">
              {t("theme.units.pixels", { value: value as number })}
            </DecText>
          </View>
        ))}
      </Section>

      <Section title={t("theme.sections.typographyWeight")}>
        {Object.entries(theme.typography.fontWeight).map(([key, value]) => (
          <View key={key} style={styles.typeRow}>
            <DecText size="lg" weight={key as DecTextWeight}>
              {t("theme.samples.weight", { name: key })}
            </DecText>
            <DecText size="xs" color="secondary">
              {String(value)}
            </DecText>
          </View>
        ))}
      </Section>

      <Section title={t("theme.sections.typographyLineHeight")}>
        {Object.entries(theme.typography.lineHeight).map(([key, value]) => (
          <View key={key} style={styles.typeRow}>
            <DecText
              style={{
                lineHeight:
                  theme.typography.fontSize.base * (value as number),
              }}
            >
              {t("theme.samples.lineHeight", { name: key })}
            </DecText>
            <DecText size="xs" color="secondary">
              {String(value)}
            </DecText>
          </View>
        ))}
      </Section>

      <Section title={t("theme.sections.typographyLetterSpacing")}>
        {Object.entries(theme.typography.letterSpacing).map(([key, value]) => (
          <View key={key} style={styles.typeRow}>
            <DecText style={{ letterSpacing: value as number }}>
              {t("theme.samples.letterSpacing", { name: key })}
            </DecText>
            <DecText size="xs" color="secondary">
              {String(value)}
            </DecText>
          </View>
        ))}
      </Section>

      <Section title={t("theme.sections.shadow")}>
        <View style={styles.shadowRow}>
          {Object.entries(theme.shadow).map(([key, value]) => {
            const shadowStyle = value as ViewStyle;
            return (
              <View key={key} style={styles.shadowItem}>
                <View style={[styles.shadowBox, shadowStyle]} />
                <DecText size="xs">{key}</DecText>
              </View>
            );
          })}
        </View>
      </Section>

      <Section title={t("theme.sections.motionDuration")}>
        {Object.entries(theme.motion.duration).map(([key, value]) => (
          <View key={key} style={styles.row}>
            <DecText size="sm" style={styles.rowLabel}>
              {key}
            </DecText>
            <DecText size="sm" color="secondary" style={styles.rowValue}>
              {t("theme.units.milliseconds", { value: value as number })}
            </DecText>
          </View>
        ))}
      </Section>

      <Section title={t("theme.sections.motionEasing")}>
        {Object.entries(theme.motion.easing).map(([key, value]) => (
          <View key={key} style={styles.row}>
            <DecText size="sm" style={styles.rowLabel}>
              {key}
            </DecText>
            <DecText size="xs" color="secondary" style={styles.rowValue}>
              {value as string}
            </DecText>
          </View>
        ))}
      </Section>

      <Section title={t("theme.sections.zIndex")}>
        {Object.entries(theme.zIndex).map(([key, value]) => (
          <View key={key} style={styles.row}>
            <DecText size="sm" style={styles.rowLabel}>
              {key}
            </DecText>
            <DecText size="sm" color="secondary" style={styles.rowValue}>
              {value as number}
            </DecText>
          </View>
        ))}
      </Section>
    </ScrollView>
  );
}

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <View style={styles.section}>
    <DecText size="2xl" weight="bold" style={styles.sectionTitle}>
      {title}
    </DecText>
    {children}
  </View>
);

const Swatch = ({ name, hex }: { name: string; hex: string }) => (
  <View style={styles.swatchWrap}>
    <View style={[styles.swatch, { backgroundColor: hex }]} />
    <DecText size="xs">{name}</DecText>
    <DecText size="xs" color="tertiary">
      {hex}
    </DecText>
  </View>
);

const styles = StyleSheet.create((theme) => ({
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
    gap: theme.spacing[8],
  },
  section: {
    gap: theme.spacing[3],
  },
  sectionTitle: {
    marginBottom: theme.spacing[1],
  },
  preferenceCard: {
    gap: theme.spacing[3],
  },
  preferenceHeader: {
    gap: theme.spacing[1],
  },
  localeButtonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  swatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  swatchWrap: {
    width: theme.spacing[20],
    gap: theme.spacing[1],
  },
  swatch: {
    width: "100%",
    height: theme.spacing[12],
    borderRadius: theme.radius.md,
    borderWidth: theme.spacing.px,
    borderColor: theme.colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  rowLabel: {
    width: theme.spacing[18],
  },
  rowValue: {
    marginLeft: "auto",
  },
  spacingBar: {
    height: theme.spacing[3],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
  },
  tileRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[4],
  },
  tileItem: {
    alignItems: "center",
    gap: theme.spacing[1],
  },
  radiusBox: {
    width: theme.spacing[18],
    height: theme.spacing[18],
    backgroundColor: theme.colors.accent,
    borderWidth: theme.spacing.px,
    borderColor: theme.colors.border,
  },
  typeRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  typeSizeItem: {
    gap: theme.spacing[1],
  },
  shadowRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[6],
    paddingVertical: theme.spacing[4],
  },
  shadowItem: {
    alignItems: "center",
    gap: theme.spacing[2],
  },
  shadowBox: {
    width: theme.spacing[18],
    height: theme.spacing[18],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.card,
  },
}));
