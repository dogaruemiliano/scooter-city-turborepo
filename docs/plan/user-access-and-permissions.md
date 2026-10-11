# User access and permissions implementation plan

Status: implemented on 2026-10-11. The access model, closed admission, API policies, management UI, mechanic workflow, and rental/customer portal are implemented in the working tree; validation and rollout notes are tracked in [access-control.md](../auth/access-control.md). Additive migrations were rehearsed on disposable local databases and the local development database was subsequently backed up and migrated. No production deployment has been performed. The rollout now automatically preserves existing legacy roles, as requested, instead of requiring an email allowlist. Sections describing the previous implementation preserve the original audit as migration context.

Provide explicitly approved access for staff and renters. Persist live roles, role assignments, and per-action user overrides; define supported permissions in code; and use CASL to enforce actions and record scope. Preserve the existing NestJS authentication, OTP, OAuth, RS256/JWKS, and refresh rotation architecture.

Implementation decisions:

- Five authorization tables including the existing User: User, Role, UserRole, RolePermission, and UserPermissionOverride. Admission/invitation and domain records remain separate concerns.
- A role edit changes inherited access for all its members. Individual overrides replace scopes for one action; they are not merged with inherited scopes.
- The permission catalog is typed application code exposed through a read-only API, not a Permission database table.
- Use `@casl/ability` and `@casl/prisma`; keep `@casl/react` optional. Verify the exact compatible package versions before implementation.
- Resolve effective scopes before constructing CASL abilities. Keep record relationships and workflow invariants in resource policies and transaction checks.
- First close public admission; then introduce the permission model and convert existing routes without weakening current guards.

**1. Current implementation and gaps**

| Requirement                                     | Current implementation                                                                                                            | Required work                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Default super admin                             | `ADMIN` and `SUPER_ADMIN` exist. The development seed creates `admin@email.com` with both. The seed refuses production execution. | Add an explicit production bootstrap mechanism. There is no verified production default admin.      |
| Super admin can do everything                   | Guards compare role strings exactly. `SUPER_ADMIN` alone does not satisfy `ADMIN`.                                                | Introduce a deliberate system-level super-admin override for permission checks.                     |
| Add staff by email                              | No general user-management controller or UI. An internal UsersService can create records.                                         | Add user provisioning, access settings, activation, suspension, and invitation delivery.            |
| Live roles and individual customization         | `User.roles` is a string array; no permission catalog, role records, or individual overrides.                                     | Introduce a code-owned catalog, UI-managed live roles, assignments, and per-action scope overrides. |
| Own or assigned records                         | Own account/session operations and some upload ownership checks exist. No general scoped authorization layer.                     | Define relationships per resource and enforce them in queries and mutations.                        |
| Person linked to account                        | Every Person has a unique, required `userId`. Person creation creates or reuses a matching User.                                  | Keep the link; separate having a User row from permission to sign in.                               |
| Optional renter access                          | Existing Person-backed users can use enabled sign-in methods unless deactivated. No explicit login approval exists.               | Default new Person accounts to login disabled; add a separate enable-access action.                 |
| Rental details and renter documents             | Scooter document storage and staff endpoints exist. No Rental model or rental API exists.                                         | Build the rental relationship and a customer-specific read API before exposing these records.       |
| Mechanic problem assignment                     | No scooter problem/repair model or controller exists.                                                                             | Add the problem workflow, assignment relationship, and scoped actions.                              |
| Permission changes apply on subsequent requests | API checks session revocation/deletion against DB, but reads roles from the access JWT.                                           | Load current authorization from DB on each request.                                                 |

Evidence: [role constants](../../packages/api-shared/src/v1/auth/auth.constants.ts), [RolesGuard](../../apps/api/src/common/guards/roles.guard.ts), [development seed](../../apps/api/prisma/seed.ts), [User and Person models](../../apps/api/prisma/schema.prisma), [PersonsService](../../apps/api/src/persons/persons.service.ts), [JWT strategy](../../apps/api/src/auth/strategies/jwt.strategy.ts).

Two existing behaviors must change alongside permissions:

- [Finance associate management](../../apps/api/src/finance/infrastructure/prisma-finance.repository.ts) creates users with `ADMIN` or adds `ADMIN` to existing users. Financial ownership must not automatically grant application administration.
- Person updates currently synchronize email, phone, and names to the linked User. Giving staff permission to edit a Person must not let them change another user's login email. Split contact details from credential changes. Existing Person creation also updates a matching User's profile; review that behavior for linked staff accounts and reject reuse of deactivated users.

**2. Exactly what a user with no role can access today**

The repository contains 80 controller handlers: 62 business handlers, 8 authenticated self-service handlers, and 10 handlers marked public. Enabled-method configuration determines which authentication handlers are registered. This is a source audit, not a live penetration test.

A user whose current access token contains `roles: []`, with a valid active session, can access:

| Method and path                      | Access                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `GET /v1/auth/me`                    | Their account profile                                                  |
| `PATCH /v1/auth/me`                  | Their editable profile fields                                          |
| `DELETE /v1/auth/me`                 | Deactivate their account                                               |
| `GET /v1/auth/sessions`              | Their sessions                                                         |
| `DELETE /v1/auth/sessions/:id`       | Revoke their own session only                                          |
| `POST /v1/auth/logout`               | End their current session                                              |
| `POST /v1/auth/logout-all`           | End all their sessions                                                 |
| `DELETE /v1/auth/accounts/:provider` | Unlink their own OAuth identity, subject to retaining a sign-in method |

Anyone can reach the following public handlers, although successful authentication operations still require the relevant code, provider token, or refresh token:

- `GET /healthz`, `GET /.well-known/jwks.json`, `GET /v1/auth/enabled-methods`.
- `POST /v1/auth/email-otp/request`, `/email-otp/verify`, `/otp/resend`.
- `POST /v1/auth/google`, `/apple`, `/oauth-email/verify`.
- `POST /v1/auth/refresh` requires a valid refresh token and session.

Swagger UI `/api-docs` and JSON `/api-docs-json` are also mounted by [main.ts](../../apps/api/src/main.ts) without an application role check; they are outside the controller count. CORS preflight is infrastructure behavior, not access to business records.

All current Person, scooter, scooter-document, scooter-brand, CIV-vocabulary, and finance handlers require `ADMIN`, with six finance handlers requiring `SUPER_ADMIN` instead. A roleless token cannot pass those guards. CSRF, validation, throttling, and ownership checks still apply where relevant.

Important distinction: clearing roles in the database does not immediately clear roles in an already-issued access token. A formerly privileged user can retain the token's privileges until refresh/expiry unless their sessions are revoked. The new model closes this gap.

