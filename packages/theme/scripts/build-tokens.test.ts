import assert from "node:assert/strict";
import test from "node:test";

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

test("CSS contains the selected Mist preset contract", () => {
  const css = buildCss();
  assert.match(css, /--background: oklch\(1 0 0\)/);
  assert.match(css, /--primary: oklch\(0\.218 0\.008 223\.9\)/);
  assert.match(css, /--sidebar-primary: oklch\(0\.488 0\.243 264\.376\)/);
  assert.match(css, /:root\[data-theme='minimal'\], \.minimal/);
  assert.match(css, /--color-primary-hover: var\(--primary-hover\)/);
  assert.doesNotMatch(css, /--color-surface-/);
});

test("native output converts OKLCH and alpha to hexadecimal sRGB", () => {
  const native = buildNative();
  assert.doesNotMatch(native, /oklch\(/i);
  assert.match(native, /"scrim": "#00000066"/);
  assert.match(native, /"border": "#FFFFFF1A"/);
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
