import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Use the image processor already shipped with Next.js.
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const publicRoot = path.join(webRoot, "public");

for (const theme of ["light", "dark"]) {
  const source = path.join(
    publicRoot,
    "pwa/source/logo-only",
    theme,
    "icon.png",
  );
  const fullLogo = path.join(
    publicRoot,
    "pwa/source/full-logo",
    theme,
    "icon.png",
  );
  const output = path.join(publicRoot, "pwa/icons", theme);
  await mkdir(output, { recursive: true });
  const browserOutput = path.join(publicRoot, "pwa/favicons", theme);
  await mkdir(browserOutput, { recursive: true });
  // The original vector artwork has no baked-in splash background.
  const browserLogo = path.join(
    publicRoot,
    `logo/scooter-city-logo-only-${theme === "dark" ? "light" : "dark"}.svg`,
  );
  for (const size of [16, 32, 48, 192]) {
    await sharp(browserLogo)
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(path.join(browserOutput, `icon-${size}.png`));
  }
  const { data } = await sharp(source)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const background = { r: data[0], g: data[1], b: data[2], alpha: 1 };
  for (const size of [16, 32, 48, 180, 192, 512]) {
    await sharp(source)
      .resize(size, size)
      .flatten({ background })
      .png()
      .toFile(path.join(output, `icon-${size}.png`));
  }
  // Keep the complete artwork within the maskable icon's central safe circle.
  const inset = await sharp(source).resize(358, 358).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background } })
    .composite([{ input: inset, gravity: "center" }])
    .flatten({ background })
    .png()
    .toFile(path.join(output, "maskable-512.png"));
  await mkdir(path.join(publicRoot, "pwa/share"), { recursive: true });
  await sharp(fullLogo)
    .resize(1200, 630, { fit: "contain", background })
    .flatten({ background })
    .png()
    .toFile(path.join(publicRoot, `pwa/share/${theme}.png`));
  const fill = `#${[background.r, background.g, background.b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  const manifest = {
    id: "/",
    name: "ScooterCity",
    short_name: "ScooterCity",
    description: "ScooterCity workspace",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: fill,
    theme_color: fill,
    icons: [
      ...[192, 512].map((size) => ({
        src: `/pwa/icons/${theme}/icon-${size}.png`,
        sizes: `${size}x${size}`,
        type: "image/png",
        purpose: "any",
      })),
      {
        src: `/pwa/icons/${theme}/maskable-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
  const manifestPath =
    theme === "light"
      ? path.join(webRoot, "src/app/manifest.json")
      : path.join(publicRoot, "pwa/manifest-dark.webmanifest");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

// Keep previously installed manifests' icon URLs working with the new artwork.
for (const size of [192, 512]) {
  await copyFile(
    path.join(publicRoot, `pwa/icons/light/icon-${size}.png`),
    path.join(publicRoot, `web-app-manifest-${size}x${size}.png`),
  );
}

// A real multi-resolution ICO for browsers that request /favicon.ico directly.
const sizes = [16, 32, 48];
const frames = await Promise.all(
  sizes.map((size) =>
    sharp(path.join(publicRoot, "pwa/favicons/light", `icon-${size}.png`))
      .ensureAlpha()
      .png()
      .toBuffer(),
  ),
);
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index];
  header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(
  path.join(webRoot, "src/app/favicon.ico"),
  Buffer.concat([header, ...frames]),
);
console.log(
  "Generated light/dark browser, Apple, PWA, maskable, and sharing images.",
);