The future rule is **no business permissions means no business access**. A user without a role may legitimately have access through individual overrides. Role names themselves will not authorize anything. Explicitly admitted users with zero effective permissions may retain account/session self-service; disabled or suspended users cannot sign in.

**3. Live roles and per-action scope overrides**

Roles are UI-managed records containing supported permission keys and scopes. Users may hold multiple roles. For each action, combine scopes from the assigned roles, unless the user has an override for that action. A role edit changes inherited access for its members on subsequent requests.

| User setting for `problems.resolve` | Effective scopes                                       |
| ----------------------------------- | ------------------------------------------------------ |
| No override row                     | Union of scopes from assigned roles                    |
| Override with `[ASSIGNED]`          | Assigned problems only, even if a role grants all      |
| Override with `[ALL]`               | All eligible problems, even without a role grant       |
| Override with `[]`                  | No access to this action, including future role grants |

An override replaces the entire scope set for one action. It does not replace permissions for other actions. Reset to roles deletes the override row; saving an empty array must never be treated as deleting the row. An override remains after a role edit or removal, including standalone access it grants. Removing a role is therefore not equivalent to removing all access; suspension is the account-wide stop.

Example: assign Mechanic, customize `scooters.read` to `[ALL]`, and customize `problems.resolve` to `[]`. The user keeps all other inherited Mechanic permissions. If the role later gains a new action, that action is inherited unless an override already exists for it.

Normalize scope arrays: remove duplicates, use stable ordering, and collapse a set containing ALL to `[ALL]`. An empty RolePermission selection deletes that role/action row; empty arrays are meaningful only in user overrides. Own and assigned are independent relationships, not a numeric privilege ranking. Unknown permission keys and unsupported scopes are rejected. Invalid stored overrides deny that action and raise an operator diagnostic; they must not fall back to a broader inherited grant.

This model supports the requested additions, restrictions, and own/assigned/all access. It intentionally excludes set-subtraction policies such as “all except my assigned records.” There is no ALLOW/DENY effect column, role inheritance, permission wildcard, or administrator-authored condition expression. Resolve overrides before building CASL rules so behavior does not depend on CASL rule order.

Role saves show the changed grants, affected-member count, and effective-access impact, including actions protected by overrides. Role and user access edits use separate expected revisions. Prevent archiving or deleting an assigned role; offer explicit replacement/removal with an impact preview and transactionally recheck membership before archive. Re-enabling an archived role must not restore old memberships. Retain role IDs and audit history.

Only super admins manage roles, assignments, and overrides initially. Editing a role is privilege delegation because it changes every member. Future delegated administrators need grant ceilings and target-account protections before receiving this authority.

Super admin is a protected `User.isSuperAdmin` designation, separate from ordinary roles. It grants implemented actions but does not bypass login status, explicit endpoint policy declarations, customer eligibility, resource existence, audit requirements, or domain invariants. Creating a role named “Super admin” cannot confer this designation.

**4. Record scope has a concrete meaning per resource**

| Scope     | Meaning                                                                           | Example                                              |
| --------- | --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Own       | The authenticated user is the subject/owner through a trusted stored relationship | A rental's Person has `userId` equal to the caller   |
| Assigned  | The record is explicitly assigned to this user                                    | A problem has `assignedToUserId` equal to the caller |
| Available | A limited work queue of unassigned, claimable records                             | Open scooter problems a mechanic can claim           |
| All       | All eligible records in this installation                                         | A service coordinator's problem list                 |

“Created by me” is not the same as “belongs to me.” A rental agent creating a rental does not own the customer's rental. If a created-by scope is needed later, introduce it as a distinct supported scope rather than overloading own.

Scopes are evaluated per action after override resolution. Someone may read all problems but update only assigned problems. Within the effective scope set, relationships combine by union; separate required actions and eligibility constraints combine by intersection. Missing relationships never fall back to all.

Keep an explicit supported-scope list for each permission. Do not show an Own selector for a resource with no meaningful owner. Initial staff Person CRUD and financial ledger access support all only; renter access uses separate own-data projections. Fine-grained finance access cannot be safely implemented by filtering `createdById`, because accounts and operations can involve multiple parties.

Apply scope in the database query before pagination, search ranking, counts, aggregation, or export. Apply the same rule to direct-ID reads, nested children, file content, uploads, and mutations. Verify parent/child relationships together. Return 403 for a missing action grant and 404 for an inaccessible resource ID without disclosing whether it exists. An authorized scoped list can legitimately return zero results.

For every mutation, derive or verify ownership/assignment on the server. Request bodies cannot set arbitrary owners, login status, grants, or role fields through general profile/domain endpoints.

Locations/teams are not existing authorization boundaries. Do not invent a location restriction that cannot be enforced. Add location membership as an additional intersection later if the operating model needs it.

**5. Initial permission catalog and roles**

The following catalog is the implementation contract. Define it once in `packages/api-shared/src/v1/access` with typed action keys, supported scopes, UI label/description message keys, and prerequisite metadata. The API exposes it to the role editor. Keep executable CASL subject/scope translators in the API so Prisma and server internals do not enter client bundles. A key such as `problems.resolve` identifies the action; its scopes live in the grant array, not in a duplicated key suffix or resource/action columns. Split keys only where actions carry meaningfully different authority.

| Area                                | Permission keys                                                                                                                                          | Supported scope                                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Staff person records                | `persons.read`, `persons.create`, `persons.update`, `persons.archive`, `persons.audit.read`                                                              | All                                                                                              |
| Person identity documents           | `person_documents.read`, `person_documents.write`, `person_documents.delete`, `person_documents.extract`                                                 | All; draft ownership is an additional restriction                                                |
| Scooters                            | `scooters.read`, `scooters.create`, `scooters.update`, `scooters.archive`                                                                                | All initially; assigned read becomes supported with problems                                     |
| Scooter documents                   | `scooter_documents.read`, `scooter_documents.write`, `scooter_documents.extract`                                                                         | All; draft ownership is additionally enforced                                                    |
| Scooter reference data              | `scooter_brands.read`, `scooter_brands.manage`, `vehicle_civ.read`                                                                                       | All                                                                                              |
| Finance reads                       | `finance.books.read`, `finance.suppliers.read`, `finance.accounts.read`, `finance.operations.read`, `finance.reference.read`                             | All                                                                                              |
| Finance actions                     | `finance.suppliers.manage`, `finance.expenses.create`, `finance.funding.create`, `finance.operations.reverse`, `finance.settlements.preview`             | All; extraction/draft ownership remains mandatory                                                |
| Protected company configuration     | `finance.books.manage`, `finance.company.read`, `finance.company.manage`                                                                                 | Super admin only in first release                                                                |
| Access administration               | List users, provision users, edit grants/status, edit roles, enable customer access, and designate super admins                                          | Super admin only in first release; dedicated protected policy, not ordinary grant keys           |
| Problems, when implemented          | `problems.read`, `problems.create`, `problems.update`, `problems.resolve`, `problems.claim`, `problems.assign`, `problems.prioritize`, `problems.reopen` | Read: assigned/available/all; update/resolve: assigned/all; claim: available; other actions: all |
| Customer portal, when implemented   | `portal.profile.read`, `portal.rentals.read`, `portal.scooter_documents.read`                                                                            | Own only                                                                                         |
| Rental operations, when implemented | `rentals.read`, `rentals.create`, `rentals.handover`, `rentals.return`                                                                                   | All for initial rental agents; customer own reads remain separate                                |

