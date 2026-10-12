# Shared list layout and filters

Status: implemented on 2026-10-12. The inventory below records the pre-migration state; implementation and verification notes follow at the end.

## Confirmed experience

The shared layout serves staff browsing fleet, people, service, access, and finance records, and customers browsing their own rentals. It should make finding a record and starting an available action consistent across the web application.

- Header: Filters on the left, primary action on the right, using the same spacing, alignment, and button treatment everywhere.
- Search stays visible immediately below the header, where search is supported. This placement was confirmed by the user.
- Filters open the shared `BottomSheet`. Choice fields use the existing shared `SheetSelect`, opening a secondary sheet above the filter sheet.
- Filters edit a draft. Apply commits the draft; this was confirmed by the user. Selecting an option closes only its secondary sheet.
- Custom item components and custom filter fields remain feature-owned. The shared components own surrounding layout, spacing, states, and interaction conventions.
- Use the existing theme and semantic tokens. Sheet popup, header, body, and footer use or inherit the popover surface, distinct from the page.

Use the existing `BottomSheet` responsive presentation consistently: bottom-attached on small screens and centered from `lg` upward. This is an implementation assumption based on the existing shared component; the user's two confirmed choices above do not decide desktop sheet positioning.

## Inventory: main collections

Routes below omit the locale prefix. There are 11 main collection routes; the Users directory also appears on its detail/create route.

