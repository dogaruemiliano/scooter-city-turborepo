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

export default function UIKitScreen() {
  const dynamicSheetRef = useRef<DecBottomSheetRef>(null);
  const fixedSheetRef = useRef<DecBottomSheetRef>(null);
  const customHeaderSheetRef = useRef<DecBottomSheetRef>(null);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <DecText size="3xl" weight="bold">
          Components
        </DecText>
        <DecText size="sm" color="secondary">
          A reference for every component currently exported from
          @repo/ui-native.
        </DecText>
      </View>

      <Section
        title="DecButton"
        subtitle="Pressable action. Variants × sizes × disabled state."
      >
        <Group label="Variants">
          <Row>
            <DecButton variant="primary">Primary</DecButton>
            <DecButton variant="secondary">Secondary</DecButton>
          </Row>
        </Group>
        <Group label="Sizes">
          <Row>
            <DecButton size="sm">Small</DecButton>
            <DecButton size="md">Medium</DecButton>
            <DecButton size="lg">Large</DecButton>
          </Row>
        </Group>
        <Group label="Disabled">
          <Row>
            <DecButton disabled>Primary</DecButton>
            <DecButton variant="secondary" disabled>
              Secondary
            </DecButton>
          </Row>
        </Group>
      </Section>

      <Section
        title="DecCard"
        subtitle="Surface container with three padding scales. Children are arbitrary."
      >
        <Group label="Padding scales">
          <DecCard padding="sm">
            <DecText size="sm">
              padding=&quot;sm&quot; — spacing[3] (12px)
            </DecText>
          </DecCard>
          <DecCard padding="md">
            <DecText size="sm">
              padding=&quot;md&quot; — spacing[4] (16px, default)
            </DecText>
          </DecCard>
          <DecCard padding="lg">
            <DecText size="sm">
              padding=&quot;lg&quot; — spacing[6] (24px)
            </DecText>
          </DecCard>
        </Group>
        <Group label="Composition">
          <DecCard>
            <DecText size="lg" weight="semibold">
              Card title
            </DecText>
            <View style={styles.cardBody}>
              <DecText size="sm" color="secondary">
                Cards compose with any child. Here a title, body text, and a row
                of badges.
              </DecText>
              <Row>
                <DecBadge variant="action">Featured</DecBadge>
                <DecBadge variant="success">Stable</DecBadge>
              </Row>
            </View>
          </DecCard>
        </Group>
      </Section>

      <Section
        title="DecBadge"
        subtitle="Pill-shaped status label. 5 variants × 2 sizes."
      >
        <Group label="Variants — sm">
          <Row>
            <DecBadge variant="neutral">neutral</DecBadge>
            <DecBadge variant="action">action</DecBadge>
            <DecBadge variant="danger">danger</DecBadge>
            <DecBadge variant="success">success</DecBadge>
            <DecBadge variant="warning">warning</DecBadge>
          </Row>
        </Group>
        <Group label="Variants — md">
          <Row>
            <DecBadge variant="neutral" size="md">
              neutral
            </DecBadge>
            <DecBadge variant="action" size="md">
              action
            </DecBadge>
            <DecBadge variant="danger" size="md">
              danger
            </DecBadge>
            <DecBadge variant="success" size="md">
              success
            </DecBadge>
            <DecBadge variant="warning" size="md">
              warning
            </DecBadge>
          </Row>
        </Group>
      </Section>

      <Section
        title="DecText"
        subtitle="9 size steps × 4 weights × 4 semantic colors. Backed by typography tokens."
      >
        <Group label="Size scale">
          <DecText size="xs">xs — 12px</DecText>
          <DecText size="sm">sm — 14px</DecText>
          <DecText size="base">base — 16px (default)</DecText>
          <DecText size="lg">lg — 18px</DecText>
          <DecText size="xl">xl — 20px</DecText>
          <DecText size="2xl">2xl — 24px</DecText>
          <DecText size="3xl">3xl — 30px</DecText>
          <DecText size="4xl">4xl — 36px</DecText>
          <DecText size="5xl">5xl — 48px</DecText>
        </Group>
        <Group label="Weights">
          <DecText weight="regular">regular — 400</DecText>
          <DecText weight="medium">medium — 500</DecText>
          <DecText weight="semibold">semibold — 600</DecText>
          <DecText weight="bold">bold — 700</DecText>
        </Group>
        <Group label="Semantic colors">
          <DecText color="primary">
            color=&quot;primary&quot; — text.primary
          </DecText>
          <DecText color="secondary">
            color=&quot;secondary&quot; — text.secondary
          </DecText>
          <DecText color="tertiary">
            color=&quot;tertiary&quot; — text.tertiary
          </DecText>
          <DecText color="disabled">
            color=&quot;disabled&quot; — text.disabled
          </DecText>
        </Group>
      </Section>

      <Section
        title="DecInput"
        subtitle="Single-line text input. Border reacts to focus / error / editable. Optional label, hint, and error text."
      >
        <Group label="States">
          <DecInput placeholder="Default — tap to focus me" />
          <DecInput
            placeholder="Pre-filled"
            defaultValue="some content already typed"
          />
          <DecInput
            placeholder="With error"
            error="Something's off."
            defaultValue="bad@"
          />
          <DecInput
            placeholder="Disabled"
            editable={false}
            value="cannot edit"
          />
        </Group>
        <Group label="With label and hint">
          <DecInput
            label="Email"
            hint="We'll never share it."
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </Group>
        <Group label="With label and error">
          <DecInput
            label="Email"
            error="Enter a valid email address."
            defaultValue="bad@"
            placeholder="you@example.com"
          />
        </Group>
        <Group label="Label only">
          <DecInput label="Display name" placeholder="Jane Doe" />
        </Group>
      </Section>

      <Section
        title="DecBottomSheet"
        subtitle="Ref-based modal sheet. Dynamic height by default; pass snapPoints for fixed sizes. Header is a string (auto close button) or a custom node."
      >
        <Group label="Dynamic — fits content">
          <Row>
            <DecButton onPress={() => dynamicSheetRef.current?.present()}>
              Open dynamic
            </DecButton>
          </Row>
        </Group>
        <Group label="Fixed snap points — 50% / 90%">
          <Row>
            <DecButton onPress={() => fixedSheetRef.current?.present()}>
              Open fixed
            </DecButton>
          </Row>
        </Group>
        <Group label="Custom header node">
          <Row>
            <DecButton onPress={() => customHeaderSheetRef.current?.present()}>
              Open custom header
            </DecButton>
          </Row>
        </Group>
      </Section>

      <DecBottomSheet ref={dynamicSheetRef} header="Quick actions">
        <DecText size="sm" color="secondary">
          The sheet auto-sizes to fit its content. Drag down or tap the backdrop
          to dismiss.
        </DecText>
        <DecButton onPress={() => dynamicSheetRef.current?.dismiss()}>
          Done
        </DecButton>
      </DecBottomSheet>

      <DecBottomSheet
        ref={fixedSheetRef}
        header="Filters"
        snapPoints={["50%", "90%"]}
      >
        <DecText size="sm" color="secondary">
          Fixed snap points. Drag the handle up to expand, down to collapse or
          dismiss.
        </DecText>
        <DecBadge variant="action">action</DecBadge>
        <DecBadge variant="success">success</DecBadge>
        <DecBadge variant="warning">warning</DecBadge>
        <DecBadge variant="danger">danger</DecBadge>
      </DecBottomSheet>

      <DecBottomSheet
        ref={customHeaderSheetRef}
        header={
          <View style={styles.customHeader}>
            <DecBadge variant="action">Custom</DecBadge>
            <DecText size="lg" weight="bold">
              Anything fits here
            </DecText>
          </View>
        }
      >
        <DecText size="sm" color="secondary">
          When `header` is a ReactNode, the wrapper renders it as-is — no
          built-in close button, you compose whatever you need.
        </DecText>
        <DecButton
          variant="secondary"
          onPress={() => customHeaderSheetRef.current?.dismiss()}
        >
          Close
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
