# User access and authorization

The API owns authentication and authorization. CASL 7.0.1 with `@casl/prisma` 2.0.2 compiles the code-defined permission catalog to action checks and Prisma conditions. The published package README was verified against Prisma 7.8 on 2026-10-11. Custom generated-client imports and the PostgreSQL adapter remain unchanged.

## Access behavior

An identity record does not grant login. New users, people, and finance associates default to `DISABLED`. A Super Admin or a delegated user manager provisions an email, assigns permitted live roles and individual overrides, and sends an invitation. An invitation lasts seven days and links to ordinary sign-in; the link is not a credential. Existing OTP or verified OAuth proof activates the current invitation atomically. Unknown, disabled, expired, cancelled, and suspended identities cannot obtain sessions.

The editor and HTTP contracts allow one base role: Admin, Mechanic, or Client (the compatible stored slug is `customer`). Super Admin remains a separate protected designation. Admin grants all staff business actions, including finance, and delegates user management and role inspection, but does not grant shared-role editing, account suspension, or customer portal access by default. The underlying resolver retains support for unions of historical memberships. An override replaces all inherited scopes for one action: an empty array denies it; removing the override restores inheritance. Role edits apply to subsequent requests using current database authority. Legacy `roles` in JWTs and User rows remain compatibility data only. Super-admin authority comes from `isSuperAdmin`, never from a role name.

Access management uses explicit Users and Roles permissions. Only Super Admins assign the Admin designation or edit the Admin role. Public role creation is closed; customize the three built-in presets or an individual member’s exceptions. Built-in roles cannot be archived. Role and user edits require the revisions the editor reviewed. Assigned roles cannot be archived. Access changes and required audit records share a transaction. Lifecycle writers and admission use advisory lock 726001, including the last-active-super-admin safeguard; OTP reservations and refreshes use its shared variant without changing refresh-chain row locking or grace/replay behavior. Admission row locks also detect stale SERIALIZABLE snapshots after a concurrent suspension; the existing bounded retries recognize PostgreSQL serialization conflicts through Prisma 7's adapter errors.

Every handler explicitly declares public, self-service, permission, or super-admin policy. Missing policy denies access even to super admins. An admitted account with no effective business grants retains only account/session self-service. Disabled and suspended accounts cannot authenticate. Scoped resources apply CASL conditions before counts, pagination, direct reads, and mutation checks. Nested document writes and embedded document fields require separate document grants.

Mechanics can read assigned/available problems, claim an open unassigned problem, and work on their current assignments. Claim uses an atomic conditional update; one concurrent claimant wins. Admins, or members with explicit management exceptions, assign eligible staff and manage priority/reopening. Assigned scooter access uses `/v1/problems/scooters/:id`, a limited maintenance projection; the full scooter endpoints require ALL.

Customer access requires all of: active login, a nonarchived linked Person with `customerAccessEnabled`, and the own-data portal grants. Enabling customer portal access through the management action adds any missing own-data portal grants as individual overrides, including replacing a previous explicit portal denial, without changing the staff base role. Existing valid grants are reused. The action does not admit an inactive account. Give a customer-only account the Client role and invite the user through Users. Portal documents require an active, current rental plus explicitly published registration/insurance files. Files remain private and are streamed through authorized endpoints. Revoking portal eligibility preserves unrelated staff access.

Person contact changes never change login credentials. Linking an existing account at Person creation requires an explicit confirmation and matching identity; soft-deleted identities cannot be linked. Financial membership never confers access.

## Rollout

Deploy the API and web against the same access model. The `20261011122000_migrate_legacy_access` data migration automatically adapts existing roles; it does not require an email list or an application-startup hook.

The existing root `Procfile` release phase runs `pnpm --filter api db:deploy`, so the standard production deployment already applies this migration before starting the new API. Environments that run only `start:prod` must run the migration command in their release job.

| Existing legacy roles                            | Migrated access                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| Contains `SUPER_ADMIN` (with or without `ADMIN`) | Active login and `isSuperAdmin = true`; no implicit business role |
| Contains `ADMIN`, without `SUPER_ADMIN`          | Active login and the live Legacy administrator role               |
| Empty or unrecognized roles                      | Login remains disabled                                            |

The compatibility role freezes the permissions for the features previously protected by `ADMIN`. It does not grant the new problem, rental, customer-portal, or protected super-admin operations. Legacy `ADMIN` is preserved regardless of how it was originally assigned, including old finance-created accounts. New finance membership no longer grants access.

Only accounts created before the first authorization migration and still at the untouched migration defaults are eligible: no deletion, revision 1, disabled login, no super-admin designation, role memberships, overrides, or invitations. Explicit post-cutover changes, suspension, deletion, and later-created identities are preserved. Conversion increments revisions, records system audit events, and preserves account IDs, credentials, sessions, and business relationships. Rerunning the SQL does not restore subsequently revoked privileges. An existing compatibility role may be reused only if active with exactly the expected grants; changed metadata is preserved, while archived or incompatible grants abort the transaction for operator resolution.

