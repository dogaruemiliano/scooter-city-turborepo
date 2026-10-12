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
  It does not own submission or confirmation logic.

`Card` is the common card and editor surface. Use its header/content/footer slots
for spacing, `size="sm"` for compact content, and `surface="raised"` for editor
panels. `as="article"`, `as="section"`, and `as="form"` preserve the appropriate
HTML semantics. Footer surfaces match the card, and minimal-theme geometry is
centralized in the component. Existing `className` overrides remain available for
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
