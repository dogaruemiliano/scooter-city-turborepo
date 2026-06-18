import assert from "node:assert/strict";
import test from "node:test";

import { radius } from "../src/tokens/radius.js";
import { semanticColors } from "../src/tokens/semantic.js";
import { zIndex } from "../src/tokens/z-index.js";
import { buildCss, buildNative } from "./build-tokens.js";

test("light and dark themes expose the same flat keys", () => {
  assert.deepEqual(
    Object.keys(semanticColors.light).sort(),
    Object.keys(semanticColors.dark).sort(),
  );
});

test("CSS contains the selected Mist preset contract", () => {
  const css = buildCss();
  assert.match(css, /--background: oklch\(1 0 0\)/);
  assert.match(css, /--primary: oklch\(0\.218 0\.008 223\.9\)/);
  assert.match(css, /--sidebar-primary: oklch\(0\.488 0\.243 264\.376\)/);
  assert.match(css, /--color-primary-hover: var\(--primary-hover\)/);
  assert.doesNotMatch(css, /--color-surface-/);
});

test("native output converts OKLCH and alpha to hexadecimal sRGB", () => {
  const native = buildNative();
  assert.doesNotMatch(native, /oklch\(/i);
  assert.match(native, /"scrim": "#00000066"/);
  assert.match(native, /"border": "#FFFFFF1A"/);
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
    assert.match(css, new RegExp(`--z-${name}: ${value};`));
    assert.match(
      css,
      new RegExp(`@utility z-${name} \\{\\n  z-index: var\\(--z-${name}\\);`),
    );
  }
});