Future permissions remain unavailable in the editor until their endpoints and resource policies exist. They do not make unfinished functionality appear enabled. Protected super-admin operations are marked nonassignable and rejected in role/override payloads; they are not a way to delegate administration through an ordinary role.

| Role                | Default grants                                                                                                                                         | Deliberately absent                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Mechanic            | Problems read assigned/available; claim available; update/resolve assigned; scooters read assigned                                                     | Assignment to others, priority, finance, person KYC, user administration |
| Service coordinator | Problems read/create/update/resolve/assign/prioritize/reopen all; claim available; scooters read all                                                   | User administration, finance by default                                  |
| Rental agent        | Persons read/create/update all; required document read/write; scooters read all; scooter documents read all; rental operational actions when available | Archival, finance administration, user administration                    |
| Operations manager  | Person/scooter operations and service coordination                                                                                                     | Finance and access administration unless separately authorized           |
| Finance operator    | Finance read permissions, supplier management, expense/funding creation, settlement preview                                                            | Reversal by default, company configuration, access administration        |
| Customer            | Own portal profile, rentals, approved scooter documents                                                                                                | Staff endpoints and operational/KYC/internal financial data              |

Seed default roles only for implemented functionality; do not advertise a functional Mechanic experience until the problem phase is complete. The migration creates a clearly named Legacy administrator role to automatically preserve existing ADMIN privileges without making it the default for new users. Existing SUPER_ADMIN accounts automatically receive the protected designation and active login. Seeds create missing roles once and never overwrite roles edited through the UI. Adding a catalog entry does not grant it to existing roles; later feature permissions require an explicit reviewed role edit.

For initial delivery, only super admins manage access and roles. If delegation is added later, define grant ceilings and target-account protections first: possessing a permission is not automatically authority to grant it. This avoids building an incomplete privilege-escalation boundary into the first release.

**6. Account admission and adding users**

Separate the User identity row from login eligibility. Add login status with these states:

| State     | Can authenticate?                                                   | Transition                                                             |
| --------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Disabled  | No                                                                  | Default for Person/finance identities; super admin may invite          |
| Invited   | Only to activate through verified identity before invitation expiry | Verification atomically activates; cancellation returns to disabled    |
| Active    | Yes                                                                 | Can be suspended or have permissions edited                            |
| Suspended | No                                                                  | Explicit super-admin reactivation; never auto-reactivate through OAuth |

`deletedAt` remains account deactivation and always denies sign-in. Expired invitations are computed from their expiry and cannot activate; resend creates a new invitation generation. Proposed invitation lifetime: seven days, configured centrally.

Staff flow:

1. Super admin opens Users and chooses Add user.
2. Enter normalized email and optional display name. Resolve an existing matching User, including a Person-backed identity; do not create a duplicate. Existing active users get an explicit access-edit operation instead of having their status reset. Deleted/suspended records require explicit recovery/reactivation, not implicit reuse.
3. Assign one or more live roles. For exceptions, choose Use roles or Customize for this user per action, then review the effective scopes and their sources.
4. Save User, admission status, role assignments, override rows, invitation generation, and required audit event in one transaction. A duplicate concurrent email request converges to a conflict or the existing record, never a second identity.
5. Send a notification linking to the normal sign-in page after commit. The link is not an authentication credential. Show pending/delivered/failed delivery with a retry action; mail failure does not delete the provisioned user or falsely report delivery.
6. The recipient verifies their invited email with existing OTP, or uses an enabled OAuth provider whose verified email matches. A linked OAuth identity must also pass current admission checks. Use existing independent OTP verification when the provider email is unverified. Private-relay or different provider email does not match an invitation automatically.
7. Atomically consume the invitation generation, mark active, record activation, and issue the session. Check expiry, cancellation, suspension, and current email again at activation, including challenges issued before an access change.

No password creation and no separate bearer invitation token are needed for this first version. The admin-approved email plus proof of its ownership is the admission mechanism. The API must reject a sign-in method configuration that leaves an invitee no usable activation method, or surface the configuration problem before sending.

Access editing uses a revision number for optimistic concurrency. Two admins editing the same user receive a conflict rather than silently overwriting each other. Role assignments and override rows are saved atomically. Role contents have their own revision and live independently of the user edit. Activation uses current configured roles/overrides, not a permission snapshot in the invitation. Normal permission edits apply to subsequent API requests; suspension/cancellation revokes relevant sessions and prevents new token issuance.

Close every public creation path: email OTP, verified Google/Apple first login, and OAuth email-verification completion. A valid identity proof must never create an unapproved User. Check admission at challenge request/resend, verification, OAuth resolution, centralized session issuance, refresh, and authenticated session lookup. Preserve generic public responses and rate limits: unknown/disabled emails receive the same request response shape, no usable login session, and no invitation status disclosure. Do not send login codes to ineligible addresses. Recheck at verification even if a code was legitimately sent earlier.

Enforce status transitions and invitation generations transactionally so cancellation cannot race with activation and revive access. Extend eligibility checks around the existing refresh implementation; do not replace its row-lock/chain/grace behavior. Revoke sessions on suspension and verify the user remains active at refresh/token issuance.

**7. Super admin bootstrap and lifecycle**

Retain the local development seed but migrate its designation to the new model. The production data migration automatically converts existing SUPER_ADMIN accounts. Keep a separate, explicit bootstrap command accepting an operator-supplied email for fresh installations or recovery; it is not required to retain an existing legacy super admin. Do not auto-promote the first public sign-in, hard-code a production email, or reuse the test seed.

The bootstrap command is idempotent for the designated account, records a system audit event, and creates one initial active super admin on a new installation. It must refuse to silently promote a different account when an active super admin already exists. Use the protected administration flow for later super-admin changes. Handle concurrent bootstrap attempts transactionally.

