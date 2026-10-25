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

Every page uses the shared [PageLayout](packages/ui/src/components/page-layout.tsx) exactly once, either in a section route layout (finance/company) or in the screen component. Its default is a centered, `xl`-bounded container with responsive theme gutters and consistent top spacing; loading and error views use the same boundary. `width="form"` and `width="full"` are explicit exceptions. Wizards retain app navigation and use `paddingX="none"` with `paddingTop="compact"`; WizardForm inherits the page gutter so its progress, fields, and actions align without double padding. Inner field widths, sticky actions, sheet surfaces, standalone sign-in positioning, and full-screen camera capture retain their own purposeful layouts. PageLayout does not introduce a scroll or clipping boundary.

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
- **Cards:** bordered neutral panels with `default`/`sm`/`comfortable` density, `default`/`raised` surfaces, and default/transparent/primary border variants. Comfortable cards use spacing step `5`; optional CardAccent supplies a straight left strip clipped by the outer card silhouette. Raised cards use the popover surface. Footers inherit the parent surface.
- **Fields:** shared Input, Select, SearchSelect, and form controls preserve inset surfaces, labels, placeholders, required cues, and associated errors. Do not recreate these styles in feature-local controls.
- **Navigation and badges:** active sidebar items share the primary action treatment. Status badges use semantic tones and written labels; color alone never declares state.
- **Toast:** shared `ToastProvider` and `useToast` exports provide add, update, dismiss, and promise feedback with neutral, success, info, warning, error, and loading variants. Defaults are top-center placement, the floating surface, and `motion.duration.toastDismiss`; error and loading persist unless an explicit timeout is supplied (`0` keeps any variant visible). Floating toasts share `floatingActionSurface` and `backdropBlur.floatingSurface` tokens, falling back to the solid card surface without backdrop-filter support; `surface="solid"` selects that surface explicitly. F6 reaches notifications, hover/focus pauses dismissal, and swipe or the labeled close button dismisses; reduced motion disables transitions and loading-icon rotation. Storybook’s `Feedback/Toast` includes variant, surface, six-position, theme, timeout, content, and Undo controls plus stack, loading, promise-error, long-content, persistent-error, and auto-dismiss examples. The web app mounts localized notifications through `WorkspaceNotifications` in the locale layout.
- **FileDropZone:** an inset dashed acquisition area with upload icon, hint, and browse affordance. The feature owns upload limits, processing, and errors.
- **SegmentedRadioGroup:** native radio behavior in a rounded muted track, with neutral/primary/destructive selected tones and visible keyboard focus.
- **DocumentViewer and previews:** a popover surface around real image/PDF evidence. Optional review fields stack below the image on mobile and sit beside it on desktop. At 100%, shared DocumentZoom fits one container axis while preserving the document ratio, without an inset margin. A shared top overlay centers the filename between equal control columns, shows a left close button only with `onClosePress`, and places optional document actions on the right; fullscreen viewers have no separate visible header. Overflowing filenames automatically scroll back and forth using the `documentNameScroll` motion token, stopping for hover, keyboard inspection, and reduced motion. The header remains available during PDF loading/errors. Top and zoom/PDF page overlays use translucent `documentOverlay`/`documentOverlayBorder` semantic tokens (80%/60%); disabled controls show muted icons without background or border. Single-page PDFs show disabled navigation and 1/1. Feature code owns verification/apply/discard state.
- **VIN conflict review:** the first shared BottomSheet contains only an unbiased blank scooter VIN input that uppercases typed or pasted text, validation, and Continue. The second shows one differing or unreadable document at a time, with compact read-only StepProgress dots and VIN header, an underlined Change VIN text action opposite on mobile or adjacent on desktop, and a large inline PdfPreview/DocumentZoom. Pending progress dots and their connecting line use `mutedForeground` for visible contrast against the sheet. The footer retains the original extracted reading and explains confirmation through the primary next/final action, enabled after a three-second countdown for each document. Both sheets use `dismissible={false}` to lock swipes, outside presses, and Escape; preview panning cannot move or close the sheet. Only successful validation completes the flow. Both retain the popover surface and shared dark/cyan controls; saving stays blocked until verification completes.
- **FormActions:** status context and actions adapt to the available card width. Sticky mode uses a bordered, rounded shared Card with a safe-area-aware gap below it; pages retain extra end-of-form clearance.

**Submission:** shared [SaveButton](packages/ui/src/components/save-button.tsx) presents idle, pending, success, and error states; failures preserve the original action label, purposeful variant, and entered values, with an associated form error. Warning and destructive variants express the action's purpose. The [useFormAction](apps/web/src/lib/form/use-form-action.ts) adapter supplies action-specific English/Romanian copy from `@repo/i18n`. Forms own validation, requests, recovery, and real asynchronous state; pending guards block duplicate clicks and Enter submissions, and timers never imply success. Group actions with FormActions or the existing bottom-sheet footer. Review and next-step actions use truthful labels; `useTask` callbacks return `false` when review continues without saving. [WorkspaceNotifications](apps/web/src/components/WorkspaceNotifications.tsx) supplies contextual success toasts only for completed operations, while request errors stay beside the form. ESLint guards explicit submit controls against bypassing SaveButton. Storybook's [Components/SaveButton/SubmissionFlow](packages/ui/src/components/save-button.stories.tsx) demonstrates pending, preserved input after failure, and confirmed success.

