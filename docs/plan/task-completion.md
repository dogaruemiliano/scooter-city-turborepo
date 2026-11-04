# Task completion and assignee reminders

Status: implemented on 2026-11-04. The permission migration is included and was verified in a disposable PostgreSQL database. It has not been applied to the application database.

## Previous behavior

Todos and scooter issues share the problem workflow. The normal UI requires at least one assignee before starting work, then offers completion from In progress with mandatory resolution notes. The API permits completion from Open or In progress and does not independently require an assignee for callers with complete-all permission. Resolution notes are mandatory in the shared request schema.

The default mechanic role can claim unassigned issues and update or complete assigned issues. It cannot create issues or assign users. Creation does not automatically assign the reporter. Standalone Todos are currently restricted to admins and superadmins.

## Admin completion from lists

- Add an admin completion action to Todo and scooter-issue list items. Swiping opens the completion bottom sheet; completing the gesture alone does not submit.
- Keep list entry swipe-only. The normal task link leads keyboard and desktop users to completion on the detail screen.
- Let admins submit with an optional completion note. Keep notes mandatory for mechanics, enforced by the API rather than only by the form.
- Reuse the completion form, shared bottom sheet, SaveButton, and localized action feedback. Keep request state responsible for pending, success, and failure.
- Preserve existing assignees and record the actual completing admin in the audit/activity history. Do not fabricate a note when the input is empty.
- Preserve revision checks, permission checks, and automatic clearing of only the completed issue's maintenance hold.
- Admins can complete directly from Open and without an assignee. Executing this plan confirmed the proposed bypass of assignment/Start work.

## Mechanic creates an issue assigned to themselves

- Allow a mechanic to create a scooter issue and automatically assign that mechanic in the same server transaction.
- Keep reporter and assignee identities distinct, even when they are the same user.
- Grant creation capability through the existing permission model without granting general assignment or complete-all permission. Plan an explicit update path for existing mechanic roles; changing initial seed defaults alone does not update roles already in use.
- Reject attempts by a mechanic to choose another assignee through a crafted request. Self-assignment must be a server-enforced creation behavior.
- Preserve existing scooter visibility; any broader fleet selection needs a separate access decision.
- Continue enforcing assigned-only completion at the API, including reassignment during an open session and tasks with multiple assignees. Creating a task does not grant completion access after the creator is removed from its assignees.
- Preserve the normal Start work and required completion-note steps for mechanics.
- This mechanic creation change covers scooter issues. Standalone Todo access remains a separate scope decision.

## Admin reminders from assignee cards

- Place a bell icon button on the right of each assignee card in the task assignment section, using the existing shared card action slot and Button.
- Show it only to admins/superadmins who can access and manage the task. The API independently authorizes the actor, verifies the current assignee, and rejects reminders for closed tasks or removed/ineligible assignees.
- Clicking the bell sends a reminder to that assignee through the existing notification system, with the task title and a link to its details. Scooter identifiers, when included, use the shared brand-code format.
- Target only the selected assignee; do not broadcast the reminder to other admins or assignees.
- Enforce at most one accepted reminder per assignee every 60 seconds, shared across admins and tasks, so multiple operators cannot flood the same person. Enforce it atomically in shared server storage, including across API instances and concurrent requests.
- Return the next permitted send time/retry delay. Disable repeated clicks while pending and during cooldown, and expose localized accessible labels and feedback for sending, sent, cooldown, and failure.
- A client timer is presentation only. Reloading the page, opening another tab, or calling the endpoint directly must not bypass the cooldown. Store cooldown state with the durable notification event so a failed enqueue does not consume the minute.
- Record who requested the reminder, its recipient, and its task. Confirm that the existing notification preference and recipient-access policies apply; do not invent a separate delivery channel.

## Todo terminology correction

- Use Todo/task wording in English and Romanian for board labels, empty states, scroll controls, availability filters, and description/completion placeholders.
- Give Todo checklist and buy-list fields task-appropriate examples.
- Preserve repair-specific wording for scooter issues. Keep translations in @repo/i18n and continue using the shared components and theme tokens.