| Route                 | Current implementation                                                                                                                                 | Migration and behavior to preserve                                                                                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/scooters`           | `ScootersPage`, `ScooterList`, `ScooterCard`; separate Create row, then search/sort/filter controls; cards become two columns at XL; infinite loading. | Common header and single-column list flow with custom scooter cards. Keep search debounce, relevance sorting, query URLs, request-race protection, pagination, and create permissions. Move sort and existing record-status/powertrain/registration filters into the shared filter sheet.                                   |
| `/persons`            | `PersonsPage`, `PersonList`; same separate controls as Scooters; single-column cards; infinite loading.                                                | Extract `PersonListItem`. Keep document indicators, deleted-record behavior, search/sort, document filters, dates, countries, and permissions. Country fields already use nested `CountrySheetSelect`; other choice fields move to `SheetSelect`.                                                                           |
| `/problems` (Service) | `ProblemsWorkspace`; inline view selector/Create button, divided article rows, expandable work controls, previous/next buttons.                        | Pilot migration: custom `ProblemListItem`, shared header, view in filter sheet. Preserve permission-dependent Assigned/Available/All defaults/options, expanded work, assignment/claim/resolve actions, and revision handling. Status and scooter filters are already supported by the API; no text-search endpoint exists. |
| `/rentals`            | List branch of `RentalsWorkspace`; inline Create and table, previous/next.                                                                             | Shared header, custom rental rows, status filter already supported by API. Preserve staff fields and create permissions. Keep the detail branch outside the list layout.                                                                                                                                                    |
| `/my-rentals`         | Same `RentalsWorkspace` in portal mode; customer schema/endpoint, table and previous/next, no Create.                                                  | Same list structure without a create action. Status filter is supported. Preserve customer-only projection and never render staff/internal fields.                                                                                                                                                                          |
| `/scooters/brands`    | Server route plus `BrandTable`; separate desktop table/mobile list; `BrandFormSheet` action; no filters/paging.                                        | Reuse/extract existing brand row content in the common list flow. Preserve edit sheet and deletion restrictions for brands with scooters. No artificial Filters button; local search is possible only because the complete collection is loaded, and is optional scope.                                                     |
| `/users`              | `UsersWorkspace`; deferred server search, member cards, count/Add, previous/next with offset-based paging.                                             | Common header/search/states and custom member item. Preserve selection, search reset, superadmin access, and offset pagination adapter. Do not invent role/status filters unsupported by the current endpoint.                                                                                                              |
| `/roles`              | `RolesWorkspace`; fixed superadmin/base-role library in a responsive grid, not an unbounded CRUD directory.                                            | Use shared body/item spacing in the common list flow. Preserve the fixed role set, navigation, and editability rules. No fake Create/Filters actions.                                                                                                                                                                       |
| `/finance/operations` | Server route and feature-shared `OperationList`; mobile cards/desktop table, funding action, only first 50 operations fetched.                         | Common header, API-supported filter sheet, and functioning pagination. Preserve reversal display, amount formatting, links, authorization, and funding action. Financial table body may retain semantic columns under the common layout.                                                                                    |
| `/finance/expenses`   | Same `OperationList`, fixed expense kind, create action, only first 25 operations fetched.                                                             | Migrate alongside Operations; preserve fixed `kind=EXPENSE` on Apply, Reset, navigation, and paging. Keep receipt/manual creation flow. Add filter/paging access to the complete collection.                                                                                                                                |
| `/finance/accounts`   | `AccountBalanceTable`; grouped company balances, mobile list/desktop table, no create/search/pager.                                                    | Shared read-only layout and group presentation. Preserve accounting categories, currencies, and numeric column alignment. No artificial create action or pagination for the complete response.                                                                                                                              |

Relevant source locations:

- [ScootersPage](../../apps/web/src/app/[locale]/scooters/_components/ScootersPage.tsx), [ScooterList](../../apps/web/src/app/[locale]/scooters/_components/ScooterList.tsx), [brands route](../../apps/web/src/app/[locale]/scooters/brands/page.tsx), [BrandTable](../../apps/web/src/app/[locale]/scooters/_components/BrandTable.tsx).
- [PersonsPage](../../apps/web/src/app/[locale]/persons/_components/PersonsPage.tsx), [PersonList](../../apps/web/src/app/[locale]/persons/_components/PersonList.tsx).
- [ProblemsWorkspace](../../apps/web/src/app/[locale]/problems/_components/ProblemsWorkspace.tsx), [RentalsWorkspace](../../apps/web/src/app/[locale]/rentals/_components/RentalsWorkspace.tsx).
- [UsersWorkspace](../../apps/web/src/app/[locale]/users/_components/UsersWorkspace.tsx), [RolesWorkspace](../../apps/web/src/app/[locale]/roles/_components/RolesWorkspace.tsx).
- [Operations route](../../apps/web/src/app/[locale]/finance/operations/page.tsx), [Expenses route](../../apps/web/src/app/[locale]/finance/expenses/page.tsx), [Accounts route](../../apps/web/src/app/[locale]/finance/accounts/page.tsx), [OperationList](../../apps/web/src/app/[locale]/finance/_components/OperationList.tsx), [AccountBalanceTable](../../apps/web/src/app/[locale]/finance/_components/AccountBalanceTable.tsx).

## Inventory: embedded collections and specialized editors

These remain part of the consistency audit, but do not receive a complete browsing toolbar merely because they contain repeated rows.

| Routes / locations                                                                       | Treatment                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/users/[id]`, including `/users/new` handled by `[id]`                                  | Reuse the shared directory body in compact composition beside the editor; retain mobile directory toggle, current selection, scrolling, and unsaved-change navigation guard. |
| `/` and `/finance` recent operations                                                     | Reuse operation item/table rendering, common empty/error treatment, and existing View all links. They intentionally show previews, not full collections.                     |
| `/users/[id]` and `/roles/[id]` access history                                           | Reuse compact list spacing/states where appropriate; retain chronological events and expandable metadata.                                                                    |
| `/persons/[id]` documents and activity                                                   | Keep document sections and timeline semantics; reuse shared body/states where they fit.                                                                                      |
| `/scooters/[id]` document collections and specification fields                           | Documents retain upload/review workflows; specifications remain a detail layout, not a filterable collection.                                                                |
| `/rentals/[id]`, `/my-rentals/[id]` document lists                                       | Compact shared list presentation; retain publication/download permissions and distinct staff/customer behavior.                                                              |
| `/account/settings` sessions and linked providers                                        | Keep settings rows, revoke/unlink actions, confirmations, and current-session behavior. Reuse spacing/states without Create/Filters.                                         |
| `/finance/operations/[operationId]` payments, allocations, documents, postings, payables | Detail/report collections retain financial semantics and table alignment. Reuse body/state primitives where appropriate.                                                     |
| `/finance/settlement`                                                                    | Date-driven calculation/report with participant table and proposed transfers; preserve its Calculate flow. It is not an ordinary list page.                                  |
| `/company/associates`                                                                    | Batch-edit ownership form with shared validation and Save. Do not filter or paginate away unsaved ownership fields.                                                          |
| `/finance/settings`, `/company/settings`                                                 | Configuration/identity forms, outside the main collection layout.                                                                                                            |
| Permission editor and expense/funding forms                                              | Permission matrix, payment/allocation field arrays, document controls, supplier and destination pickers retain specialized editing/selection behavior.                       |

