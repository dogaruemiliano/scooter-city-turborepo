# @repo/ui

Shared web components use `@repo/theme` tokens and Tailwind CSS v4.

## Responsibilities

- Provide reusable React components for `apps/web`.
- Wrap Base UI and shadcn primitives in the project's token system.
- Export app-consumable components through explicit package entry points.
- Maintain Storybook examples for reusable components.

## shadcn with Base UI

The shadcn CLI is configured with the Nova/Mist Base UI preset. Add primitives
with:

```bash
pnpm --filter @repo/ui shadcn:add dialog
```

Generated components are available from `@repo/ui/components` or individual
`@repo/ui/components/*` entry points. Their flat color roles come from
`@repo/theme`; add missing semantic roles there before introducing new visual
values.

## Commands

```bash
pnpm --filter @repo/ui dev              # Storybook on :6006
pnpm --filter @repo/ui build-storybook  # static Storybook build
pnpm --filter @repo/ui lint
pnpm --filter @repo/ui check-types
```

## Token rule

Components must consume visual values from `@repo/theme`. Add missing semantic
roles or scale values in `packages/theme/src/tokens/` before introducing new
component styling.

## Shared management controls

Use these components instead of reproducing input, selection, or card styling in
individual feature pages. They are available from `@repo/ui/components` and the
matching individual entry points.

- `SearchField` composes `InputGroup` with a search icon and an accessible `label`.
  It has no form wrapper, so it works inside an editor or inside a search form.
  Supply `onClear`, `clearLabel`, and a controlled string `value` together to show
  a clear action. `className` styles the group; `inputClassName` styles the input.
- `NativeSelect` keeps native keyboard and mobile selection behavior. Supply
  ordinary `<option>` children and an associated label or `aria-label`. Its
  `size="sm"` variant fits compact rows; `className` targets the select and
  `wrapperClassName` targets its wrapper.
- `SegmentedRadioGroup` is a controlled, single-choice input with native radios.
  Supply a unique `name`, accessible `label`, `value`, `onValueChange`, and
  `options`. Option tones are `primary`, `neutral`, and `destructive`; feature
  code decides what those choices mean.
- `FormActions` arranges action children and an optional live `status`. Callers
  provide translated labels, button types, busy/disabled states, and handlers.
  Use `sticky` for long editors: actions render in the shared Card, inset from
  the bottom by page spacing (`4` on phones, `8` from `sm`) plus the safe area.
  The page owns extra end-of-form clearance; use bottom padding `16` on phones
  and `24` from `sm` so the card settles farther from the bottom edge.
  It does not own submission or confirmation logic.
- `FormSection` groups related fields. Use `panel` for a bordered card and
  `number` for ordered sections. It defaults to two columns on wider screens;
  use `columns={1}` inside review panels. Two columns depend on the section's
  available width (`formColumns`), rather than the viewport. Existing spanning
  children revert to one full-width column in narrow sections.
- `FileDropZone` acquires multiple files through drag and drop or a native picker.
  Supply localized labels, `hint`, `accept`, and `onFiles`. The feature owns file
  limits, validation, upload progress, and failures.
- `DocumentViewer` accepts an optional `review` and `reviewTitle` for a document
  comparison editor. It places the editor beside the preview on desktop and
  below it on mobile. The feature owns draft state, validation, and applying or
  discarding edits. Its review surface uses the popover token throughout.
- `DocumentZoom` and `PdfPreview` share `DocumentPreviewHeader`: a translucent
  overlay with a centered filename, optional right-hand `headerActions`, and a
  left close button only when `onClosePress` is supplied (provide `closeLabel`).
  Overflowing filenames scroll automatically, stopping for hover/focus or
  reduced motion; the filename remains manually scrollable. `DocumentViewer`
  supplies close and action controls through this overlay, including while PDFs
  load or fail. Inline verification previews omit `onClosePress`.
  Double-clicking or double-tapping a fitted document zooms in around that
  point. From any zoom level above 100%, including 400%, the same gesture
  restores the fitted 100% view. Each pointer gesture toggles once, including
  when accompanying native mouse events arrive late. Dragging, pinching, and
  long presses do not count as taps.
  Discrete zoom actions use the fast/decelerate motion tokens; dragging and
  pinching stay immediate, and reduced motion disables the transition. This
  behavior is shared by images and PDFs.
