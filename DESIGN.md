---
name: Scooter City
description: A compact operational console with cyan actions and clear neutral surfaces.
colors:
  primary: "var(--primary)"
  primary-foreground: "var(--primary-foreground)"
  link: "var(--link)"
  background: "var(--background)"
  foreground: "var(--foreground)"
  card: "var(--card)"
  popover: "var(--popover)"
  control: "var(--control)"
  muted: "var(--muted)"
  muted-foreground: "var(--muted-foreground)"
  border: "var(--border)"
  warning: "var(--warning)"
  warning-subtle: "var(--warning-subtle)"
  destructive: "var(--destructive)"
typography:
  headline:
    fontFamily: "var(--font-sans)"
    fontSize: "var(--text-2xl)"
    fontWeight: 600
    lineHeight: "var(--leading-tight)"
  title:
    fontFamily: "var(--font-sans)"
    fontSize: "var(--text-base)"
    fontWeight: 600
    lineHeight: "var(--leading-snug)"
  body:
    fontFamily: "var(--font-sans)"
    fontSize: "var(--text-sm)"
    fontWeight: 400
    lineHeight: "var(--leading-normal)"
  label:
    fontFamily: "var(--font-sans)"
    fontSize: "var(--text-xs)"
    fontWeight: 600
    lineHeight: "var(--leading-normal)"
rounded:
  md: "calc(var(--radius) - var(--spacing-0-5))"
  lg: "var(--radius)"
  xl: "calc(var(--radius) + var(--spacing-1))"
  2xl: "calc(var(--radius) + var(--spacing-2))"
spacing:
  "1": "var(--spacing-1)"
  "2": "var(--spacing-2)"
  "3": "var(--spacing-3)"
  "4": "var(--spacing-4)"
  "5": "var(--spacing-5)"
  "6": "var(--spacing-6)"
  "8": "var(--spacing-8)"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    height: "auto"
    padding: "0 var(--spacing-4)"
  button-outline:
    backgroundColor: "{colors.control}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "auto"
    padding: "0 var(--spacing-4)"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "auto"
    padding: "0 var(--spacing-4)"
  input:
    backgroundColor: "{colors.control}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "var(--spacing-12)"
    padding: "var(--spacing-2) var(--spacing-3)"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "var(--spacing-5)"
  chip-warning:
    backgroundColor: "{colors.warning-subtle}"
    textColor: "{colors.warning}"
    rounded: "{rounded.md}"
    height: "var(--spacing-5)"
    padding: "var(--spacing-0-5) var(--spacing-2)"
  sidebar-active:
    backgroundColor: "var(--sidebar-primary)"
    textColor: "var(--sidebar-primary-foreground)"
    rounded: "{rounded.lg}"
    height: "var(--spacing-12)"
    padding: "var(--spacing-2)"
  file-drop-zone:
    backgroundColor: "{colors.control}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.2xl}"
    padding: "var(--spacing-10) var(--spacing-6)"
  segmented-radio:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.xl}"
    padding: "var(--spacing-1)"
  document-review:
    backgroundColor: "{colors.popover}"
    textColor: "var(--popover-foreground)"
    padding: "var(--spacing-6)"
---

# Design System: Scooter City

## Overview

**Creative North Star: "The Fleet Console"**

A compact workspace for fleet and company operations, grounded in the approved UX Pilot Scooter City App visuals. Manrope, neutral surfaces, inset controls, and clear cyan actions make detailed forms easy to scan. Evidence, recorded status, and validation stay legible alongside the task.

This records the built shared system. [Theme tokens](packages/theme/src/tokens/) remain the source of truth; frontmatter and the [preview sidecar](.impeccable/design.json) reference their current CSS variables. For standalone previews, the sidecar resolves utility-only values pruned by Tailwind from the generated theme. Extend tokens first, then shared [UI components](packages/ui/src/components/), then a feature. The product's operating constraints live in [PRODUCT.md](PRODUCT.md).

**Key Characteristics:**

