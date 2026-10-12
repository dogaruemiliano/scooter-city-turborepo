import { v1 } from "@repo/api-shared";

export type FinanceSearchParams = Record<string, string | string[] | undefined>;

// The API's integer offset must remain in range even for hand-edited URLs.
const MAX_OPERATION_OFFSET = 2_147_483_647;

export const OPERATION_FILTER_KEYS = [
  "bookId",
  "bookType",
  "kind",
  "status",
  "treatment",
  "from",
  "to",
] as const;

export type OperationFilters = Record<
  (typeof OPERATION_FILTER_KEYS)[number],
  string
>;

export function defaultOperationFilters(
  fixedKind?: v1.finance.FinancialOperationKind,
): OperationFilters {
  return {
    bookId: "",
    bookType: "",
    kind: fixedKind ?? "",
    status: "",
    treatment: "",
    from: "",
    to: "",
  };
}

export function financeSearchParams(
  values: FinanceSearchParams,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value))
      value.forEach((entry) => params.append(key, entry));
    else if (value !== undefined) params.set(key, value);
  }
  return params;
}

/** Validate each known parameter without throwing away other valid filters. */
export function readOperationQuery(
  search: URLSearchParams,
  pageSize: number,
  fixedKind?: v1.finance.FinancialOperationKind,
) {
  const shape = v1.finance.listFinancialOperationsQuerySchema.shape;
  const filters = defaultOperationFilters(fixedKind);
  for (const key of OPERATION_FILTER_KEYS) {
    const parsed = shape[key].safeParse(search.get(key) || undefined);
    if (parsed.success && parsed.data) filters[key] = parsed.data;
  }
  if (fixedKind) filters.kind = fixedKind;
  // These are alternative API selectors; an explicit book takes precedence.
  if (filters.bookId) filters.bookType = "";
  const parsedPage = shape.page.safeParse(search.get("page") || undefined);
  const page =
    parsedPage.success &&
    Number.isSafeInteger(parsedPage.data) &&
    (parsedPage.data - 1) * pageSize <= MAX_OPERATION_OFFSET
      ? parsedPage.data
      : 1;
  const apiQuery = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  for (const key of OPERATION_FILTER_KEYS) {
    if (filters[key]) apiQuery.set(key, filters[key]);
  }
  return { filters, page, apiQuery };
}

export function updateOperationFilter(
  filters: OperationFilters,
  key: keyof OperationFilters,
  value: string,
): OperationFilters {
  return {
    ...filters,
    [key]: value,
    ...(key === "bookId" && value ? { bookType: "" } : {}),
    ...(key === "bookType" && value ? { bookId: "" } : {}),
  };
}

/** Keeps route context while replacing editable filters and resetting paging. */
export function operationListHref(
  pathname: string,
  search: URLSearchParams,
  filters: OperationFilters,
  page = 1,
  fixedKind?: v1.finance.FinancialOperationKind,
): string {
  const query = new URLSearchParams(search);
  for (const key of OPERATION_FILTER_KEYS) {
    const value = key === "kind" && fixedKind ? fixedKind : filters[key];
    if (value) query.set(key, value);
    else query.delete(key);
  }
  query.delete("pageSize");
  if (page > 1) query.set("page", String(page));
  else query.delete("page");
  const serialized = query.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

export function operationFilterCount(
  filters: OperationFilters,
  fixedKind?: v1.finance.FinancialOperationKind,
) {
  return OPERATION_FILTER_KEYS.filter(
    (key) => filters[key] && !(key === "kind" && fixedKind),
  ).length;
}

export function validOperationFilterRange(filters: OperationFilters): boolean {
  if (!filters.from || !filters.to) return true;
  return Date.parse(filters.from) < Date.parse(filters.to);
}

/** The filter inputs explicitly use UTC, matching timestamps in query URLs. */
export function operationTimestampInput(value: string): string {
  return value ? new Date(value).toISOString().slice(0, -1) : "";
}

export function operationTimestampValue(value: string): string {
  if (!value) return "";
  const date = new Date(`${value}Z`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