## Validation when implementing workflows and reminders

- Mechanic can create an issue that immediately appears in their assigned work, without being allowed to assign another user.
- Mechanic cannot complete another person's task, an unassigned task, or a task reassigned away from them. Any current assignee can complete a task with multiple assignees.
- Admin swipe and keyboard actions open the same sheet, handle optional notes, block duplicate submissions, preserve drafts on failure, and recover from stale revisions.
- Reminder reaches only the selected current assignee. Test unauthorized/direct API calls, closed work, removed assignees, concurrent requests from different admins, reloads, notification enqueue failure, and a send after the minute expires.
- Verify English/Romanian copy, accessible bell labels and feedback, keyboard operation, and mobile/desktop layouts. Add bottom-sheet surface regression coverage for sheets changed by the workflow work.

## Implementation and verification

- `ProblemCompletion` owns the completion request, controlled submission feedback, draft preservation, and recovery after stale or uncertain outcomes. List and detail entry points use it. Admin notes are optional; non-admin completion requires current assignment and nonempty notes in the API.
- Shared `SwipeAction` uses theme gesture thresholds and has Storybook examples. The list is swipe-only; the visible double-check completion button was removed at the user’s request. Keyboard users can complete from task details. A swipe requests confirmation rather than submitting immediately.
- The creation endpoint assigns workers who lack general assignment permission to themselves. The form displays their default assignment. `GET /v1/problems/creation-scooters` supplies only scooters permitted by the existing scooter-read scope; creation prerequisites now accept assigned read scopes without requiring full fleet access.
- Migration `20261104120000_mechanic_issue_creation` grants creation to existing active mechanic roles only when no explicit creation grant/restriction exists. It increments affected role/user access revisions and records the role change. Per-user overrides remain authoritative.
- Reminder endpoints check admin and assignment permissions, current revision, current assignee, account eligibility, and notification access. A recipient-wide PostgreSQL transaction lock, explicit Read committed isolation, database timestamps, and the existing notification outbox enforce the rolling minute across admins, tasks, and API instances. An enqueue failure rolls back the cooldown. Delivery still respects the existing inbox/push policies.
- English and Romanian strings cover the new actions, cooldown feedback, worker note validation, and corrected Todo terminology. The bell uses the existing assignee-card action slot and shared SaveButton presentation.

Verification:

- 158 affected web tests pass, including the authorized mechanic picker, admin/worker completion, pending/conflict recovery, swipe gestures, and reminder cooldown.
- 187 API unit tests, 17 shared-contract tests, and 22 localization tests pass.
- 16 focused PostgreSQL integration checks pass, including concurrent sends from different admins/tasks, expiry, enqueue rollback, self-assignment/reassignment, and migration preservation of explicit restrictions.
- Web, API, UI, and theme type checks pass. Targeted lint and the shared UI Storybook build pass.
- Browser plugin unavailable; regular Playwright verified the real components in an isolated preview with mocked API/session data. Desktop and mobile checks cover touch-swipe entry and detail completion, the optional-note completion sheet, successful completion, the right-side reminder bell, and disabled cooldown. Screenshots show the shared sheet surface, no horizontal overflow, and no browser errors. No real reminder notifications were sent.
- The broader PostgreSQL suite has three existing rental checks that fail with its rental fixture; the fixture lacks the documents required by current rental readiness rules. Those checks were excluded from the focused task run. Rental behavior was not changed.

Apply the included migration through the normal release process before relying on creation access for existing mechanic accounts.

Swipe follow-up: the card follows the pointer without a transition while dragging, captures the pointer once after horizontal intent, and animates only the return. The green reveal is a separate rectangle with all four corners rounded and a theme-sized gap from the card.

Follow-up validation: 53 focused swipe/list tests, web/UI type checks, targeted lint, and the Storybook build pass. The supplied screen recording was inspected. Desktop and mobile browser checks sampled slow touch movement and verified direct pointer tracking, four rounded corners, the gap between surfaces, and confirmation opening without submission.
