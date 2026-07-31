import { v1 } from "@repo/api-shared";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1_000;

export interface FinancePeriod {
  fromDate: string;
  toDate: string;
  query: v1.finance.FinanceSummaryQuery;
  usedFallback: boolean;
}

export function resolveFinancePeriod(
  searchParams: Record<string, string | string[] | undefined>,
  now = new Date(),
): FinancePeriod {
  const defaultPeriod = defaultFinancePeriod(now);
  const rawFrom = firstSearchParam(searchParams.from);
  const rawTo = firstSearchParam(searchParams.to);
  const fromDate = validDateOnly(rawFrom) ?? defaultPeriod.fromDate;
  const toDate = validDateOnly(rawTo) ?? defaultPeriod.toDate;
  const candidate = financePeriodFromDateOnly(fromDate, toDate);

  if (
    candidate &&
    (rawFrom === undefined || validDateOnly(rawFrom)) &&
    (rawTo === undefined || validDateOnly(rawTo))
  ) {
    return candidate;
  }

  return {
    ...defaultPeriod,
    usedFallback: rawFrom !== undefined || rawTo !== undefined,
  };
}

export function financePeriodFromDateOnly(
  fromDate: string,
  toDate: string,
): FinancePeriod | null {
  if (!validDateOnly(fromDate) || !validDateOnly(toDate)) {
    return null;
  }

  const fromInstant = Date.parse(`${fromDate}T00:00:00.000Z`);
  const inclusiveToInstant = Date.parse(`${toDate}T00:00:00.000Z`);
  const queryResult = v1.finance.financeSummaryQuerySchema.safeParse({
    from: new Date(fromInstant).toISOString(),
    to: new Date(inclusiveToInstant + DAY_MS).toISOString(),
  });

  return queryResult.success
    ? {
        fromDate,
        toDate,
        query: queryResult.data,
        usedFallback: false,
      }
    : null;
}

function defaultFinancePeriod(now: Date): FinancePeriod {
  const safeNow = Number.isNaN(now.getTime()) ? new Date(0) : now;
  const fromDate = formatDateOnly(
    new Date(Date.UTC(safeNow.getUTCFullYear(), safeNow.getUTCMonth(), 1)),
  );
  const toDate = formatDateOnly(safeNow);
  const period = financePeriodFromDateOnly(fromDate, toDate);

  if (!period) {
    throw new Error("The default finance period must be valid.");
  }

  return period;
}

function validDateOnly(value: string | undefined): string | null {
  if (!value || !DATE_ONLY_PATTERN.test(value)) {
    return null;
  }

  const instant = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(instant)) {
    return null;
  }

  return formatDateOnly(new Date(instant)) === value ? value : null;
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function firstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