1. Build the API and web together. Back up the target database and inventory actual accounts. Drain the old API instances so they cannot keep creating users through public sign-in.
2. Apply all additive migrations with the target environment's explicit `DATABASE_URL`: `pnpm --filter api exec prisma migrate deploy`. This includes the automatic legacy-role conversion. Never reset the database.
3. If there was no legacy super admin, use the explicit bootstrap for the first operator: `pnpm --filter api access:bootstrap --email operator@example.com`. Review its dry-run output, then add `--apply`. Existing super admins do not need this command to retain access. No production email is hardcoded.
4. Start the new API and capability-aware web release. Verify a migrated super admin, a migrated ADMIN, a restricted staff account, and a disabled roleless identity. Both processes must run the new build; an old `/auth/me` response lacks the capabilities expected by the new web pages and can produce unexpected 404s.
5. The follow-up `20261012100000_simplify_access_roles` migration creates the Admin, Mechanic, and Client presets and retires other role definitions. Existing access is preserved with per-user exceptions. Subsequent seed/bootstrap reruns preserve edited presets; new permission keys do not silently expand existing roles. Use Users to create additional accounts or invite existing Person-backed identities.

The bootstrap remains available for fresh installations and explicit recovery when no active super admin exists. It preserves IDs and business relationships, creates one requested super admin, and optionally assigns Admin with legacy-access-preserving exceptions to untouched legacy staff supplied through `--reviewed-emails`. Already managed accounts must be changed through user management. An existing active super admin prevents bootstrapping a different email. It does not enforce a maximum number of super admins. It revokes sessions belonging to nonactive users and records the change transactionally. Routine application startup never provisions users or restores privileges.

### Consolidating existing roles

`20261012100000_simplify_access_roles` is additive and follows the legacy conversion. It does not alter the applied migration. Pure Client membership remains Client, Mechanic with optional Client membership becomes Mechanic, and other or mixed staff memberships become Admin. Archived-only membership becomes unassigned; already unassigned accounts remain unassigned.

Before normalizing the presets, the migration snapshots every member’s valid active role grants. Differences between their previous access and the new base role become explicit overrides, including denies for newly available Admin actions. Existing overrides, reasons, invalid fail-closed restrictions, login statuses, super-admin designations, Person portal eligibility, and business relationships are preserved. Mixed staff/customer portal grants become explicit OWN exceptions. The result preserves the same resolved capabilities and prerequisite behavior; an administrator may subsequently reset an exception deliberately.

Retired role definitions remain archived for history. Every changed role/member receives a required system audit, revisions advance, and the migration completes in one transaction under the access lifecycle lock. A completion marker prevents a manual SQL rerun from restoring later-revoked access. Deploy API and web together after applying the migration; public role creation is closed and new member access requests accept at most one base role.

Keep the closed-admission release as the rollback baseline. A previous unrestricted-signup build is not a safe rollback. Preserve the new tables/data. Remove legacy role fields only after consumers and deployments have migrated; this change retains them for compatibility.

## Development and verification

For a new local database, the development seed creates `admin@email.com` as active super admin and creates default roles. It refuses production. Seed reruns do not restore a previously removed admin designation; use the explicit bootstrap for a reviewed migration/recovery.

API unit tests include a route-policy inventory, override/dependency policy matrix, projections, admission races, and domain transitions. Database integration suites are opt-in and require explicit disposable database URLs:

- `ACCESS_DOMAIN_TEST_DATABASE_URL`: mechanic/rental/customer integration tests in `apps/api/src/problems/access-domains.integration.spec.ts`.
- `ACCESS_INTEGRATION_DATABASE_URL`: role/override/CASL/concurrency integration tests in `apps/api/src/access/access.integration.spec.ts`; this suite requires an empty User table.
- `FIXED_ROLES_MIGRATION_DATABASE_URL`: fixed-role consolidation regressions in `apps/api/test/fixed-roles-migration.e2e-spec.ts`; use an empty isolated local `scooter_access_test_fixed_*` or `scooter_access_test_legacy_*` database with the access schema but without the fixed-role consolidation applied. Tests roll back all fixtures and migration effects.
- `LEGACY_ACCESS_MIGRATION_DATABASE_URL`: automatic legacy-role conversion tests in `apps/api/test/legacy-access-migration.e2e-spec.ts`; use an isolated local database migrated through `20261011121000_access_integrity` with no seed data. Tests create transaction-scoped fixtures before and after the cutover boundary.
- `DATABASE_URL`: HTTP E2E suites using `apps/api/test/jest-e2e.json`; never point these at real data.

Use Node 24 and `NODE_OPTIONS=--experimental-vm-modules` for Jest, matching the repository scripts. Apply migrations before test execution. Private storage is mocked in tests; no real customer files or invitation emails are sent by those test suites. The live SMTP/storage providers still require deployment configuration.

