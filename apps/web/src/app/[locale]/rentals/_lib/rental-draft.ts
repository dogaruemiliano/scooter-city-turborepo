import { v1 } from "@repo/api-shared";
import { buildDateOnly, type DateParts } from "@repo/ui/lib/date-parts";

export type WeeklyPeriod = {
  startsAt: string;
  endsAt: string;
  timeZone: string;
};
export type RentalDraft = {
  version: 1;
  id: string;
  step: "details" | "review";
  detailsCompleted: boolean;
  inputTouched?: boolean;
  conclusionContext?: "on_site" | "distance" | "off_premises";
  promotion?: "standard" | "three_plus_one";
  rentalPaymentMethod?: "cash" | "transfer" | "card";
  depositPaymentMethod?: "cash" | "transfer" | "card";
  driverPersonIds?: string[];
  renterDrives?: boolean;
  personId: string;
  scooterId: string;
  startDate: DateParts;
  period: WeeklyPeriod | null;
  customerNotes: string;
  internalNotes: string;
  submissionUncertain: boolean;
  createdRentalId: string | null;
};

export const rentalDraftKey = (userId: string) => `rental-create:v1:${userId}`;

export function emptyRentalDraft(): RentalDraft {
  const [year, month, day] = v1.rentals.rentalDateOnly(new Date()).split("-");
  const startDate: DateParts = { day: day!, month: month!, year: year! };
  return {
    version: 1,
    id: crypto.randomUUID(),
    step: "details",
    detailsCompleted: false,
    personId: "",
    scooterId: "",
    startDate,
    period: weeklyPeriod(startDate),
    customerNotes: "",
    internalNotes: "",
    submissionUncertain: false,
    createdRentalId: null,
  };
}

/** Only user input counts; navigation and validation do not create a draft. */
export function hasRentalDraftInput(draft: RentalDraft): boolean {
  return [
    draft.personId,
    draft.scooterId,
    draft.startDate.day,
    draft.startDate.month,
    draft.startDate.year,
    draft.customerNotes,
    draft.internalNotes,
  ].some((value) => value.trim().length > 0);
}

/** Explicit input is autosaved on every step; navigation alone creates no draft. */
export function canPersistRentalDraft(draft: RentalDraft): boolean {
  return Boolean(
    ((draft.detailsCompleted || draft.inputTouched) &&
      hasRentalDraftInput(draft)) ||
    draft.submissionUncertain ||
    draft.createdRentalId,
  );
}

/** Seven local calendar days, including weeks that cross a DST boundary. */
export function weeklyPeriod(
  parts: DateParts,
  days: 7 | 28 = 7,
): WeeklyPeriod | null {
  const date = buildDateOnly(parts).value;
  if (!date) return null;
  const start = v1.rentals.rentalDateStart(date);
  const end = v1.rentals.addRentalCalendar(start, days);
  return {
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    timeZone: v1.rentals.RENTAL_POLICY.timezone,
  };
}

/** Storage is untrusted; do not restore old formats or malformed drafts. */
export function readRentalDraft(userId: string): RentalDraft | null {
  const raw = localStorage.getItem(rentalDraftKey(userId));
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (
      !d ||
      d.version !== 1 ||
      typeof d.id !== "string" ||
      !d.id ||
      !["details", "review"].includes(d.step) ||
      ![d.personId, d.scooterId, d.customerNotes, d.internalNotes].every(
        (v) => typeof v === "string",
      ) ||
      !d.startDate ||
      ![d.startDate.day, d.startDate.month, d.startDate.year].every(
        (v) => typeof v === "string",
      ) ||
      (d.inputTouched !== undefined && typeof d.inputTouched !== "boolean") ||
      (d.detailsCompleted !== undefined &&
        typeof d.detailsCompleted !== "boolean") ||
      (d.conclusionContext !== undefined &&
        !["on_site", "distance", "off_premises"].includes(
          d.conclusionContext,
        )) ||
      (d.promotion !== undefined &&
        !["standard", "three_plus_one"].includes(d.promotion)) ||
      (d.rentalPaymentMethod !== undefined &&
        !["cash", "transfer", "card"].includes(d.rentalPaymentMethod)) ||
      (d.depositPaymentMethod !== undefined &&
        !["cash", "transfer", "card"].includes(d.depositPaymentMethod)) ||
      (d.renterDrives !== undefined && typeof d.renterDrives !== "boolean") ||
      (d.driverPersonIds !== undefined &&
        (!Array.isArray(d.driverPersonIds) ||
          !d.driverPersonIds.every(
            (value: unknown) => typeof value === "string",
          ))) ||
      typeof d.submissionUncertain !== "boolean" ||
      !(d.createdRentalId === null || typeof d.createdRentalId === "string")
    )
      return null;
    if (d.period !== null) {
      const p = d.period;
      if (
        !p ||
        typeof p.startsAt !== "string" ||
        typeof p.endsAt !== "string" ||
        !Number.isFinite(Date.parse(p.startsAt)) ||
        !Number.isFinite(Date.parse(p.endsAt)) ||
        Date.parse(p.endsAt) <= Date.parse(p.startsAt) ||
        typeof p.timeZone !== "string"
      )
        return null;
      // Also verifies the stored IANA timezone before it reaches a formatter.
      new Intl.DateTimeFormat("en", { timeZone: p.timeZone }).format();
    }
    return {
      ...d,
      // Older review drafts have demonstrably passed details. Older first-step
      // drafts have no such evidence and are no longer eligible for resuming.
      detailsCompleted: d.detailsCompleted ?? d.step === "review",
    } as RentalDraft;
  } catch {
    return null;
  }
}

export function writeRentalDraft(userId: string, draft: RentalDraft) {
  if (!canPersistRentalDraft(draft)) {
    removeRentalDraft(userId, draft.id);
    return;
  }
  localStorage.setItem(rentalDraftKey(userId), JSON.stringify(draft));
}

export function removeRentalDraft(userId: string, draftId: string) {
  // Never delete another draft created while this page was open.
  if (readRentalDraft(userId)?.id === draftId)
    localStorage.removeItem(rentalDraftKey(userId));
}

/** Only link a newly saved person to the exact draft that opened their form. */
export function attachRentalPerson(
  userId: string,
  draftId: string,
  personId: string,
) {
  const draft = readRentalDraft(userId);
  if (!draft || draft.id !== draftId || draft.createdRentalId) return;
  writeRentalDraft(userId, { ...draft, personId, step: "details" });
}
