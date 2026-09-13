import assert from "node:assert/strict";
import test from "node:test";

import { converter, formatHex, wcagContrast } from "culori";

import { aspectRatio } from "../src/tokens/aspect-ratio.js";
import { radius } from "../src/tokens/radius.js";
import { motion } from "../src/tokens/motion.js";
import { semanticColors } from "../src/tokens/semantic.js";
import { zIndex } from "../src/tokens/z-index.js";
import { buildCss, buildNative } from "./build-tokens.js";

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

  assert.match(css, /:root\[data-theme='minimal'\], \.minimal/);
  assert.doesNotMatch(css, /--color-surface-/);
});

test("primary actions and the sidebar preserve ScooterCity's logo colors", () => {
  for (const colors of Object.values(semanticColors)) {
    assert.equal(formatHex(colors.primary), "#44bbcb");
    assert.equal(formatHex(colors.primaryForeground), "#12161b");
    assert.equal(formatHex(colors.sidebar), "#12161b");
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
  assert.match(native, /"primary": "#44BBCB"/);
  assert.match(native, /"primaryForeground": "#12161B"/);
  assert.match(native, /"sidebarMutedForeground": "#A8B5BF"/);
  assert.match(native, /"scrim": "#00000066"/);
  assert.match(native, /"border": "#FFFFFF1A"/);
  assert.match(native, /"magnification": \{\n {4}"loupe": 2\n {2}\}/);
  assert.doesNotMatch(native, /"minimal": \{/);
});

test("radius values are derived from the 0.45rem preset base", () => {
  assert.equal(radius.sm, 3.2);
  assert.equal(radius.md, 5.2);
  assert.equal(radius.lg, 7.2);
  assert.equal(radius["4xl"], 23.2);
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
