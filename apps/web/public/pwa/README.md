# ScooterCity web assets

The four supplied exports are retained in `source/{full-logo,logo-only}/{light,dark}`,
including every portrait/landscape image and the original device media queries.
The full-logo sets supply iOS launch screens. The logo-only `icon.png` files supply
browser, Apple home-screen, and installed-PWA icons. The logo-only launch images
remain available as source alternatives; they are not advertised as launch screens
because the intended launch artwork is the full logo.

Run `pnpm --filter web generate:pwa-assets` to rebuild icons, padded maskable icons,
the fallback favicon, both manifests, and full-logo social preview images.
The generator preserves the backgrounds from the supplied artwork.

Browser favicons are generated separately from the transparent logo-only SVGs.
They use light artwork for dark browser appearance and dark artwork for light
browser appearance, independently of the saved in-app theme. The fallback ICO
also has a transparent background. Home-screen and maskable icons retain their
platform-appropriate solid backgrounds.

`src/lib/pwa-startup-images.json` records the 48 original device/orientation media
queries. `src/lib/pwa.ts` adds theme matching and emits the metadata. With the system
theme, browser icons and iOS startup links use appearance media queries. Explicit
theme cookies select that theme's metadata on the next server render. Installed
icons and startup artwork can be cached by the OS; changing the theme does not
guarantee that an already installed icon changes immediately.

Android controls its splash using the installed manifest icon and background; a
separate full-logo launch image is not supported by that platform. Sharing services
use the light full-logo preview by default; they do not expose the recipient's theme.
The dark preview is retained at `/pwa/share/dark.png`.

Set `NEXT_PUBLIC_SITE_URL` to the public web origin for absolute sharing-image URLs.
An installed PWA may need to be removed and added again to refresh cached artwork.
