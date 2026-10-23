import type { Metadata } from "next";

import startupImages from "./pwa-startup-images.json";
import type { ThemePreference } from "./theme-cookie";

export function pwaMetadata(preference: ThemePreference): Metadata {
  const themes =
    preference === "system" ? (["light", "dark"] as const) : [preference];
  const media = (theme: string) =>
    preference === "system" ? `(prefers-color-scheme: ${theme})` : undefined;

  return {
    applicationName: "ScooterCity",
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://scooter-city.ro",
    ),
    manifest:
      preference === "dark"
        ? "/pwa/manifest-dark.webmanifest"
        : "/manifest.json",
    icons: {
      // Browser tab contrast follows browser appearance, independently of the app theme.
      icon: (["light", "dark"] as const).flatMap((theme) =>
        [16, 32, 48, 192].map((size) => ({
          url: `/pwa/favicons/${theme}/icon-${size}.png`,
          sizes: `${size}x${size}`,
          type: "image/png",
          media: `(prefers-color-scheme: ${theme})`,
        })),
      ),
      apple: themes.map((theme) => ({
        url: `/pwa/icons/${theme}/icon-180.png`,
        sizes: "180x180",
        type: "image/png",
        media: media(theme),
      })),
    },
    appleWebApp: {
      capable: true,
      title: "ScooterCity",
      statusBarStyle: "default",
      startupImage: themes.flatMap((theme) =>
        startupImages.map((image) => ({
          url: `/pwa/source/full-logo/${theme}/${encodeURIComponent(image.file)}`,
          media: [image.media, media(theme)].filter(Boolean).join(" and "),
        })),
      ),
    },
    openGraph: {
      type: "website",
      siteName: "ScooterCity",
      title: "ScooterCity",
      description: "ScooterCity workspace",
      images: [
        {
          url: "/pwa/share/light.png",
          width: 1200,
          height: 630,
          alt: "ScooterCity",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "ScooterCity",
      description: "ScooterCity workspace",
      images: [{ url: "/pwa/share/light.png", alt: "ScooterCity" }],
    },
  };
}