Mobile authentication/UI remains deferred in the existing roadmap. Shared permission contracts and Bearer API behavior are available to mobile callers.

### Verification recorded on 2026-10-11

- Shared contracts: 113 tests passed.
- API: 604 unit tests, 20 PostgreSQL integration tests, and 337 HTTP tests passed. The separate finance-book suite passed its seven tests against its required empty disposable database.
- API production build, lint, and generated OpenAPI validation passed.
- Web: all 1,076 tests and full lint passed. The production build, including TypeScript validation, passed with `next build --webpack`. The default Turbopack build stalled in this environment; the successful build required network access for the existing Google Fonts setup.
- The automatic legacy-role migration passed 15 PostgreSQL regressions, including exact grants, cutover time zones, later restrictions, idempotence, conflicting roles, and required-audit rollback. Five additional scooter-create route regressions passed; both test files pass lint and the API typecheck passes.
- Additive migrations and bootstrap were rehearsed on disposable local databases. The local development database was subsequently backed up and migrated while investigating the scooter creation 404; its API was restarted with the new code. No production database has been changed.

Private storage and outgoing mail were mocked for integration/HTTP tests. No interactive browser smoke test was completed in this environment.

### Verification recorded on 2026-10-12

- Fixed-role consolidation: 17 PostgreSQL regressions passed, including chained legacy ADMIN/SUPER_ADMIN conversion, exact authority preservation, mixed customer/staff access, idempotence, and required-audit rollback.
- Access HTTP contracts: 142 tests passed, including the fixed role boundary, single-base-role validation, immutable built-in availability, and independent client portal activation.
- Shared API contracts: 114 tests passed. API typecheck, changed-file lint, and Nest build passed.
- Regenerated `openapi.json` has 100 paths and 152 schemas; user creation and access replacement accept at most one role.
- Migration rehearsals used disposable local databases. The local application database was then backed up to `/tmp/scooter-app-before-fixed-roles-20261012.dump` (mode 600), migrated, and checked against a complete access snapshot. All 60 users retained their effective capabilities, lifecycle flags, and portal eligibility. The three former legacy administrators now use Admin with 36 access-preserving exceptions in total. Exactly three active presets remain, no user has multiple memberships, all 65 migrations are applied, and the API health check reports database up. Production was not changed.
- Member/role UI: 26 focused component tests passed, alongside 16 locale tests, 15 theme tests, the web typecheck, and changed-file lint.
- Playwright CLI verified the actual member/role components with fixture API responses at desktop and mobile sizes. Checks covered light/dark/minimal themes, live primary/background token changes, distinct editor and dialog surfaces, permission search and custom filters, keyboard radio/tab interaction, one-base-role save payloads, review-before-save, unsaved-change protection, and Romanian mobile member navigation. The final browser run reported no runtime errors or horizontal page overflow. This was a component preview, not an authenticated full-app browser session.
- The workspace inherits the active semantic theme without a local color palette. Primary remains unchanged; Open Sans body typography and Montserrat headings use shared theme tokens.

## Delegated administration

The Administration category contains independent grants:

| Permission                 | Capability                                                   | Default Admin |
| -------------------------- | ------------------------------------------------------------ | ------------- |
| `users.read`               | Read the user directory, details, and access history         | Yes           |
| `users.invite`             | Create accounts, send/resend invitations, cancel invitations | Yes           |
| `users.roles.update`       | Assign or remove permitted base roles                        | Yes           |
| `users.permissions.update` | Change individual permission overrides                       | Yes           |
| `users.status.update`      | Suspend, reactivate, or disable eligible accounts            | No            |
| `roles.read`               | Read role definitions and their history                      | Yes           |
| `roles.update`             | Preview and update eligible shared role definitions          | No            |

Mutation authority is reloaded inside the access advisory-lock transaction.
Role assignment and permission changes are checked independently, including on
invitation creation. A delegate cannot change their own access or any current
Admin or Super Admin account, assign Admin (even with overrides denying all of
its grants), edit the Admin role, or grant administration permissions through a
role or an individual override. Super Admin designation and Person portal
activation remain Super Admin-only.

Delegated grants must be subsets of the actor's effective scopes. Both the
proposed role's inherited grants and the resulting effective permissions are
checked, so a restrictive override cannot conceal a broader assignment.
This also means assigning the Client role requires authority over its OWN portal
permissions; the ordinary Admin preset does not include portal permissions.
Shared-role edits also check every affected member to prevent indirect changes
to protected administrators or the actor.

Admins may open the Admin card and inspect disabled permission controls. Read-only
role pages have no save actions. Non-admin role editing and account lifecycle
management can be granted separately by a Super Admin.

Migration `20261023010000_delegated_access_management` adds the five default
delegation grants to active Admin roles, increments access revisions, and records
the change in the audit log. Existing individual overrides are preserved. It does
not grant `roles.update` or `users.status.update`.