### Problems and repairs

The Operate expression follows the UX Pilot Scooter City App Tasks reference within the existing app shell. [ProblemList](apps/web/src/app/[locale]/problems/_components/ProblemList.tsx) presents a single stacked mobile collection; unfiltered desktop results keep all four status lanes in one horizontal row from `lg`, each at least `spacing[72]` (288px) wide. When the lanes cannot fit, the shared HorizontalScrollArea shows a persistent, draggable scrollbar with a visible track and contrasting thumb. A right-arrow cue appears while more lanes remain to the right; hovering with a mouse within the rightmost spacing step `12` (48px) across the viewport height scrolls at the shared motion speed. Leaving that zone, pressing the pointer, reaching the end, or blurring the window stops hover scrolling. The arrow also supports click and keyboard activation. A selected status uses a two-column list at `lg` and three columns at `xl`. Lanes use the recorded `open`, `in_progress`, `resolved`, and `cancelled` states; their counts describe the current results page.

[ProblemListItem](apps/web/src/app/[locale]/problems/_components/ProblemListItem.tsx) composes shared Card, CardAccent, CardHeader, CardTitle, CardAction, CardContent, CardFooter, Badge, Button, Avatar, and AvatarFallback primitives. Comfortable cards use `spacing[5]` (20px). Uppercase difficulty sits above the title; the right column prominently displays the shared internal ID and brand code, with smaller brand and model text below. State badges follow the description excerpt. The inset footer uses UserRound avatar placeholders, actual assignee names, attachment counts, and the reported date. A full-card keyboard-accessible button opens the shared task-detail BottomSheet, using the popover surface continuously. The sheet contains the title and scooter identity, status and priority, description, assignee row, persisted checklist, shared ImageGallery attachments, and completion controls. Admins can choose eligible assignees; mechanics can only claim available tasks for themselves. Checklist changes and attachment writes require all-scope update authority or assignment and retain revision-conflict checks. Camera collection stays open for successive confirmed photos and offers multiple gallery selection. Quick filters use the shared SegmentedRadioGroup `pills` appearance: separate rounded choices, primary selected tone, 32px visible pills within 40px pressable areas on mobile and desktop, and native radio keyboard behavior. Repair quick filters offer Open, Mine (Ale mele), and Resolved (Rezolvate), with Mine available only when assigned access is permitted. No selected radio means all accessible problems; clicking a selected option again clears it. The filter sheet uses segmented radios for Show, a fixed two-column/four-option status grid and a three-option row for difficulty, and the shared green/red Usable/Unusable control. Scooter and assignee retain their SheetSelect pickers. Blank groups omit their query constraint; Usable sends blocking=false and Unusable sends blocking=true.

Cards with assessed difficulty carry a straight rectangular CardAccent strip using `spacing[1]`, zero strip radius, and the shared semantic difficulty token; only the outer card silhouette clips its ends. Easy, Medium and Hard use `difficultyEasy`, `difficultyMedium` and `difficultyHard` in both themes, derived from the existing repair palette. The uppercase difficulty text supplies a localized repair-effort tooltip. Original impact severity remains historical data; safety holds remain independent of difficulty.

**The Repair Card Rule.** Compose comfortable repair cards and quick filters from shared UI primitives and theme tokens; preserve recorded statuses, current-page lane counts, straight difficulty strips, localized difficulty meaning, and actual assignee names beside shared avatar placeholders.

### Activity

Shared ActivityTimeline and ActivityTimelineItem compose the existing Accordion into a collapsed history section below comments. The header shows the event count and latest summary. Rows use semantic colored icons, a fine connector, inset dividers, responsive timestamps, and optional change disclosures. Comments and system activity have independent server-filtered pagination. See Storybook Patterns/Activity timeline for expanded, collapsed, mobile, dark, loading, empty, and error states.

### Comments

Comments sit at the bottom of the problem detail, using the existing neutral surfaces, typography, spacing, and cyan action treatment. Shared `CommentThread`, `CommentItem`, and `CommentComposer` provide a divided conversation section, neutral author initials beside the name and timestamp, readable multiline bodies, and a controlled composer built from shared InputGroupTextarea and an icon-only SaveButton inside the shared InputGroup surface. The rounded composer starts at one text line, grows to spacing[36], then scrolls internally; its circular send action stays at the lower right. Focused mobile composers track the visual viewport to dock above the keyboard, preserving their original layout space. Empty and read-only conversations, request-driven submission feedback, associated errors, and caller-supplied recovery content use the same shared controls; pending submission is blocked, and failures keep the original action label and draft. Callers own data ordering, requests, validation, draft clearing, recovery, and localized labels.

Completion and reopening messages appear in the conversation through shared CommentEventItem. A check or reopen icon and a subtle success or warning surface distinguish them from ordinary comments, while labels and message text use readable foreground colors. Reopening requires a message recorded atomically with the transition; historical resolution notes come from the existing completion event. System activity remains admin-only.

Storybook: [Patterns/Comments](packages/ui/src/components/comments.stories.tsx), including long content, mobile, and dark-theme examples.

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