The current Expo app has starter/home/theme/UI-kit screens rather than these business list pages. This implementation targets `apps/web` and `@repo/ui`; a future native implementation should follow the same interaction contract using native components.

## Shared component design

Add a small composable family to `packages/ui`, exported through `@repo/ui/components` and documented in the UI README/Storybook:

1. **`ListLayout`** owns header alignment, optional search row, optional result summary, content region, and footer placement. Slots accept a filter trigger and action element so routes retain permissions and localized navigation. Use a section/container rather than introducing nested `main` elements. Optional controls disappear cleanly; actions stay right-aligned.
2. **`ListItems<T>`** accepts `items`, `getItemKey`, and `renderItem`. It owns semantic list/item wrappers and one consistent vertical flow. Features return their custom item component, not another page wrapper or paginator. Group sections compose this same primitive. Financial tables can use the content slot with the existing shared `Table` instead of invalid table rows inside list markup.
3. **`ListFilterSheet<TFilters>`** moves the existing app-level filter-sheet presentation into shared UI and centralizes draft/apply/reset/dismiss behavior. It accepts applied/default values, custom draft-field rendering, and an apply callback; it has no domain schema or fetch logic. Every option-list field inside it uses `SheetSelect` or an existing wrapper such as `CountrySheetSelect`.
4. **Shared list states/footer controls** provide consistent initial-loading, refreshing, empty, no-match, initial-error, refresh-error, and load-more-error presentation. Reuse existing `Pagination`, `Button`, `Alert`, and `Skeleton`. Offer defined paged and load-more footer modes; avoid another unrestricted footer design per feature.

The layout/body can remain server-renderable. Interactive sheets are client components. `renderItem` functions stay within their rendering boundary; server routes can render custom children into the layout or introduce a route-private client controller with serializable props. Do not pass a render function from a server route to a client component.

Keep domain logic in route-private `_components` / `_lib`: permission checks, API requests, query schemas, URL parsing, sorting, item actions, and record mutation/reload logic. Keep Next routing and i18n adapters in the web app. Shared UI receives translated labels and callbacks and must not import Next, API schemas, session state, or finance/access domain code.

### Filter lifecycle

- Opening starts a fresh draft from applied values.
- Option selection changes only that draft and closes only the secondary sheet, returning focus to its field.
- Apply validates and commits once, resets page/offset and accumulated results, closes the sheet, and refreshes the collection. The filter count reflects applied filters, not the current draft.
- Reset restores the draft's feature-defined defaults; Apply commits the reset. Defaults include permission-dependent service views and default sorting. Fixed scopes such as expense kind and customer identity are never editable or reset away.
- Cancel, Escape, backdrop dismissal, or swipe discard unapplied changes. Reopening restores applied values.
- Keep search visible outside the sheet. Existing debounced searches remain debounced, preserve applied filters/sort, and reset pagination. Put sort inside the filter sheet to keep the header consistent.
- Synchronize applied state with URL/navigation where supported. Preserve search and unrelated relevant parameters when applying filters. Back/forward restores applied controls and results.
- Show validation errors in the sheet; prevent duplicate Apply submissions. List fetch failures expose retry and distinguish stale visible results from results matching the new request.