- `BottomSheet dismissible={false}` locks swipe, outside presses, and Escape
  dismissal, and hides the drag handle. Keep it controlled and close it by
  changing `open` after the required task completes. Ordinary sheets retain
  their existing dismissal behavior.

`Card` is the common card and editor surface. Its outer border uses the neutral
theme border by default; use `border="transparent"` to hide it or `border="primary"`
for brand emphasis. Footer dividers retain their neutral border. Use its header/content/footer slots
for spacing, `size="sm"` for compact content, and `surface="raised"` for editor
panels. `as="article"`, `as="section"`, and `as="form"` preserve the appropriate
HTML semantics. Footer surfaces match the card. Existing `className` overrides remain available for
layouts such as tables that need `py-0` or `gap-0`.

Use `Avatar shape="square"` for member initials, with `size="lg"` or `size="xl"`.
The existing round avatar and sizes remain supported. `AvatarFallback` inherits
the shape; display names and initials are supplied by the application.

All surfaces, selection tones, focus rings, and disabled states inherit semantic
theme tokens. Keep permission catalogs, roles, translated copy, and API calls in
the feature that uses these controls. Storybook contains examples of each control
and both standard and raised cards.

## Collection pages

Use `ListLayout` and `ListItems` for new browsing lists. The layout keeps Filters
on the left, the permitted primary action on the right, and search underneath.
Pass `filters`, `action`, `search`, `summary`, and `footer` only when meaningful;
read-only lists do not need placeholder controls.

`ListItems<T>` accepts `items`, `getItemKey`, `renderItem`, and an optional `empty`
element. It supplies the list and item semantics and consistent vertical spacing;
the renderer supplies a feature-specific card or row, not another `<li>`. Use
`ordered` for chronological sequences. Financial tables can remain semantic
`Table` elements inside `ListLayout` instead of becoming invalid list children.

`ListFilterSheet<T>` accepts applied `value`, `defaultValue`, translated labels,
`appliedCount`, and `onApply`. Its children receive `{ value, setValue }` for the
draft. Update drafts immutably. Opening copies the applied value; Reset replaces
only the draft; Cancel/Escape/swipe discard it. Only Apply calls `onApply`. Return
`false` or reject to keep the draft open after failure; supply `applyErrorLabel`
for localized feedback. Submission is guarded against duplicates.

Use `SheetSelect` (or `CountrySheetSelect`) for choice fields inside filters.
It opens a secondary sheet, returns selection to the parent draft, and closes
only the secondary sheet. Supply visible labels and localized option-search,
clear, empty, and close copy. Do not rely on FormData for SheetSelect values.

Use `ListEmpty`, `ListStatus`, `ListPagination`, and `ListLoadMore` for collection
states and footer presentation. Distinguish an empty collection from no matches,
initial loading from refreshing visible records, and stale results after an
error. `ListPagination` supports callbacks or ordinary hrefs. The web app's
`InfiniteListFooter` owns its observer and delegates presentation to `ListLoadMore`.

These primitives do not fetch data or know about routing, permissions, schemas,
or translations. Server routes can compose `ListLayout`/`ListItems` directly and
render a small client filter island. Keep render callbacks within one rendering
boundary; do not pass functions from a Server Component to a Client Component.
Feature items and filters belong in their route's `_components` folder.

Storybook **Collections/List** demonstrates custom/expandable items, nested
selection, search, paging, read-only lists, empty/loading/error states, and a
financial table. Implementation coverage and exceptions are recorded in
[`docs/plan/shared-list-layout.md`](../../docs/plan/shared-list-layout.md).