During admission batch A, existing business guards still consume legacy role strings. Bootstrap and the development seed must therefore set both legacy `ADMIN`/`SUPER_ADMIN` and the new designation for the approved super admin until cutover D. Preserve existing staff role strings during this interval and convert their authority automatically during migration; do not convert a future Mechanic into ADMIN to make early access work. New restricted staff access waits for the permission cutover. D switches API and clients to the new authority and removes legacy strings as an authorization source; dropping the old column is a later compatibility cleanup.

There is no uniqueness constraint limiting the installation to one super admin. Normally keep one, as requested. Protect the last active super admin against demotion, suspension, and self-deactivation with a transactional check; multiple super admins are allowed. Provide an operator recovery procedure rather than a public bootstrap HTTP endpoint. A designation never proves email ownership: the user must still complete normal authentication.

**8. Person and customer access**

Keep `Person.userId`; it is already the correct stable ownership link. Creating a Person leaves login disabled by default. Existing staff who are also renters keep their one User and may receive both staff and customer roles or overrides. Preserve explicit login admission separately from these business relationships.

Expose a distinct “App access” section on Person detail. Super admins can enable access, invite/resend, and revoke customer access. Ordinary `persons.update` cannot change access, link a different identity, or change `User.email`. Creating a Person does not grant customer access unless an explicit authorized enable-access action is included and validated atomically.

Person email is contact information; User email is the login identity. Decouple their updates. Show the login email in the access section when different. For the first release, edit contact details without modifying credentials; a dedicated verified login-email change workflow is a separate feature. Do not let Person creation overwrite protected identity fields of an existing staff account. Explicitly reject deleted-account linking. When an existing identity matches contact data, show and confirm the intended link to the authorized operator; do not retarget `Person.userId` through contact edits or silently overwrite that User's profile.

Add `Person.customerAccessEnabled`, default false. Every portal request requires active login, an active linked Person with this flag enabled, the relevant effective permission, and ownership of the requested record. Revoking customer access sets the flag false, so another role or override cannot restore portal access accidentally. It preserves staff roles and account self-service; account-wide suspension remains a separate explicit action. Enabling customer access can assign the Customer role through the access service, but must not erase explicit portal overrides. Archiving a Person blocks their portal relationships while preserving unrelated staff access. Account self-deactivation continues to preserve business history, subject to the last-super-admin rule.

Implement customer APIs separately from staff DTOs:

- `GET /v1/portal/me`: a limited projection of the linked Person.
- `GET /v1/portal/rentals` and `GET /v1/portal/rentals/:id`: only rentals linked to that Person.
- `GET /v1/portal/rentals/:id/scooter-documents` and the corresponding `/:documentId/content`: only documents approved for customer visibility for that rental's scooter.

These APIs must not return internal notes, other renters, staff assignments, person KYC images, financial ownership records, private storage keys, or raw document-extraction data. Create explicit customer response schemas rather than serialize the staff DTO and hide fields in the UI.

Rental dependency: add a rental record with stable `personId`, `scooterId`, start/end dates, status, and the details the customer should see. Integrate these fields with the future rental-management model rather than introduce a second competing rental table. A minimal read portal requires a real staff-managed source of rental records; do not seed fake runtime relationships or infer tenancy from contact email.

Proposed document policy: a separate explicit customer-visible flag, false by default, on eligible scooter documents, writable only with the relevant staff document permission. Only registration/insurance material intended for renters should be shared after review. Customers see rental history belonging to them; live scooter documents are available only during an active rental and its effective dates. Returned/cancelled rentals do not grant access to the scooter's current documents. Historical contract/document snapshots can be added with rental management.

Authorize both the rental and document relationship on each content request. Continue private API streaming for customer downloads so revocation applies to future requests; do not publish storage objects or long-lived share URLs. Files already downloaded cannot be recalled.

**9. Mechanic problems and assignment**

Add a ScooterProblem record containing scooter, description, priority, status, reporter, nullable assignee, timestamps, and resolution notes. Use states open, in progress, resolved, and cancelled. Record assignment/status changes with actor, old value, new value, and time. A resolved problem does not automatically establish that a scooter is rentable; any roadworthiness rule belongs to the domain workflow.

| Operation                | Rule                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| List available problems  | `problems.read:available`; return a limited queue projection, not customer data               |
| Claim                    | `problems.claim:available`; server chooses caller as assignee; only open, unassigned problems |
| Start work               | `problems.update:assigned` or all; transition open to in progress                             |
| Add work notes           | `problems.update:assigned` or all; assignee/current state checked at write time               |
| Resolve                  | `problems.resolve:assigned` or all; open/in-progress to resolved, with resolution notes       |
| Assign/reassign/unassign | `problems.assign:all`; target must be active and have assigned-problem work permissions       |
| Set priority             | `problems.prioritize:all`                                                                     |
| Reopen                   | `problems.reopen:all`; resolved to open, clearing assignee by default so it can be reassigned |
| Cancel                   | `problems.update:all`; separate from the restricted mechanic update payload                   |

Suggested endpoints: `GET/POST /v1/problems`, `GET/PATCH /v1/problems/:id`, `POST /v1/problems/:id/claim`, `PUT /v1/problems/:id/assignee`, `POST /v1/problems/:id/resolve`, and `POST /v1/problems/:id/reopen`.

General update cannot change assignee or bypass privileged priority/state actions. Mechanics cannot choose someone else's user ID in claim. They cannot take an assigned problem or silently release it; a coordinator manages reassignment. Assignment eligibility uses actual grants, not the label Mechanic.

Claim must be an atomic conditional write: only one concurrent request can claim an open unassigned problem. The losing request returns 409. Reassignment and mechanic updates use an expected revision/assignee condition so an old assignee cannot finish a write after reassignment. Resolve/archive/state checks happen in the same transaction as the mutation and audit.

The available queue includes enough scooter summary to decide whether to claim. Assigned scooter reads are restricted to scooters linked to the mechanic's current assigned problems and return a maintenance-oriented projection; they do not expose embedded rental/KYC data. No permission for full scooter documents is implied.

On suspension or removal of work permissions, keep assigned problems and history intact and flag them for coordinator reassignment. Never silently resolve or redistribute work. Searchable assignee options expose only minimal eligible-user identity, not the full user directory.

**10. Persistence and shared contracts**

This is a logical data design; implementation must verify Prisma syntax against the installed version before writing schema or migrations. `prisma` and `@prisma/client` resolve to 7.8.0 in the lockfile. Based on the [Prisma 7 guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7) read on 2026-10-11, retain the project's generated client output, driver adapter, explicit pool settings, and explicit environment loading. No ORM/framework upgrade is part of this work.

Use five authorization tables total, including the existing User:

