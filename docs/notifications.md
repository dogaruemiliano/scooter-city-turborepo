# Notifications

The staff notifications module provides a persistent web inbox, in-app alerts,
admin activity history, and browser/PWA push while the recipient is away.
Mechanics receive changes to assigned scooter issues. TODO access is unchanged.
Staff actions appear in activity history without generating alerts for the actor.
Email and native mobile delivery remain future integrations.

## Deployment

1. Apply the additive `20261103120000_notifications` migration through the normal
   release migration command. It creates notification tables and adds Admin and
   Mechanic notification defaults without replacing existing grants or individual
   overrides. No historical audit notifications are backfilled.
2. Deploy the API, shared contracts/i18n, and web together. An old database cannot
   run the new event publishers or workers. The migration does not modify existing
   business records or authentication algorithms.
3. Configure one stable Web Push VAPID key pair on the API:

   - `NOTIFICATIONS_VAPID_PUBLIC_KEY`
   - `NOTIFICATIONS_VAPID_PRIVATE_KEY`
   - `NOTIFICATIONS_VAPID_SUBJECT`: a contact `mailto:` URI or HTTPS URL

   Generate a pair once using the installed `web-push` library's
   `generateVAPIDKeys()` function or CLI. Store the private key in the deployment's
   secret configuration. Replacing the public key requires browser subscriptions
   to be renewed. The API exposes only the public key to authenticated clients.

4. Serve the web app over HTTPS, with `/notifications-sw.js` available at the
   origin root. Enable push through **Notifications → Notification settings**.
   On iPhone/iPad, use the installed Home Screen web app. Browser permission is
   requested only after the user chooses to enable push.

All three VAPID settings can remain empty: the inbox and in-app alerts still
work, and settings accurately report that external push is unconfigured.
There is no email fallback when push is unavailable or denied.

## Delivery behavior

Business changes and their safe notification events are written in the same
database transaction. A Postgres-backed worker creates each recipient's inbox
entry and delivery work. Conditional leases coordinate multiple API instances;
unique event/recipient and notification/subscription pairs prevent duplicate rows.

The foreground app polls every five seconds while visible and focused. It sends
a presentation receipt only after the specific alert actually renders. Hidden
or limited toasts do not acknowledge delivery. A receipt from any device cancels
pending push for that notification across the user's devices. Without a receipt,
push becomes eligible after fifteen seconds. Provider/OS delivery can add delay.

Presentation, push-provider acceptance, and reading are separate. Opening a
notification or explicitly marking it read updates the shared read state.
Mark-all-read uses the returned cutoff so newer notifications remain unread.
An acknowledgement racing an already-dispatched push can produce both alerts;
the persistent inbox remains authoritative.

Every actual Web Push displays a visible system notification. Foreground
suppression happens on the server before dispatch, not silently in the service
worker. The service worker safely opens the authenticated inbox, which checks
current permissions before presenting the target.

Push destinations are tied to the authenticated account and session. Logout,
session revocation, expired refresh credentials, and account switching stop
delivery. An existing consented subscription is rebound when the same account
starts a new session, without prompting for browser permission again.

## Access and privacy

- `notifications.receive` supports `ALL` business activity or `ASSIGNED` issues.
  It never grants access to the source records.
- `notifications.activity.read` grants access to the admin activity view;
  source-specific permissions still filter every row and unread count.
- Event-time assignment recipients prevent an old comment from being delivered
  to a mechanic assigned later. Current access is checked again at dispatch,
  inbox read, and push delivery.
- Removed assignees receive only a generic removal notice, without the actor,
  subject name, scooter, or working task link.
- Company/finance configuration events from super-admin-only surfaces remain
  visible only to current super admins.
- Event payloads contain selected names, brand-qualified scooter summaries and
  changed field names. Raw identity documents, contact diffs, comments, access
  payloads, push endpoints, and provider response bodies are not exposed in feeds
  or worker diagnostics.

## Operations and recovery

The worker runs on the API's existing scheduler. It reclaims expired leases and
uses bounded retry/backoff for event fanout and retryable push failures. Terminal
provider `404`/`410` responses revoke expired subscriptions. Pending work is
rechecked against preferences, current source access and session ownership.

Super admins can inspect exhausted work through
`GET /v1/notifications/processing`. The response contains event/delivery IDs,
attempt counts and redacted error codes. Recovery endpoints are:

- `POST /v1/notifications/processing/events/:id/retry`
- `POST /v1/notifications/processing/deliveries/:id/retry`

Both accept an empty JSON object, follow the normal authentication/CSRF rules,
and reject retries while a lease is active. Replaying an event preserves existing
inbox entries. An external provider may already have accepted a request whose
acknowledgement was lost; notification IDs/tags reduce duplicate system alerts.

There is no automatic notification-history purge in the initial release. Choose
an explicit retention policy before introducing deletion; audit retention remains
independent. Push retries are bounded and stale alerts are cancelled rather than
delivered indefinitely.

## Verification

The PostgreSQL regression suite is opt-in:
`apps/api/test/notifications.e2e-spec.ts`. Set `DATABASE_URL` and
`NOTIFICATIONS_TEST_DATABASE_URL` to the same explicitly named local disposable
`scooter_notifications_test_*` database, apply migrations, then run that file with
the existing E2E Jest configuration. The suite mocks outbound push; it never sends
real notifications or uses the development application database.

Before production rollout, verify a real browser subscription with deployed
VAPID credentials: active-app receipt suppression, hidden/closed-app push,
notification click, denied permission, logout/account switching, and an expired
subscription. Fixtures and unit tests cannot prove external provider or OS delivery.

The original product decisions and architecture are recorded in the
[implementation plan](plan/notifications.md).
