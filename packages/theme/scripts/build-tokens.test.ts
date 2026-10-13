import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { converter, formatHex, wcagContrast } from "culori";

import { aspectRatio } from "../src/tokens/aspect-ratio.js";
import { radius } from "../src/tokens/radius.js";
import { motion } from "../src/tokens/motion.js";
import { semanticColors, semanticBlur } from "../src/tokens/semantic.js";
import { typography } from "../src/tokens/typography.js";
import { zIndex } from "../src/tokens/z-index.js";
import { buildCss, buildNative } from "./build-tokens.js";

test("floating surface blur is available to web and native consumers", () => {
  assert.ok(
    buildCss().includes(
      `--blur-floating-surface: ${semanticBlur.floatingSurface / 16}rem;`,
    ),
  );
  assert.ok(
    buildNative().includes(
      `"floatingSurface": ${semanticBlur.floatingSurface}`,
    ),
  );
});

test("all themes expose the same flat keys", () => {
  const lightKeys = Object.keys(semanticColors.light).sort();

  for (const colors of Object.values(semanticColors)) {
    assert.deepEqual(Object.keys(colors).sort(), lightKeys);
  }
});

test("CSS exposes the brand palette and every semantic color to Tailwind", () => {
  const css = buildCss();

  for (const [name, value] of Object.entries(semanticColors.light)) {
    const cssName = name
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .replace(/([A-Za-z])(\d)/g, "$1-$2")
      .toLowerCase();

    assert.ok(css.includes(`--${cssName}: ${value};`));
    assert.ok(css.includes(`--color-${cssName}: var(--${cssName});`));
  }

  assert.doesNotMatch(css, /minimal/);
  assert.deepEqual(Object.keys(semanticColors), ["light", "dark"]);
  assert.doesNotMatch(css, /--color-surface-/);
});

test("primary actions use the approved cyan with a readable dark foreground", () => {
  for (const colors of Object.values(semanticColors)) {
    assert.equal(formatHex(colors.primary), "#06b6d4");
    assert.equal(formatHex(colors.primaryForeground), "#12161b");
    assert.notEqual(colors.sidebar, colors.sidebarPrimary);
    assert.equal(colors.sidebarPrimary, colors.primary);
    assert.equal(colors.sidebarPrimaryForeground, colors.primaryForeground);
    assert.notEqual(colors.sidebarAccent, colors.sidebarPrimary);
  }
});

test("text and interactive brand states meet AA contrast in every theme", () => {
  for (const [scheme, colors] of Object.entries(semanticColors)) {
    const pairs: Array<[keyof typeof colors, keyof typeof colors]> = [
      ["foreground", "background"],
      ["cardForeground", "card"],
      ["popoverForeground", "popover"],
      ["sidebarForeground", "sidebar"],
      ["sidebarMutedForeground", "sidebar"],
      ["sidebarMutedForeground", "sidebarAccent"],
      ["sidebarAccentForeground", "sidebarAccent"],
      ["sidebarPrimaryForeground", "sidebarPrimary"],
    ];

    for (const surface of ["background", "card", "popover"] as const) {
      for (const foreground of [
        "mutedForeground",
        "link",
        "linkHover",
        "linkActive",
      ] as const) {
        pairs.push([foreground, surface]);
      }
    }

    for (const background of [
      "primary",
      "primaryHover",
      "primaryActive",
    ] as const) {
      pairs.push(["primaryForeground", background]);
    }

    for (const background of [
      "accent",
      "accentHover",
      "accentActive",
    ] as const) {
      pairs.push(["accentForeground", background]);
    }

    for (const [foreground, background] of pairs) {
      const contrast = wcagContrast(colors[foreground], colors[background]);
      assert.ok(
        contrast >= 4.5,
        `${scheme}: ${foreground} on ${background} is ${contrast.toFixed(2)}:1`,
      );
    }
  }
});

test("focus colors remain visible on page, raised, and sidebar surfaces", () => {
  for (const [scheme, colors] of Object.entries(semanticColors)) {
    const pairs = [
      ["ring", "background"],
      ["ring", "card"],
      ["ring", "popover"],
      ["sidebarRing", "sidebar"],
      ["sidebarRing", "sidebarAccent"],
    ] as const;

    for (const [foreground, background] of pairs) {
      const contrast = wcagContrast(colors[foreground], colors[background]);
      assert.ok(
        contrast >= 3,
        `${scheme}: ${foreground} on ${background} is ${contrast.toFixed(2)}:1`,
      );
    }
  }
});

test("popover and bottom-sheet surfaces are distinct from the page in every theme", () => {
  for (const [scheme, colors] of Object.entries(semanticColors)) {
    assert.notEqual(
      formatHex(colors.popover),
      formatHex(colors.background),
      `${scheme} sheets must be visibly separate from the page`,
    );
  }

  assert.notEqual(semanticColors.light.card, semanticColors.light.background);
  assert.notEqual(semanticColors.dark.card, semanticColors.dark.background);
});