| Record                 | Fields and constraints                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User                   | Existing identity fields plus `loginStatus` default disabled, `isSuperAdmin` default false, and `accessRevision` for concurrent access edits. `deletedAt` retains its current meaning.  |
| Role                   | Stable ID/slug, name, description, revision, timestamps, archived timestamp. Names are labels, not authority. Slug unique; IDs remain stable across renames.                            |
| UserRole               | `userId`, `roleId`, `assignedAt`; unique user/role, index roleId for member impact queries. Reject assignment to archived roles.                                                        |
| RolePermission         | `roleId`, `permissionKey`, `scopes[]`; unique role/key. Nonempty array of the fixed scope enum, normalized and validated against the code catalog. Clearing all scopes removes the row. |
| UserPermissionOverride | `userId`, `permissionKey`, `scopes[]`, optional reason, timestamps; unique user/key. Empty arrays are valid explicit restrictions. Deleting the row restores role inheritance.          |

Use explicit relation tables for role membership and permission entries. Use PostgreSQL enum arrays only for the small scope set; do not store executable conditions or entire policies as JSON. Foreign keys enforce identity/role integrity. Do not persist duplicate resource/action/suffixed-key fields.

There is no Permission table, template table, or copied grant-provenance table. The tradeoff is no foreign key for permission keys: all write paths must validate against the shared catalog, and runtime must fail closed on invalid stored entries. Permission renames/removals need a data migration and coordinated deployment; never reuse a retired key with a new meaning. Report stale rows before rollout. Do not drop an invalid override and accidentally restore inherited access.

Supporting records outside the five authorization tables:

| Record                         | Fields and constraints                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UserInvitation                 | User, normalized invited email, generation, inviter, expiry, activated/cancelled times, delivery state. One current usable generation. No password or bearer invitation secret. |
| Access audit                   | Existing AuditEvent types with actor/target, before/after roles/overrides/status, role revisions, and reasons; exclude credentials and OTPs.                                    |
| Person customer eligibility    | `customerAccessEnabled` default false, checked independently of roles on every portal request.                                                                                  |
| ScooterProblem                 | Added in the problem phase; assignee/scooter indexes and revision for concurrent updates.                                                                                       |
| Rental and document visibility | Added in the portal phase with explicit Person/Scooter relationships and customer publication policy.                                                                           |

All access mutations, including role updates, assignment, overrides, admission, customer eligibility, and bootstrap, use existing [AuditService.recordRequired](../../apps/api/src/audit/audit.service.ts) in the same database transaction. Its best-effort `record` wrapper is not sufficient for these changes. Preserve business/audit history; do not hard-delete users or assigned roles.

Default-deny constraints apply to all creation paths, including imports, seeds, Person creation, and finance associate creation. Legacy `User.roles` may remain briefly for contract compatibility, but it must not remain an alternate source of authority after cutover.

Add a shared `v1.access` contract for the catalog, roles, assignments, overrides, impact previews, and effective access. Extend `v1.auth.SessionUser` with fresh effective scopes, super-admin status, user access revision, and a safe `portalEligible` boolean derived from the linked active Person and customer-access flag. Portal navigation requires both this eligibility and the relevant scopes. A user revision does not version the contents of shared roles: include sorted assigned role IDs/revisions and portal eligibility in any client capability version, or always revalidate fresh capabilities without such a version. Customer eligibility changes and Person archival update the linked user access revision in the same transaction. Keep administrative provenance out of ordinary customer responses.

Keep profile-patch DTOs narrow. `PUT /v1/users/:id/access` is a complete replacement of assignments/overrides with an expected user revision and the role revisions used for the preview; every override object requires an explicit scopes array. Omission of an override from this full payload restores inheritance, while `scopes: []` denies that action. Validate and save the complete payload atomically. Role PUT likewise uses a complete permission list and expected role revision. Generate permission prerequisites in the editor from the catalog and validate their effective result on the server.

Proposed access routes, protected by the super-admin policy:

- `GET/POST /v1/users`, `GET /v1/users/:id`.
- `POST /v1/users/:id/access/preview`, `PUT /v1/users/:id/access`.
- `POST /v1/users/:id/invitations`, `DELETE /v1/users/:id/invitations/current`.
- `PUT /v1/users/:id/status`; `PUT /v1/users/:id/super-admin` changes the protected designation with an expected user revision and the last-active-admin safeguard.
- `GET /v1/access/permissions`; `GET/POST /v1/access/roles`; `GET/PUT /v1/access/roles/:id`.
- `POST /v1/access/roles/:id/preview`, `POST /v1/access/roles/:id/archive`.
- `PUT /v1/persons/:id/app-access` delegates to the same access service; it is not ordinary Person CRUD.

Preview is informative, not authorization to commit: save rechecks permissions, revisions, role availability, dependencies, and relevant membership changes. Role archive and membership writes serialize on the role so an assignment cannot race past the zero-members check. Role replacement/removal is explicit through user access edits; an atomic bulk operation can be added if needed, with its own reviewed impact.

Directory responses omit credentials, tokens, unnecessary KYC, and finance data. Ordinary users obtain their own current capabilities through `/v1/auth/me`, without access to the full role-management API. Add NestJS controller DTOs and shared schemas together, then update consumers and generated OpenAPI.

**11. API enforcement and current route migration**

Use CASL as the authorization evaluator while the application owns roles, overrides, admission, audit, and workflow rules. Keep the five-table design independent of CASL's internal rule representation.

The request pipeline is:

```text
Verified identity and active session
  → Fresh login status, roles, overrides, and resource eligibility
  → Resolve effective scopes per action
  → Compile trusted CASL rules for those scopes
  → Guard action check and resource query/object checks
  → Transactional workflow checks and mutation
```

Introduce one access module with these small responsibilities:

| Component                             | Responsibility                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Permission catalog and shared schemas | Typed action keys, scopes, labels, prerequisites, DTOs; no Prisma runtime in shared/client code                  |
| Access resolver                       | Load current DB authority once per request and apply role union plus per-action replacement overrides            |
| Ability factory                       | Compile the resolved scopes to CASL rules using trusted server-side translators                                  |
| Global policy guard                   | Require an explicit route policy and perform admission/action checks                                             |
| Resource policies                     | Define own/assigned/available relationships, scope-filter composition, field-safe projections, and record checks |
| Access administration service         | Atomic role/membership/override/lifecycle changes with revisions, protected authority, and required audit        |

Use the full catalog key as the CASL action and a code-defined model/subject mapping, so staff `rentals.read` cannot accidentally authorize `portal.rentals.read`. No API accepts arbitrary CASL rules, action aliases, conditions, or wildcard grants. An empty effective scope set produces no allow rule. Resolve user overrides before compilation; do not encode replacement with a combination of CASL `can`/`cannot` ordering.

