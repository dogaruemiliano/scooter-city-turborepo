import { useRef } from "react";
import { ScrollView, View, type ViewProps } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { DecBadge } from "@repo/ui-native/DecBadge";
import {
  DecBottomSheet,
  type DecBottomSheetRef,
} from "@repo/ui-native/DecBottomSheet";
import { DecButton } from "@repo/ui-native/DecButton";
import { DecCard } from "@repo/ui-native/DecCard";
import { DecInput } from "@repo/ui-native/DecInput";
import { DecText } from "@repo/ui-native/DecText";
import { useTranslation } from "@/localization";

export default function UIKitScreen() {
  const dynamicSheetRef = useRef<DecBottomSheetRef>(null);
  const fixedSheetRef = useRef<DecBottomSheetRef>(null);
  const customHeaderSheetRef = useRef<DecBottomSheetRef>(null);
  const { t } = useTranslation();

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <DecText size="3xl" weight="bold">
          {t("uiKit.header.title")}
        </DecText>
        <DecText size="sm" color="secondary">
          {t("uiKit.header.subtitle")}
        </DecText>
      </View>

      <Section
        title={t("uiKit.sections.decButton.title")}
        subtitle={t("uiKit.sections.decButton.subtitle")}
      >
        <Group label={t("uiKit.groups.variants")}>
          <Row>
            <DecButton variant="primary">
              {t("uiKit.buttons.primary")}
            </DecButton>
            <DecButton variant="secondary">
              {t("uiKit.buttons.secondary")}
            </DecButton>
          </Row>
        </Group>
        <Group label={t("uiKit.groups.sizes")}>
          <Row>
            <DecButton size="sm">{t("uiKit.buttons.small")}</DecButton>
            <DecButton size="md">{t("uiKit.buttons.medium")}</DecButton>
            <DecButton size="lg">{t("uiKit.buttons.large")}</DecButton>
          </Row>
        </Group>
        <Group label={t("uiKit.groups.disabled")}>
          <Row>
            <DecButton disabled>{t("uiKit.buttons.primary")}</DecButton>
            <DecButton variant="secondary" disabled>
              {t("uiKit.buttons.secondary")}
            </DecButton>
          </Row>
        </Group>
      </Section>

      <Section
        title={t("uiKit.sections.decCard.title")}
        subtitle={t("uiKit.sections.decCard.subtitle")}
      >
        <Group label={t("uiKit.groups.paddingScales")}>
          <DecCard padding="sm">
            <DecText size="sm">{t("uiKit.card.paddingSm")}</DecText>
          </DecCard>
          <DecCard padding="md">
            <DecText size="sm">{t("uiKit.card.paddingMd")}</DecText>
          </DecCard>
          <DecCard padding="lg">
            <DecText size="sm">{t("uiKit.card.paddingLg")}</DecText>
          </DecCard>
        </Group>
        <Group label={t("uiKit.groups.composition")}>
          <DecCard>
            <DecText size="lg" weight="semibold">
              {t("uiKit.card.title")}
            </DecText>
            <View style={styles.cardBody}>
              <DecText size="sm" color="secondary">
                {t("uiKit.card.body")}
              </DecText>
              <Row>
                <DecBadge variant="action">
                  {t("uiKit.card.badgeFeatured")}
                </DecBadge>
                <DecBadge variant="success">
                  {t("uiKit.card.badgeStable")}
                </DecBadge>
              </Row>
            </View>
          </DecCard>
        </Group>
      </Section>

      <Section
        title={t("uiKit.sections.decBadge.title")}
        subtitle={t("uiKit.sections.decBadge.subtitle")}
      >
        <Group label={t("uiKit.groups.variantsSm")}>
          <Row>
            <DecBadge variant="neutral">{t("uiKit.badges.neutral")}</DecBadge>
            <DecBadge variant="action">{t("uiKit.badges.action")}</DecBadge>
            <DecBadge variant="danger">{t("uiKit.badges.danger")}</DecBadge>
            <DecBadge variant="success">{t("uiKit.badges.success")}</DecBadge>
            <DecBadge variant="warning">{t("uiKit.badges.warning")}</DecBadge>
          </Row>
        </Group>
        <Group label={t("uiKit.groups.variantsMd")}>
          <Row>
            <DecBadge variant="neutral" size="md">
              {t("uiKit.badges.neutral")}
            </DecBadge>
            <DecBadge variant="action" size="md">
              {t("uiKit.badges.action")}
            </DecBadge>
            <DecBadge variant="danger" size="md">
              {t("uiKit.badges.danger")}
            </DecBadge>
            <DecBadge variant="success" size="md">
              {t("uiKit.badges.success")}
            </DecBadge>
            <DecBadge variant="warning" size="md">
              {t("uiKit.badges.warning")}
            </DecBadge>
          </Row>
        </Group>
      </Section>

      <Section
        title={t("uiKit.sections.decText.title")}
        subtitle={t("uiKit.sections.decText.subtitle")}
      >
        <Group label={t("uiKit.groups.sizeScale")}>
          <DecText size="xs">{t("uiKit.text.sizeXs")}</DecText>
          <DecText size="sm">{t("uiKit.text.sizeSm")}</DecText>
          <DecText size="base">{t("uiKit.text.sizeBase")}</DecText>
          <DecText size="lg">{t("uiKit.text.sizeLg")}</DecText>
          <DecText size="xl">{t("uiKit.text.sizeXl")}</DecText>
          <DecText size="2xl">{t("uiKit.text.size2xl")}</DecText>
          <DecText size="3xl">{t("uiKit.text.size3xl")}</DecText>
          <DecText size="4xl">{t("uiKit.text.size4xl")}</DecText>
          <DecText size="5xl">{t("uiKit.text.size5xl")}</DecText>
        </Group>
        <Group label={t("uiKit.groups.weights")}>
          <DecText weight="regular">{t("uiKit.text.weightRegular")}</DecText>
          <DecText weight="medium">{t("uiKit.text.weightMedium")}</DecText>
          <DecText weight="semibold">
            {t("uiKit.text.weightSemibold")}
          </DecText>
          <DecText weight="bold">{t("uiKit.text.weightBold")}</DecText>
        </Group>
        <Group label={t("uiKit.groups.semanticColors")}>
          <DecText color="primary">
            {t("uiKit.text.semanticPrimary")}
          </DecText>
          <DecText color="secondary">
            {t("uiKit.text.semanticSecondary")}
          </DecText>
          <DecText color="tertiary">
            {t("uiKit.text.semanticTertiary")}
          </DecText>
          <DecText color="disabled">
            {t("uiKit.text.semanticDisabled")}
          </DecText>
        </Group>
      </Section>

      <Section
        title={t("uiKit.sections.decInput.title")}
        subtitle={t("uiKit.sections.decInput.subtitle")}
      >
        <Group label={t("uiKit.groups.states")}>
          <DecInput placeholder={t("uiKit.input.placeholderDefault")} />
          <DecInput
            placeholder={t("uiKit.input.placeholderPrefilled")}
            defaultValue={t("uiKit.input.defaultValue")}
          />
          <DecInput
            placeholder={t("uiKit.input.placeholderWithError")}
            error={t("uiKit.input.error")}
            defaultValue="bad@"
          />
          <DecInput
            placeholder={t("uiKit.input.placeholderDisabled")}
            editable={false}
            value={t("uiKit.input.disabledValue")}
          />
        </Group>
        <Group label={t("uiKit.groups.withLabelAndHint")}>
          <DecInput
            label={t("uiKit.input.emailLabel")}
            hint={t("uiKit.input.emailHint")}
            placeholder={t("uiKit.input.placeholderEmail")}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </Group>
        <Group label={t("uiKit.groups.withLabelAndError")}>
          <DecInput
            label={t("uiKit.input.emailLabel")}
            error={t("uiKit.input.emailError")}
            defaultValue="bad@"
            placeholder={t("uiKit.input.placeholderEmail")}
          />
        </Group>
        <Group label={t("uiKit.groups.labelOnly")}>
          <DecInput
            label={t("uiKit.input.displayNameLabel")}
            placeholder={t("uiKit.input.placeholderDisplayName")}
          />
        </Group>
      </Section>

      <Section
        title={t("uiKit.sections.decBottomSheet.title")}
        subtitle={t("uiKit.sections.decBottomSheet.subtitle")}
      >
        <Group label={t("uiKit.groups.dynamicFitsContent")}>
          <Row>
            <DecButton onPress={() => dynamicSheetRef.current?.present()}>
              {t("uiKit.buttons.openDynamic")}
            </DecButton>
          </Row>
        </Group>
        <Group label={t("uiKit.groups.fixedSnapPoints")}>
          <Row>
            <DecButton onPress={() => fixedSheetRef.current?.present()}>
              {t("uiKit.buttons.openFixed")}
            </DecButton>
          </Row>
        </Group>
        <Group label={t("uiKit.groups.customHeaderNode")}>
          <Row>
            <DecButton onPress={() => customHeaderSheetRef.current?.present()}>
              {t("uiKit.buttons.openCustomHeader")}
            </DecButton>
          </Row>
        </Group>
      </Section>

      <DecBottomSheet
        ref={dynamicSheetRef}
        header={t("uiKit.sheet.quickActions")}
      >
        <DecText size="sm" color="secondary">
          {t("uiKit.sheet.dynamicBody")}
        </DecText>
        <DecButton onPress={() => dynamicSheetRef.current?.dismiss()}>
          {t("uiKit.buttons.done")}
        </DecButton>
      </DecBottomSheet>

      <DecBottomSheet
        ref={fixedSheetRef}
        header={t("uiKit.sheet.filters")}
        snapPoints={["50%", "90%"]}
      >
        <DecText size="sm" color="secondary">
          {t("uiKit.sheet.fixedBody")}
        </DecText>
        <DecBadge variant="action">{t("uiKit.badges.action")}</DecBadge>
        <DecBadge variant="success">{t("uiKit.badges.success")}</DecBadge>
        <DecBadge variant="warning">{t("uiKit.badges.warning")}</DecBadge>
        <DecBadge variant="danger">{t("uiKit.badges.danger")}</DecBadge>
      </DecBottomSheet>

      <DecBottomSheet
        ref={customHeaderSheetRef}
        header={
          <View style={styles.customHeader}>
            <DecBadge variant="action">{t("uiKit.sheet.customBadge")}</DecBadge>
            <DecText size="lg" weight="bold">
              {t("uiKit.sheet.customHeader")}
            </DecText>
          </View>
        }
      >
        <DecText size="sm" color="secondary">
          {t("uiKit.sheet.customBody")}
        </DecText>
        <DecButton
          variant="secondary"
          onPress={() => customHeaderSheetRef.current?.dismiss()}
        >
          {t("uiKit.buttons.close")}
        </DecButton>
      </DecBottomSheet>
    </ScrollView>
  );
}