test("sheet-select rows are distinct while the sheet retains its popover surface", () => {
  for (const colors of Object.values(semanticColors)) {
    assert.notEqual(formatHex(colors.selectableRow), formatHex(colors.popover));
    assert.ok(wcagContrast(colors.foreground, colors.selectableRow) >= 4.5);
  }
  const sheet = readFileSync(
    new URL("../../ui/src/components/sheet-select.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(sheet, /\bbg-background\b/);
  assert.match(sheet, /snapPoints=\{mobile \? \[bottomSheet.selectSnapPoint\]/);
  assert.match(sheet, /lg:h-\(--select-sheet-height\)/);
  const surface = readFileSync(
    new URL("../../ui/src/components/bottom-sheet.tsx", import.meta.url),
    "utf8",
  );
  assert.match(surface, /\bbg-popover\b/);
  assert.doesNotMatch(surface, /\bbg-background\b/);
});

test("snap-point sheets reserve offscreen height to keep the footer visible", () => {
  const surface = readFileSync(
    new URL("../../ui/src/components/bottom-sheet.tsx", import.meta.url),
    "utf8",
  );
  assert.match(surface, /data-snap-points:pb-\(--drawer-snap-point-offset\)/);
  assert.match(surface, /lg:data-snap-points:pb-0/);
  assert.doesNotMatch(surface, /\[--bottom-sheet-stack-offset:0\]/);
});

test("access workspace inherits every active theme color and exposes the requested type pairing", () => {
  const css = buildCss();
  const workspace = css.match(/\.access-workspace \{([^}]+)\}/)?.[1];
  assert.ok(workspace);
  assert.ok(
    workspace.includes(`font-family: ${typography.fontFamily.body.web};`),
  );
  // Any workspace-local semantic variable would mask a root theme change.
  assert.doesNotMatch(workspace, /--[\w-]+\s*:/);
  assert.doesNotMatch(workspace, /(?:background|color(?:-scheme)?)\s*:/);
  assert.ok(css.includes(`--font-body: ${typography.fontFamily.body.web};`));
  assert.ok(css.includes(`--font-sans: ${typography.fontFamily.sans.web};`));
  assert.doesNotMatch(css, /:root\[data-theme=['"]access/);
  assert.doesNotMatch(css, /--color-access-slate-/);
});

test("native controls follow the selected or system theme", () => {
  const css = buildCss();
  assert.match(css, /:root \{\n {2}color-scheme: light;/);
  assert.match(
    css,
    /@media \(prefers-color-scheme: dark\) \{\n {2}:root:not\(\[data-theme='light'\]\) \{\n {4}color-scheme: dark;/,
  );
  assert.match(
    css,
    /:root\[data-theme='dark'\], \.dark \{\n {2}color-scheme: dark;/,
  );
});

test("Default and Deny selections remain readable in every theme", () => {
  for (const [scheme, colors] of Object.entries(semanticColors)) {
    for (const [foreground, background] of [
      ["secondaryForeground", "secondary"],
      ["destructiveForeground", "destructive"],
    ] as const) {
      const contrast = wcagContrast(colors[foreground], colors[background]);
      assert.ok(
        contrast >= 4.5,
        `${scheme}: ${foreground} on ${background} is ${contrast.toFixed(2)}:1`,
      );
    }
  }
});

test("photo-overlay captions remain readable over the brightest image", () => {
  const rgb = converter("rgb");

  for (const [scheme, colors] of Object.entries(semanticColors)) {
    const scrim = rgb(colors.mediaScrim);
    assert.ok(scrim);
    const alpha = scrim.alpha ?? 1;
    // White is the worst-case image behind a dark overlay and light text.
    const composite = {
      mode: "rgb" as const,
      r: scrim.r * alpha + (1 - alpha),
      g: scrim.g * alpha + (1 - alpha),
      b: scrim.b * alpha + (1 - alpha),
    };
    const contrast = wcagContrast(colors.scrimForeground, composite);

    assert.ok(
      contrast >= 4.5,
      `${scheme}: a photo caption over white is ${contrast.toFixed(2)}:1`,
    );
  }
});

test("native output converts OKLCH and alpha to hexadecimal sRGB", () => {
  const native = buildNative();
  assert.doesNotMatch(native, /oklch\(/i);
  assert.match(native, /"primary": "#06B6D4"/);
  assert.match(native, /"primaryForeground": "#12161B"/);
  assert.match(native, /"sidebarMutedForeground": "#A8B5BF"/);
  assert.match(native, /"scrim": "#00000066"/);
  assert.match(native, /"border": "#27272A"/);
  assert.match(
    native,
    /"magnification": \{\n {4}"loupe": 2,\n {4}"documentMax": 4,\n {4}"documentStep": 0\.5\n {2}\}/,
  );
  assert.doesNotMatch(native, /"minimal": \{/);
});

test("radius values follow the approved rounded control scale", () => {
  assert.equal(radius.sm, 8);
  assert.equal(radius.md, 10);
  assert.equal(radius.lg, 12);
  assert.equal(radius["4xl"], 28);
  assert.equal(radius.full, 9999);
});

test("CSS exposes a utility for every semantic z-index token", () => {
  const css = buildCss();

  for (const [name, value] of Object.entries(zIndex)) {
    const cssName = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();

    assert.match(css, new RegExp(`--z-${cssName}: ${value};`));
    assert.match(
      css,
      new RegExp(
        `@utility z-${cssName} \\{\\n  z-index: var\\(--z-${cssName}\\);`,
      ),
    );
  }
});

test("CSS exposes motion durations through Tailwind's transition namespace", () => {
  const css = buildCss();

  for (const [name, value] of Object.entries(motion.duration)) {
    const cssName = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();

    assert.match(css, new RegExp(`--duration-${cssName}: ${value}ms;`));
    assert.match(
      css,
      new RegExp(`--transition-duration-${cssName}: ${value}ms;`),
    );
  }
});

test("CSS exposes content aspect ratios through Tailwind's aspect namespace", () => {
  const css = buildCss();

  assert.match(
    css,
    new RegExp(`--aspect-receipt-portrait: ${aspectRatio.receiptPortrait};`),
  );
});
