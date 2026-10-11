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
