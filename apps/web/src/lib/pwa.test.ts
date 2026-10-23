import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { pwaMetadata } from "./pwa";

const publicRoot = path.resolve(process.cwd(), "public");
const assetPath = (url: string) =>
  path.join(publicRoot, decodeURIComponent(url));
const pngSize = (url: string) => {
  const data = readFileSync(assetPath(url));
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
};

describe("PWA assets", () => {
  it.each(["system", "light", "dark"] as const)(
    "keeps browser icons transparent and appearance-aware with %s app theme",
    (preference) => {
      const icons = pwaMetadata(preference).icons;
      if (
        !icons ||
        typeof icons !== "object" ||
        !("icon" in icons) ||
        !Array.isArray(icons.icon)
      )
        throw new Error("Missing icons");
      expect(icons.icon).toHaveLength(8);
      for (const icon of icons.icon) {
        if (typeof icon === "string" || icon instanceof URL)
          throw new Error("Missing icon media");
        const url = String(icon.url);
        const theme = url.includes("/dark/") ? "dark" : "light";
        expect(icon.media).toBe(`(prefers-color-scheme: ${theme})`);
        expect(url).toContain("/pwa/favicons/");
        const png = readFileSync(assetPath(url));
        expect(png[25]).toBe(6);
        const chunks: Buffer[] = [];
        for (let offset = 8; offset < png.length; ) {
          const length = png.readUInt32BE(offset);
          if (png.toString("ascii", offset + 4, offset + 8) === "IDAT")
            chunks.push(png.subarray(offset + 8, offset + 8 + length));
          offset += length + 12;
        }
        // First-row predictors are zero at the corner for every PNG filter.
        expect(inflateSync(Buffer.concat(chunks))[4]).toBe(0);
      }
    },
  );

  it("provides RGBA favicon frames that Next.js can decode", () => {
    const ico = readFileSync(path.resolve("src/app/favicon.ico"));
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    for (let index = 0; index < 3; index++) {
      const frameOffset = ico.readUInt32LE(6 + index * 16 + 12);
      expect(ico.subarray(frameOffset + 1, frameOffset + 4).toString()).toBe(
        "PNG",
      );
      expect(ico[frameOffset + 25]).toBe(6);
    }
  });

  it("provides a matching full-logo launch image for every device and both themes", () => {
    const apple = pwaMetadata("system").appleWebApp;
    if (
      !apple ||
      typeof apple !== "object" ||
      !Array.isArray(apple.startupImage)
    ) {
      throw new Error("Missing Apple startup images");
    }
    expect(apple.startupImage).toHaveLength(96);
    const queries = new Set();
    for (const image of apple.startupImage) {
      if (typeof image === "string" || image instanceof URL)
        throw new Error("Missing media query");
      const url = String(image.url);
      const media = image.media ?? "";
      expect(url).toContain("/source/full-logo/");
      expect(queries.has(media)).toBe(false);
      queries.add(media);
      const width = Number(media.match(/device-width: (\d+)px/)?.[1]);
      const height = Number(media.match(/device-height: (\d+)px/)?.[1]);
      const ratio = Number(media.match(/device-pixel-ratio: (\d+)/)?.[1]);
      const expected = media.includes("orientation: landscape")
        ? [height * ratio, width * ratio]
        : [width * ratio, height * ratio];
      expect(pngSize(url)).toEqual(expected);
      expect(media).toContain("prefers-color-scheme:");
    }
  });

  it.each(["light", "dark"] as const)(
    "uses only %s assets for an explicit theme",
    (theme) => {
      const metadata = pwaMetadata(theme);
      const apple = metadata.appleWebApp;
      if (
        !apple ||
        typeof apple !== "object" ||
        !Array.isArray(apple.startupImage)
      )
        throw new Error("Missing startup images");
      expect(apple.startupImage).toHaveLength(48);
      for (const image of apple.startupImage) {
        if (typeof image === "string" || image instanceof URL)
          throw new Error("Missing media query");
        expect(String(image.url)).toContain(`/full-logo/${theme}/`);
        expect(image.media).not.toContain("prefers-color-scheme");
      }
      expect(pngSize(`/pwa/icons/${theme}/icon-180.png`)).toEqual([180, 180]);
      expect(pngSize(`/pwa/share/${theme}.png`)).toEqual([1200, 630]);
      const manifestPath =
        theme === "light"
          ? path.resolve("src/app/manifest.json")
          : assetPath("/pwa/manifest-dark.webmanifest");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      expect(manifest.id).toBe("/");
      expect(manifest.scope).toBe("/");
      expect(manifest.start_url).toBe("/");
      expect(
        manifest.icons.map((icon: { purpose: string }) => icon.purpose),
      ).toEqual(["any", "any", "maskable"]);
      for (const icon of manifest.icons) {
        expect(existsSync(assetPath(icon.src))).toBe(true);
        expect(pngSize(icon.src).join("x")).toBe(icon.sizes);
        expect(icon.src).toContain(`/icons/${theme}/`);
      }
    },
  );
});
