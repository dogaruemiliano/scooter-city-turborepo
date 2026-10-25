<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:app-router-organization-rule -->

# App Router files live with their route in private folders

Use route-private folders inside `app/` for feature-specific implementation code. Keep route convention files (`page.tsx`, `layout.tsx`, `loading.tsx`, `not-found.tsx`, `error.tsx`, `route.ts`, etc.) at the route segment level, and put everything else under underscore-prefixed private folders so it is clearly not routable.

Preferred shape:

```txt
app/
  [locale]/
    persons/
      page.tsx
      new/
        page.tsx
      [id]/
        page.tsx
      _components/
        PersonCreateForm.tsx
        PersonList.tsx
        PersonCard.tsx
      _actions/
        create-person.ts
        update-person.ts
      _lib/
        person-schema.ts
        person-mappers.ts
```

Do not move route-specific UI into global `src/components/<feature>` folders by default. Use global `src/components` only for genuinely shared app-wide UI.

Tests for route-private components should live with the private folder they exercise. Route-level tests can use a private `_tests/` folder under the route segment.

<!-- END:app-router-organization-rule -->

<!-- BEGIN:shared-page-layout-rule -->

# Pages share one content boundary

Use `PageLayout` from `@repo/ui/components/page-layout` for page width, horizontal gutters, and top spacing. Render it exactly once per route: finance and company already provide it in their section layouts; other screens provide it themselves. Loading and error views must share the same boundary as the content they replace.

Use its explicit width/padding options for special surfaces rather than duplicating container classes. Wizards keep app navigation and use `paddingX="none" paddingTop="compact"`; shared `WizardForm` inherits the gutter and owns its internal padding. Keep feature-specific grids, narrower field groups, sticky actions, sheets, and full-screen capture behavior inside the boundary. Do not introduce a second scroll container or repeat page padding in child routes.

<!-- END:shared-page-layout-rule -->