CASL package and Prisma integration gate:

1. Verify and pin compatible published versions of `@casl/ability` and `@casl/prisma`. Record versions and the reviewed documentation in the implementation change; repository main-branch documentation alone is not proof of published-version behavior.
2. Use the documented custom-generated-client integration for Prisma 7, preserving the project's `src/generated/prisma/client`, adapter, and pool configuration. Isolate any `@casl/prisma/runtime` wrapper and type mapping in one API module. See [CASL Prisma documentation](https://github.com/stalniy/casl/tree/master/packages/casl-prisma#custom-prismaclient-output-path-prisma-7-default).
3. Before converting endpoints, prove scoped filtering, no-grant behavior, count/list/detail agreement, nullable assignment and ownership, nested relations, and mutation behavior against Prisma 7.8. Test both the normal client and interactive transaction client.
4. Follow the pinned adapter version's requirements for `accessibleBy` and any required client extension. Denied or invalid conditions must never be dropped or replaced with an unrestricted query. Map a missing action grant to 403 and an inaccessible record to 404; authorized lists with no matches return an empty result.
5. Confirm query conditions are combined with domain constraints using intersection. No access-control filter can be overwritten by client-supplied filters. CASL does not automatically secure every Prisma call or raw SQL query; enforce the same policy explicitly on each domain access path.

The gate must pass before CASL becomes the production enforcement path. Keep existing guards intact if the selected version fails; resolve compatibility rather than introducing a second competing evaluator or silently changing the ORM.