- Compact, practical typography with clear field and section hierarchy.
- Near-black dark pages, neutral panels, and black inset controls.
- Cyan primary actions and active navigation with dark foregrounds.
- Rounded panels, restrained borders, and a subtle cyan action shadow.
- Complete light and dark semantic surfaces.

## Colors

One cyan action accent sits against neutral surfaces; status colors communicate actual feedback.

### Primary

- **Action Cyan** (`primary`): primary buttons and the active sidebar destination, paired with `primary-foreground`.
- **Readable Cyan** (`link`): links and small interactive text. Use its dedicated semantic hover and active states rather than the brighter action fill.

### Neutral

- **Page, panel, temporary surface, control** (`background`, `card`, `popover`, `control`): separate working space, grouped content, temporary UI, and editable fields.
- **Main and supporting text** (`foreground`, `muted-foreground`): primary information and supporting copy; borders provide quiet separation.
- Dark mode layers neutral page → card → popover, with controls inset below them. Light mode uses a mist page, white cards/controls, and dark text; the sidebar retains its dark identity.

Warning marks review needs; destructive marks errors or destructive actions. Success and info use their existing semantic token pairs. Always include a written state.

**The Surface Rule.** Sheets use the popover surface and foreground continuously through header, body, and footer; nested content must not cover the sheet with the page background.

**The Foreground Pair Rule.** Keep semantic surface/foreground pairs together, especially cyan actions and media scrims.

## Typography

**Web sans:** Manrope with system sans fallbacks, loaded in the [root layout](apps/web/src/app/[locale]/layout.tsx). Geist Mono supplies the web monospace variable. Native retains bundled Montserrat and inherits the generated palette and radius.

The same sans family carries headings, body, and controls. Hierarchy comes from the shared size and weight scale rather than decorative type changes.

- **Headline:** `2xl`, semibold, tight; compact page headings.
- **Title:** `base`, semibold, snug; cards and review panels.
- **Body:** `sm`, regular, normal; supporting copy and desktop controls.
- **Label:** `xs`/semibold for compact fields; section headings use `sm`/semibold with uppercase and the shared wide tracking.
- Mobile inputs use `base`; desktop inputs use `sm`. Preserve localized text wrapping.

## Layout

Use the shared [AppShell](apps/web/src/components/AppShell.tsx), responsive sidebar, and page header. Mobile nested routes show a back action; root destinations show the sidebar trigger. The sidebar has expanded, icon-only, and mobile drawer forms.

Spacing follows the shared four-unit base scale. Field groups commonly use step `4`; cards use `5`; page or review padding uses `4`/`6`; larger section gaps use `8`. FormSection can remain on the page or opt into a card panel, and can use one or two columns.

Controls keep touch-friendly base heights (`12` for inputs/default buttons), becoming denser at `md` (`11`). Text buttons use these as minimum heights and grow when labels wrap. Form fields pair only when their section reaches the `formColumns` container threshold; narrow cards remain one column even on a wide viewport. Segmented choices use two columns in narrow controls and one row when `formControls` fits. Document review splits beside evidence at `lg`. Breakpoints remain those in [breakpoints.ts](packages/theme/src/tokens/breakpoints.ts).

Sticky FormActions use a complete shared card, inset from the viewport bottom by page spacing (`4` on phones, `8` from `sm`) plus the device safe area. Its page provides additional end-of-form padding (`16` on phones, `24` from `sm`) so the card rests farther from the bottom edge after scrolling.

[Scooter creation](apps/web/src/app/[locale]/scooters/_components/ScooterCreateFields.tsx) demonstrates the system: import, identity, powertrain, registration, evidence review, optional initial condition before save, and optional full CIV after creation. Its desktop status aside, mobile stacking, and sticky save actions are feature choices, not a universal page template. The existing [scooter-card brief](apps/web/src/app/[locale]/scooters/_components/ScooterCard.design.md) remains separate.

## Elevation & Depth

Tonal layering and borders carry most depth. Primary actions and active navigation use `shadow-primary`; cards stay restrained. Temporary dialogs/sheets use the existing `lg` shadow. The sidecar lists the canonical shadow variables.

