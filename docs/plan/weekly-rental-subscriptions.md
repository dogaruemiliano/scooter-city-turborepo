# Weekly rental creation and subscription follow-up

The first delivery adds a two-step rental wizard at `/rentals/new`: select a
person, select a scooter, and choose a start date; then review the first weekly
period and optional customer/internal notes before creating the rental.

The existing rental API records **only the initial week**. Creation makes a
reservation; handover is still a separate action. No automatic renewal or
payment collection is implied. The first period starts at midnight in the
operator's browser timezone and ends at the same local time seven calendar
days later. Its absolute timestamps and timezone are retained in the draft,
including across daylight-saving changes and browser reopening.

Rental drafts are versioned and scoped to the signed-in operator in local
browser storage. They preserve incomplete dates, selections, notes and the
current step. They do not hold or reserve scooters. Availability, permissions
and maintenance restrictions remain server-validated at creation. A pending
or uncertain create outcome is retained across refresh and blocks a second
submission; the operator must inspect the rental list and explicitly confirm that
no rental was created before enabling another attempt.

Adding a person saves the rental draft before opening the existing person form.
Both person forms return to the specific originating draft after successful
creation. Only the saved person's ID is linked to it. Cancelling person creation
returns to the rental wizard; person-form contents are not persisted by the
rental draft. Discarding a rental draft never deletes a person.

## Follow-up work

- [ ] Introduce an ongoing subscription lifecycle distinct from individual weekly
      rental periods. A weekly boundary is a renewal checkpoint, not automatic
      cancellation of the subscription or release of its scooter.
- [ ] Define a company timezone and period-boundary policy rather than relying on
      the operator's browser timezone.
- [ ] Notify the renter 48 hours before the current weekly period ends.
- [ ] Let the renter explicitly continue or stop, including staff recording a
      continuation communicated at the office.
- [ ] Create subsequent weekly periods with auditable renewal decisions, conflict
      handling and idempotency.
- [ ] Offer online payment for continuation.
- [ ] Record cash or card payment at the office and reconcile it with the financial
      ledger.
- [ ] Define reminders, overdue payment behavior, missing responses, failed
      payments, cancellation and the return/handover relationship.

Browser drafts are intentionally local to one browser and operator. This delivery
does not add person drafts, cross-device draft synchronization, payment fields,
schedulers, notifications or a recurring billing integration.
