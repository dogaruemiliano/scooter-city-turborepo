export const MAINTENANCE_DUE_SOON_KM = 300;
export const MAINTENANCE_DUE_SOON_DAYS = 30;

const MILLISECONDS_PER_DAY = 86_400_000;

export type MaintenanceStatus = "OK" | "DUE_SOON" | "OVERDUE" | "UNKNOWN";

export interface MaintenanceStatusInput {
  currentMileageKm: number | null;
  nextDueKm: number | null;
  nextDueAt: Date | null;
  now: Date;
}

export interface CalculateNextDeadlinesInput {
  performedKm: number;
  performedAt: Date;
  intervalKm: number | null;
  intervalMonths: number | null;
  nextDueKm?: number | null;
  nextDueAt?: Date | null;
}

export interface CalculatedNextDeadlines {
  nextDueKm: number | null;
  nextDueAt: Date | null;
}

const STATUS_PRIORITY: Record<MaintenanceStatus, number> = {
  UNKNOWN: 0,
  OK: 1,
  DUE_SOON: 2,
  OVERDUE: 3,
};

/**
 * Calculates the current state of one maintenance type from its stored
 * deadlines. Mileage and calendar deadlines are evaluated independently; the
 * most urgent usable result wins. Missing current mileage only disables the
 * mileage branch, so a date deadline can still produce a meaningful status.
 */
export function calculateMaintenanceStatus({
  currentMileageKm,
  nextDueKm,
  nextDueAt,
  now,
}: MaintenanceStatusInput): MaintenanceStatus {
  const statuses: MaintenanceStatus[] = [];

  if (currentMileageKm !== null && nextDueKm !== null) {
    const remainingKm = nextDueKm - currentMileageKm;
    statuses.push(
      remainingKm <= 0
        ? "OVERDUE"
        : remainingKm <= MAINTENANCE_DUE_SOON_KM
          ? "DUE_SOON"
          : "OK",
    );
  }

  if (nextDueAt !== null) {
    const remainingDays = utcCalendarDayDifference(now, nextDueAt);
    statuses.push(
      remainingDays <= 0
        ? "OVERDUE"
        : remainingDays <= MAINTENANCE_DUE_SOON_DAYS
          ? "DUE_SOON"
          : "OK",
    );
  }

  if (statuses.length === 0) {
    return "UNKNOWN";
  }

  return statuses.reduce((mostUrgent, status) =>
    STATUS_PRIORITY[status] > STATUS_PRIORITY[mostUrgent] ? status : mostUrgent,
  );
}

/** Returns the default mileage deadline without mutating historical records. */
export function calculateDefaultNextDueKm(
  performedKm: number,
  intervalKm: number | null,
): number | null {
  return intervalKm === null ? null : performedKm + intervalKm;
}

/**
 * Adds calendar months using UTC date-only semantics and clamps end-of-month
 * values. For example, January 31 plus one month becomes February 28 or 29.
 */
export function addCalendarMonthsClamped(
  performedAt: Date,
  intervalMonths: number | null,
): Date | null {
  if (intervalMonths === null) {
    return null;
  }

  const sourceYear = performedAt.getUTCFullYear();
  const sourceMonth = performedAt.getUTCMonth();
  const sourceDay = performedAt.getUTCDate();
  const targetMonthIndex = sourceYear * 12 + sourceMonth + intervalMonths;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastTargetDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(targetYear, targetMonth, Math.min(sourceDay, lastTargetDay)),
  );
}

/**
 * Copies default intervals into a new record while allowing explicit client
 * deadlines—including explicit nulls—to take precedence.
 */
export function calculateNextDeadlines({
  performedKm,
  performedAt,
  intervalKm,
  intervalMonths,
  nextDueKm,
  nextDueAt,
}: CalculateNextDeadlinesInput): CalculatedNextDeadlines {
  return {
    nextDueKm:
      nextDueKm !== undefined
        ? nextDueKm
        : calculateDefaultNextDueKm(performedKm, intervalKm),
    nextDueAt:
      nextDueAt !== undefined
        ? cloneNullableDate(nextDueAt)
        : addCalendarMonthsClamped(performedAt, intervalMonths),
  };
}

function utcCalendarDayDifference(from: Date, to: Date): number {
  return (utcDayValue(to) - utcDayValue(from)) / MILLISECONDS_PER_DAY;
}

function utcDayValue(value: Date): number {
  return Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  );
}

function cloneNullableDate(value: Date | null): Date | null {
  return value === null ? null : new Date(value.getTime());
}