State changes use the shared fast duration and standard easing. Sheets use normal duration and decelerate easing. Preserve the existing reduced-motion treatment for animated guidance; avoid decorative motion that competes with form work.

## Shapes

The shared control base is `radius.lg` (12px). Compact segments/badges use `md`; cards use `xl`; raised cards and drop zones use `2xl`. Rounded document-review tops use `3xl` on mobile and become square in a desktop split view.

Borders are subtle at rest. Inputs use an inset control surface, a visible cyan focus ring, and destructive invalid state. Shape and surface roles should remain consistent between light and dark modes.

## Components

- **Buttons:** primary cyan with dark text and the cyan shadow; outline uses control/border; secondary uses the semantic secondary pair; ghost/text reduce emphasis; link uses readable cyan. Shared focus, active, disabled, and invalid states are part of each variant.
- **Cards:** bordered neutral panels with `default`/`sm` density, `default`/`raised` surfaces, and default/transparent/primary border variants. Raised cards use the popover surface. Footers inherit the parent surface.
- **Fields:** shared Input, Select, SearchSelect, and form controls preserve inset surfaces, labels, placeholders, required cues, and associated errors. Do not recreate these styles in feature-local controls.
- **Navigation and badges:** active sidebar items share the primary action treatment. Status badges use semantic tones and written labels; color alone never declares state.
- **FileDropZone:** an inset dashed acquisition area with upload icon, hint, and browse affordance. The feature owns upload limits, processing, and errors.
- **SegmentedRadioGroup:** native radio behavior in a rounded muted track, with neutral/primary/destructive selected tones and visible keyboard focus.
- **DocumentViewer and previews:** a popover surface around real image/PDF evidence. Optional review fields stack below the image on mobile and sit beside it on desktop. At 100%, shared DocumentZoom fits one container axis while preserving the document ratio, without an inset margin. A shared top overlay centers the filename between equal control columns, shows a left close button only with `onClosePress`, and places optional document actions on the right; fullscreen viewers have no separate visible header. Overflowing filenames automatically scroll back and forth using the `documentNameScroll` motion token, stopping for hover, keyboard inspection, and reduced motion. The header remains available during PDF loading/errors. Top and zoom/PDF page overlays use translucent `documentOverlay`/`documentOverlayBorder` semantic tokens (80%/60%); disabled controls show muted icons without background or border. Single-page PDFs show disabled navigation and 1/1. Feature code owns verification/apply/discard state.
- **VIN conflict review:** the first shared BottomSheet contains only an unbiased blank scooter VIN input that uppercases typed or pasted text, validation, and Continue. The second shows one differing or unreadable document at a time, with compact read-only StepProgress dots and VIN header, an underlined Change VIN text action opposite on mobile or adjacent on desktop, and a large inline PdfPreview/DocumentZoom. Pending progress dots and their connecting line use `mutedForeground` for visible contrast against the sheet. The footer retains the original extracted reading and explains confirmation through the primary next/final action, enabled after a three-second countdown for each document. Both sheets use `dismissible={false}` to lock swipes, outside presses, and Escape; preview panning cannot move or close the sheet. Only successful validation completes the flow. Both retain the popover surface and shared dark/cyan controls; saving stays blocked until verification completes.
- **FormActions:** status context and actions adapt to the available card width. Sticky mode uses a bordered, rounded shared Card with a safe-area-aware gap below it; pages retain extra end-of-form clearance.

## Do's and Don'ts

### Do:

- **Do** add missing visual values to the canonical theme before using them.
- **Do** reuse shared components and semantic surface/foreground pairs.
- **Do** verify light/dark contrast, keyboard focus, and English/Romanian wrapping.
- **Do** show real recorded state and explicit review, loading, error, and disabled feedback.
- **Do** keep document evidence inspectable beside or above its review fields.

### Don't:

- **Don't** introduce page-local palettes, radii, spacing, or motion values.
- **Don't** use the page background across a sheet or its full-width children.
- **Don't** put white text on the cyan primary fill or reuse that fill as a small text color.
- **Don't** invent fleet status or replace document evidence with decorative imagery.