const Section = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <DecText size="2xl" weight="semibold">
        {title}
      </DecText>
      {subtitle ? (
        <DecText size="sm" color="secondary">
          {subtitle}
        </DecText>
      ) : null}
    </View>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

const Group = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <View style={styles.group}>
    <DecText size="xs" weight="medium" color="tertiary">
      {label.toUpperCase()}
    </DecText>
    <View style={styles.groupBody}>{children}</View>
  </View>
);

const Row = ({ children, style, ...rest }: ViewProps) => (
  <View style={[styles.row, style]} {...rest}>
    {children}
  </View>
);

const styles = StyleSheet.create((theme, rt) => ({
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingTop: rt.insets.top + theme.spacing[4],
    paddingBottom: rt.insets.bottom + theme.spacing[16],
    paddingHorizontal: theme.spacing[5],
    gap: theme.spacing[8],
  },
  header: {
    gap: theme.spacing[2],
  },
  section: {
    gap: theme.spacing[4],
    paddingTop: theme.spacing[4],
    borderTopWidth: theme.spacing.px,
    borderTopColor: theme.colors.border,
  },
  sectionHeader: {
    gap: theme.spacing[1],
  },
  sectionBody: {
    gap: theme.spacing[5],
  },
  group: {
    gap: theme.spacing[2],
  },
  groupBody: {
    gap: theme.spacing[3],
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  cardBody: {
    marginTop: theme.spacing[2],
    gap: theme.spacing[3],
  },
  customHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
}));