### Existing implementation caveats

- The former app-level `ListFilterSheet` supplied `FormData`; [SheetSelect](../../packages/ui/src/components/sheet-select.tsx) has no `name`/form-value contract. FormData-dependent callers such as UrlFilterSheet would silently lose selected values if only the field component were replaced. Scooters/Persons already submit controlled drafts and are not affected by that particular issue. Prefer controlled typed drafts in the new filter sheet; remove the old FormData dependency when migrating remaining callers.
- The former app-level `UrlFilterSheet` built a fresh query only from the form. Update the web adapter to preserve external search, fixed route scope, and applicable unrelated parameters explicitly.
- [useRemote](../../apps/web/src/components/WorkspaceForm.tsx) retains old data and does not expose refresh loading. Give affected list controllers explicit request status so the shared states can distinguish loading, refreshing, and failed refreshes.
- [InfiniteListFooter](../../apps/web/src/components/InfiniteListFooter.tsx) already provides observer-driven loading and retry. Preserve this for Scooters/Persons; share its presentation while leaving data fetching in the feature/web adapter. Do not replace existing infinite loading with numbered pages as a side effect.
- Finance operation queries already support page/pageSize, bookId/bookType, kind, status, treatment, and from-inclusive/to-exclusive timestamps. Pagination can be fixed using existing endpoints. Free-text search is not supported: omit it on these pages rather than filtering only the currently fetched page.
- Preserve offset-based Users paging and page-based Problems/Rentals paging behind the same visual footer convention. Fully loaded collections need no paging.
- The Base UI Drawer documentation explicitly covers independently managed nested drawers. Reuse the installed shared implementation and verify focus/scroll behavior in tests; do not replace the drawer dependency. Reference: [Base UI Drawer](https://base-ui.com/react/components/drawer#nested-drawers), checked 2026-10-12. Verify installed-version APIs and local Next documentation before implementation.

## Implementation sequence

1. **Build the shared foundation and stories.** Add layout, generic items, filter draft lifecycle, and consistent states/footers. Storybook covers a custom card, an expandable service row, a grouped/table body, no-action/no-filter cases, search, nested selection, and loading/error/empty states. Supply English/Romanian labels through callers.
2. **Pilot on Service.** Extract ProblemListItem and ProblemFilters; preserve work/create forms and permission behavior. Validate Apply, dismissal, nested selection, and paging before expanding usage.
3. **Migrate Scooters and Persons.** Consolidate header/search/list flow, move sort into filters, replace remaining dropdowns inside filters with SheetSelect, and preserve all existing URL/search/infinite-loading behavior. Extract PersonListItem; retain ScooterCard internals.
4. **Migrate Rentals, My Rentals, and Brands.** Use custom rows and shared paging/states, expose supported rental status filtering, preserve staff/customer and management permissions. Leave details as details.
5. **Migrate finance collections.** Operations and Expenses share one filter/pagination integration with route-specific scope; expose subsequent pages. Accounts adopts the grouped read-only layout. Reuse shared structure around semantic financial tables; migrate overview previews through their existing shared renderer.
6. **Migrate Users and Roles.** Preserve Users directory/detail composition, dirty-navigation guard, offset pagination, and selected state. Roles uses the common body without invented CRUD controls.
7. **Finish the embedded-list consistency pass and remove duplication.** Reuse appropriate body/states in the catalogued embedded surfaces. Remove superseded app-level filter/layout wrappers only after all callers are migrated. Document the required pattern for new collection pages.

Each stage should leave its migrated pages usable and be small enough to review. Respect existing unrelated working-tree edits, including the already-modified ProblemsWorkspace.

## Acceptance checks

- Every primary collection uses the common header/content rhythm. Where available, Filters is left, primary action is right, and search is beneath. Missing permissions never leave a placeholder action.
- Custom scooter/person/problem/rental/member/operation content remains functional; domain rows can vary while their surrounding layout remains consistent.
- Draft filter choices do not request new results until Apply. Reset/Cancel/reopen, option clearing, URL/back/forward, fixed scopes, and page reset behave consistently.
- Opening a SheetSelect leaves the parent filter sheet present and inert. Closing the child returns focus correctly; Escape dismisses one layer at a time. Mobile keyboard, scroll, and long option lists work.
- Add regression tests preventing page-background overrides on the full sheet popup/body/header/footer. Localized field surfaces may retain their intentional field styling.
- All records remain reachable: infinite-loading collections retain load-more/retry, paged collections can move forward/back, and finance no longer stops at page one.
- Tests cover initial loading/error, empty collection vs no matches, refresh failure with stale results, retry, permissions, and customer/staff separation. Retain existing feature tests around search races, mutations, revisions, and unsaved edits.
- Use the existing web Vitest setup for integration/component tests unless a UI-package test runner is deliberately added. Run affected tests plus `pnpm --filter @repo/ui check-types`, `pnpm --filter @repo/ui lint`, `pnpm --filter web check-types`, and targeted web lint. Build Storybook for the shared additions.
- Validate representative migrated flows at mobile and desktop sizes, with English/Romanian copy and long labels. Include actual filter-to-secondary-sheet-to-Apply interaction, not screenshots alone. This planning audit inspected code; it did not run rendered UI verification.

Completion means all 11 main routes are migrated or use the explicitly described read-only/fixed-library composition, embedded collections have been checked, shared documentation/stories exist, and the regression checks pass.

## Implementation record

- All 11 main collection routes now use the shared list layout/body or the documented financial-table/fixed-library composition. Shared components live in `packages/ui/src/components/list.tsx` and `list-filter-sheet.tsx` and are exported from the UI package.
- Service/Rentals use extracted custom items and draft status/view filters. Staff/customer projection, work actions, revision handling and create permissions are retained.
- Scooters/Persons keep visible search and infinite loading; sorting and option filters use nested sheets. Browser Back/Forward restores queries/results, URL changes preserve unrelated parameters, and normalized search avoids repeated equivalent requests.
- Finance exposes supported filters and subsequent pages. Expense scope is retained. Book ID/type selection follows API precedence, invalid ranges are rejected, huge page values are bounded, and out-of-range navigation can recover.
- Users preserves its compact directory/editor, selection and unsaved navigation guard. Roles keeps its fixed role library without artificial filters/actions.
- Embedded access history, person activity, rental documents, account sessions/providers, financial payments/allocations/documents and financial overview previews reuse the relevant list primitives. Document-slot editors, field arrays, permission matrices, ledger/report tables and settlement calculation remain specialized as catalogued above.
- Removed the unused app-level `ListFilterSheet`, `UrlFilterSheet`, and `ListSortSelect` and their superseded tests. `InfiniteListFooter` now delegates its presentation to shared `ListLoadMore`.
- `useRemote` now exposes initial/refresh loading, retains previously loaded data for refresh errors, and ignores superseded requests.
- Added shared component stories and UI README guidance. Regression tests cover nesting, Apply/Reset/Cancel, async failure/retry, surfaces, paging, URLs, permissions and existing feature behavior.
- Browser verification uses the shared component preview at `http://127.0.0.1:6006/iframe.html?id=collections-list--default&viewMode=story` at desktop/mobile sizes. The live local app redirects the isolated verification browser to sign-in, so authenticated production/page flows are not claimed as browser-verified. Feature behavior is covered by integration tests.