Every registered handler declares one of: public, authenticated self-service, permission requirement, or protected super-admin action. Missing policy means denied, including for super admins. A route-inventory test fails when a new handler lacks policy. The NestJS integration follows the documented [ability factory and guard pattern](https://docs.nestjs.com/v11/security/authorization); adapt examples to default deny instead of copying permissive fallbacks.

A coarse action check is not record authorization. Use CASL-derived Prisma conditions before fetching lists/counts, combine ID and access filters for direct reads, and verify actual subjects or scoped writes for mutations. Required object fields/relations must be available for in-memory checks; do not treat a partially loaded object as proof. Compare object evaluation with database filtering in tests. Private content, nested mutations, extraction drafts, previews, and raw SQL search paths require the same enforcement. CASL field rules do not automatically redact response DTOs.

Reuse the JWT strategy's active-session DB lookup to obtain current authority. Do not authorize from JWT role snapshots. Initially use request-local reuse with no cross-request authorization cache. Role and override changes apply on subsequent requests after commit, without token rotation. This does not cancel requests already authorized. Assignment-sensitive mutations recheck state/revision in the transaction; sensitive access changes serialize their relevant authority checks. Any later background job or long-running export must define whether and when authority is rechecked before execution and delivery.

CASL does not replace atomic claim/reassignment logic, email ownership verification, invitation eligibility, audit, or domain invariants. Preserve CSRF checks, throttling, JWT/JWKS verification, and the existing refresh-rotation algorithm. Do not add a new authentication framework or separate authorization server for this scope.

All 62 business handlers must be mapped. Grouped mapping below covers the current surface:

| Current routes                                                                                      | New requirement                                                               |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Persons list/detail (2)                                                                             | `persons.read:all`                                                            |
| Person create/update/delete (3)                                                                     | `persons.create`, `persons.update`, `persons.archive` respectively            |
| Person audit events (1)                                                                             | `persons.audit.read:all`                                                      |
| Person document extraction (1)                                                                      | `person_documents.extract:all`                                                |
| Person document list/detail, photo list/content (4)                                                 | `person_documents.read:all`                                                   |
| Person document create/update/replace, photo PUT, upload URL, draft upload URL, complete upload (7) | `person_documents.write:all`, plus existing upload ownership                  |
| Person document/photo delete (2)                                                                    | `person_documents.delete:all`                                                 |
| Scooter list/detail (2)                                                                             | `scooters.read` with supported scope and projection                           |
| Scooter create/update/delete (3)                                                                    | `scooters.create`, `scooters.update`, `scooters.archive`                      |
| Scooter document list/content (2)                                                                   | `scooter_documents.read:all`; customer access uses separate portal routes     |
| Scooter extraction/upload URL (2)                                                                   | `scooter_documents.extract` / `scooter_documents.write`, plus draft ownership |
| Scooter brands GET (1), POST/PATCH/DELETE (3)                                                       | `scooter_brands.read` / `scooter_brands.manage`                               |
| CIV vocabulary (1)                                                                                  | `vehicle_civ.read`                                                            |
| Finance books GET (1)                                                                               | `finance.books.read`                                                          |
| Finance books POST/PUT, company identity GET/PUT, associates GET/PUT (6)                            | Protected super-admin policy                                                  |
| Finance suppliers GET (1), POST/PATCH (2)                                                           | `finance.suppliers.read` / `finance.suppliers.manage`                         |
| Finance accounts list/balances/detail/balance (4)                                                   | `finance.accounts.read`                                                       |
| Finance expense categories and cost objects (2)                                                     | `finance.reference.read`                                                      |
| Finance operations list/detail (2)                                                                  | `finance.operations.read`                                                     |
| Finance operation reversal (1)                                                                      | `finance.operations.reverse`                                                  |
| Expense upload/extraction/extraction-read/preview/create (5)                                        | `finance.expenses.create`; extraction-read remains owner restricted           |
| Funding preview/proof upload/create (3)                                                             | `finance.funding.create`                                                      |
| Settlement preview (1)                                                                              | `finance.settlements.preview`                                                 |

Composite operations need additional checks beyond this handler table: attaching/replacing scooter documents through scooter create/update requires document-write authority; creating a Person with nested documents requires document-write authority. A write-only permission must not become a way to read unauthorized reference records via a preview, response, selector, or error. Add explicit catalog prerequisites and validate them on save; do not silently widen grants. Default write roles include necessary read/reference permissions. Validate dependencies against resolved user permissions too, so an override cannot create an unsupported combination. Preview affected users during role edits; do not silently repair a missing dependency by granting more access. Runtime policy still requires the prerequisite if invalid data or a race reaches enforcement.

Review existing Person/Scooter response mappers for embedded document or other protected fields. When document-read permission is absent, omit protected embedded data or use a narrower response contract. Handler separation alone is insufficient. Finance reference/detail/preview responses need the same review, especially if later adding own-only views.

**12. Web and mobile behavior**

Add Users and Roles areas visible only to super admins. The role editor lists supported actions grouped by feature, shows meaningful scope selectors, and never offers arbitrary permission creation. Built-in role names have no special authority. Renaming a role changes its label only.

User detail shows login status, invitation/delivery state, assigned roles, effective scopes, override reasons, audit history, and suspension controls. Each action has Use roles or Customize for this user. Inheritance displays every contributing role; customization shows the exact replacement scopes, including None. Reset deletes the override. Warn in the review diff when removing a role leaves standalone overrides in place.

Role detail shows member count, permission changes, expected revision, and the effective-access impact on members. User and role saves return actionable revision conflicts. Prevent archive while members remain and link to reassignment/removal. Capability provenance is calculated from current roles and overrides, not from a copied template version.

Replace `roles.includes("ADMIN")` throughout AppShell, dashboard, and Person/Scooter/Finance routes with capability checks. Dashboard widgets request only authorized resources. Edit, delete, upload, extraction, and download controls follow the relevant action; direct URL navigation and API checks remain authoritative.

Use DB-fresh `/auth/me` data for protected page gating and capability hydration. `meOnServer()` may remain an identity hint but must not authorize capabilities. Keep data out of shared caches. Revalidate on navigation/focus and 401/403; a shared-role change must not be missed because the user revision stayed unchanged. An admitted zero-permission user sees account settings and “No app access has been assigned,” without a sign-in loop.

`@casl/react` is optional for `<Can>`/hook-based UI rendering. Use it only if it simplifies the existing components. Do not serialize Prisma-dependent server abilities blindly into the browser: expose safe capabilities or a deliberately compatible client ability with tested condition semantics. A client-side visibility check never replaces API authorization. See [CASL React documentation](https://github.com/stalniy/casl/tree/master/packages/casl-react).

Customers land in My rentals once implemented; mixed staff/customer accounts can switch available areas only when eligibility and permissions both allow it. Mechanics land in My problems and Available problems after that workflow exists. Do not show unfinished permissions as working features.

Use existing localized catalogs, shared API fetch/CSRF behavior, theme tokens, route-private folders, accessible form/error patterns, and the sheet surface regression rule where applicable. Read current local Next.js documentation before implementation. Mobile authentication remains deferred in the existing auth roadmap; preserve shared contracts and bearer API behavior without claiming a full mobile login/portal implementation.

**13. Ordered execution batches**

| Batch                               | Deliverables and primary files                                                                                                                                                                                                                                                        | Completion gate                                                                                                                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — Close admission                 | Login status/invitations; production bootstrap; every OTP/OAuth/session admission check; approved-user backfill; remove implicit finance ADMIN promotion; protect Person login identity. Areas: schema/migrations, auth services/strategy, users, PersonsService, finance repository. | Unknown identities cannot create accounts through enabled auth methods; approved admin signs in and passes existing ADMIN/SUPER_ADMIN business guards via the transitional bridge; disabled Person identities cannot sign in; current business guards remain intact. |
| B — Role persistence and resolution | Code catalog/shared DTOs; Role, UserRole, RolePermission, UserPermissionOverride; pure per-action scope resolver; required transactional audit; role/user revisions; safe seed behavior. Areas: `packages/api-shared/src/v1/access`, `apps/api/src/access`, schema/migrations.        | No-role access, role union, narrowing/broadening overrides, explicit empty override, reset, and invalid-data denial pass the policy matrix.                                                                                                                          |
| C — CASL integration proof          | Pin package pair; generated-client wrapper; ability factory; resource-policy interfaces; test normal and transaction clients, no-grant conditions, record/query parity. Areas: access module and Prisma integration.                                                                  | Section 11 compatibility gate passes against the installed Prisma setup; no production role guards removed yet.                                                                                                                                                      |
| D — Convert current features        | Default-deny policy guard; all 62 business mappings; fresh capability contract; scoped queries/projections and nested writes; replace frontend role checks.                                                                                                                           | Every current route has a policy; current features work with explicit capabilities; stale JWT roles cannot authorize; no-grant and cross-record negative tests pass.                                                                                                 |
| E — User and role management        | Protected Users/Roles APIs/UI; impact previews; assignment/override editing; invitation delivery/retry; archive protection; Person customer eligibility action. Areas: access/users controllers, mailer, web Users/Roles routes and catalogs.                                         | Super admin can create a role, attach permissions, assign users, customize scopes, activate/suspend accounts, and inspect all changes through supported flows.                                                                                                       |
| F — Mechanic work                   | ScooterProblem API/UI; atomic claim and coordinator assignment; scoped scooter projection; initial Mechanic/Coordinator role grants.                                                                                                                                                  | One winner in claim race; no assigning others without authority; old assignee cannot modify after reassignment.                                                                                                                                                      |
| G — Customer and rental portal      | Real rental relationship and staff data source; customer DTOs/routes/pages; eligibility gate; document publication policy; complete Customer/Rental-agent role capabilities.                                                                                                          | Renter A cannot obtain renter B's records/files; portal revocation wins over every role/override source without removing staff access.                                                                                                                               |
| H — Final rollout                   | Full policy matrix, migration rehearsal, auth/domain regression, operator docs, OpenAPI/contracts, eventual removal of transitional role fields.                                                                                                                                      | Release checks below pass; bootstrap/recovery and rollback procedures are documented.                                                                                                                                                                                |

Use one executable policy matrix as the test contract for the resolver, CASL queries/objects, API responses, and representative UI behavior. Do not maintain contradictory role semantics in separate test fixtures.

A is independently deployable and must not wait for UI, repairs, or rentals. Its reviewed operator provisioning/bootstrap path supports admission until E. B and C can land additively while old guards enforce existing access. D is the enforcement cutover: deploy backend policies and capability-aware clients together, or use a staged rollout that retains the old protections. Never remove `RequireRoles` before its replacement is active.

F and G depend on new domain workflows, not just role records. Complete staff access management through E first, but do not mark the original mechanic assignment and renter visibility requirements complete until F and G are delivered. Seed initial feature roles once when their workflows arrive; do not overwrite earlier UI edits or silently add permissions to existing roles.

Each batch includes its affected tests, lint/types, contracts, and audit verification. Implementation installs the pinned CASL pair and includes additive migrations; migrations are rehearsed only on disposable local databases until an operator performs the documented rollout.

**14. Migration and deployment procedure**

1. Inventory actual users and active sessions in the target environment. Classify existing super admins, ADMIN accounts, finance associates, Person-backed users, and unclassified self-registered users. Produce a dry-run report with proposed admission/grant changes. Do not infer approval from account age, an OAuth link, or successful previous login.
2. Identify existing legacy super admins for automatic conversion. If none exist, bootstrap an operator explicitly. Verify mailbox/provider access before enforcement. Preserve the existing production account IDs and all business relationships.
3. Add tables/columns without destructive resets. New identity records default to disabled. Automatically convert untouched pre-cutover SUPER_ADMIN accounts into active designated super admins and ADMIN-only accounts into active members of the Legacy administrator role. Empty or unrecognized legacy roles stay disabled. Preserve deletion, suspension, overrides, role assignments, invitations, and any explicit post-cutover access changes.
4. Deploy admission enforcement as a coordinated release so old instances cannot still create public users. Use a short controlled maintenance/drain window if necessary. Revoke sessions for newly disabled users and invalidate stale authorization at cutover. Do not automatically admit all existing users for compatibility.
5. Run the automatic role backfill as part of `prisma migrate deploy`; do not require a manually maintained email list. SUPER_ADMIN takes precedence if both legacy strings exist. Freeze the compatibility role's permission list to the old ADMIN feature set, without new problem/rental/portal grants or protected super-admin actions. Record conversion and role creation transactionally. Preserve IDs, credentials, sessions, and business links. Seed other roles once; new catalog permissions do not automatically expand them.
6. Deploy the permission cutover with all current endpoint policies and updated clients. Verify the super-admin flow, a zero-grant admitted account, a restricted staff account, and a disabled Person-backed account before reopening normal operations.
7. Monitor denied-action counts, sign-in failures for approved users, invitation delivery failures, and session refresh errors without logging secrets. Keep actor/target/reason and permission diffs in access audit events.
8. Roll back to the admission-hardened baseline if needed, preserving schema/data and explicit allowlisting. Do not roll back to unrestricted self-registration or broad default ADMIN grants. Remove legacy role fields only after stable rollout and consumer migration.

No production default email is chosen in this plan. The operator supplies it at execution. Actual existing-account approval is a deployment input, not something inferred from this repository audit.

**15. Required tests and acceptance criteria**

| Area                      | Required scenarios                                                                                                                                                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Closed registration       | Unknown email OTP; verified Google/Apple first login; unverified OAuth email completion; disabled linked OAuth identity; disabled auth method; no new User/session/provider link after rejection                                                                                                           |
| Admission races           | Code issued before invitation cancellation/suspension/expiry; simultaneous activation/cancellation; refresh during suspension; resend after expiry; delivery failure/retry; normalized duplicate email                                                                                                     |
| Scope resolver            | No roles and no overrides deny; two roles union scopes; ALL subsumes; OWN and ASSIGNED independent; override replaces ALL with ASSIGNED and vice versa; unrelated actions still inherit                                                                                                                    |
| Empty overrides and reset | `[]` remains distinct from no row across DB, DTOs, UI, and CASL; blocks roles added later; reset restores current inheritance; role removal preserves standalone overrides and exposes that result in preview                                                                                              |
| Live roles                | Edit changes nonoverridden members on subsequent requests; overridden actions stay fixed; rename has no authority effect; seed rerun preserves UI edits; adding catalog keys never auto-grants                                                                                                             |
| Persistence and lifecycle | Duplicate memberships/action rows rejected; invalid keys/scopes rejected; role arrays normalized; role empty selection deletes row; stale user/role revision conflicts; assigned-role archive denied; assign/archive race serialized                                                                       |
| Corrupt or stale data     | Unknown permission keys deny; invalid known-action override never falls back to broader roles; missing relation denies; permission-key migration detects stale rows and cannot silently expand access                                                                                                      |
| CASL and Prisma           | Pinned versions build with custom generated client; allowed/denied lists/counts/detail; no-grant behavior; nullable assignment; relationship predicates; normal and transaction clients; resolved grants compiled without override rule-order dependence                                                   |
| Policy parity             | Actual-object checks and DB filters agree for the same resource; type-only action check cannot authorize a record; raw SQL paths retain access predicates; no query fallback drops a failed CASL condition                                                                                                 |
| Authorization defaults    | Every handler has an explicit policy; unannotated denies including super admin; anonymous versus admitted zero-grant account; profile endpoints cannot mutate status, designation, roles, or overrides                                                                                                     |
| Fresh authority           | Shared role changes with unchanged user revision; override removal; super-admin demotion; active JWT retained; suspended sessions; multi-instance requests use committed authority                                                                                                                         |
| Protected administration  | Non-super-admin cannot edit roles/assignments or self-promote; role named Super admin grants no designation; last active super admin protected under concurrent deactivation/demotion; bootstrap idempotent, A-stage bootstrap passes legacy guards, and routine startup never restores revoked privileges |
| Audit and preview         | Role/membership/override/status/customer eligibility mutations and required audit commit together; audit failure rolls back; member impact respects overrides; save rechecks authority/revisions after preview                                                                                             |
| Current feature parity    | All 62 business handlers have allowed/denied coverage; six protected finance actions remain protected; finance membership creates neither admission nor role authority                                                                                                                                     |
| Data scope and fields     | Lists, totals, search, IDs, nested children, upload completion/content, previews, selectors, and embedded DTO fields cannot escape grants; unrelated client filters intersect with authorization                                                                                                           |
| Dependencies              | Role/user edits detect missing prerequisites in effective grants; runtime denies dependent actions if prerequisites disappear; no automatic widening to repair dependencies                                                                                                                                |
| Person identity           | Creation does not enable login; deliberate existing-account linking preserves staff identity; deleted-user linking denied; contact edits do not change login or rental ownership; finance membership removal preserves unrelated access                                                                    |
| Mechanics                 | Own/other/unassigned work; single claim winner; forbidden reassignment; stale write after assignment change; ineligible target mechanic; resolved/cancelled claim denied                                                                                                                                   |
| Customers                 | Crossed renter/rental/document IDs; active/returned/cancelled rentals; unpublished documents; archived Person; disabled customer eligibility despite multiple granting roles/overrides; mixed staff access retained; no internal/KYC/financial data leaks                                                  |
| Clients                   | Source-role explanation; inherit/customize/reset; role impact preview; archive restriction; hidden controls and direct-route denial; dashboard partial access; fresh capabilities; no zero-grant redirect loop; localized errors and cookie/bearer behavior                                                |
| Existing auth regression  | Refresh concurrency/grace/replay, JWKS rotation, OAuth linking proof, logout/session revocation, deactivation, throttling and CSRF                                                                                                                                                                         |

Run shared contract tests and affected API/web suites per batch, followed by full auth/domain regression at cutover. Run lint, type checks, builds, and OpenAPI drift checks. Rehearse additive migrations and reviewed backfill on a disposable representative database; never use a destructive reset against a real environment.

The enforcement architecture follows [OWASP's authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): default deny, validate each request, and enforce resource relationships. CASL supplies the evaluator and Prisma query integration; the application remains responsible for live-role persistence, override resolution, explicit admission, transactional workflows, and audit. Keep the existing custom authentication architecture.
