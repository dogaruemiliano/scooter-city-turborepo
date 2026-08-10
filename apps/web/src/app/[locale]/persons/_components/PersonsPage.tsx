"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  buttonVariants,
  CountrySheetSelect,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components";
import { UserPlusIcon } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { InfiniteListFooter } from "@/components/InfiniteListFooter";
import { ListFilterSheet } from "@/components/ListFilterSheet";
import { ListSearchInput } from "@/components/ListSearchInput";
import { ListSortSelect } from "@/components/ListSortSelect";
import { webApi } from "@/lib/api";
import { PersonList } from "./PersonList";
import { DatePartsField } from "@/components/DateField";

interface PersonsPageProps {
  createHref: string;
  initialList: v1.persons.PersonList;
  initialQuery: v1.persons.ListPersonsQuery;
}

interface Feedback {
  kind: "error";
  title: string;
  message: string;
}

const LIST_PAGE_SIZE = 25;
const ALL_FILTERS = "all";
const SEARCH_DEBOUNCE_MS = 500;

export function PersonsPage({
  createHref,
  initialList,
  initialQuery,
}: PersonsPageProps) {
  return (
    <PersonsPageContent
      key={personsPageStateKey(initialQuery, initialList)}
      createHref={createHref}
      initialList={initialList}
      initialQuery={initialQuery}
    />
  );
}

function PersonsPageContent({
  createHref,
  initialList,
  initialQuery,
}: PersonsPageProps) {
  const t = useTranslations("persons");
  const locale = useLocale();
  const [list, setList] = useState(initialList);
  const [query, setQuery] = useState<v1.persons.ListPersonsQuery>(initialQuery);
  const [draftQuery, setDraftQuery] =
    useState<v1.persons.ListPersonsQuery>(initialQuery);
  const [listLoading, setListLoading] = useState(false);
  const [appendLoading, setAppendLoading] = useState(false);
  const [appendError, setAppendError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const requestIdRef = useRef(0);
  const appendLoadingRef = useRef(false);
  const searchDebounceReadyRef = useRef(false);
  const searchDebounceTimeoutRef = useRef<number | null>(null);

  const clearSearchDebounce = useCallback(() => {
    if (searchDebounceTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(searchDebounceTimeoutRef.current);
    searchDebounceTimeoutRef.current = null;
  }, []);

  const loadPersons = useCallback(
    async (
      nextQuery: v1.persons.ListPersonsQuery,
      options: {
        clearFeedback?: boolean;
        history?: "push" | "replace";
        preserveDraft?: boolean;
      } = {},
    ) => {
      const parsedQuery = v1.persons.listPersonsQuerySchema.parse({
        ...nextQuery,
        page: 1,
        pageSize: LIST_PAGE_SIZE,
      });
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      appendLoadingRef.current = false;
      setListLoading(true);
      setAppendLoading(false);
      setAppendError(null);
      if (options.clearFeedback !== false) {
        setFeedback(null);
      }

      try {
        const nextList = await webApi.fetch(
          personsListPath(parsedQuery),
          v1.persons.personListSchema,
          { cache: "no-store" },
        );

        if (requestId !== requestIdRef.current) {
          return;
        }

        updatePersonsUrl(parsedQuery, options.history ?? "push");
        setList(nextList);
        setQuery(parsedQuery);
        if (!options.preserveDraft) {
          setDraftQuery(parsedQuery);
        }
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setFeedback({
          kind: "error",
          title: t("feedback.listErrorTitle"),
          message:
            error instanceof ApiError
              ? error.message
              : t("feedback.genericError"),
        });
      } finally {
        if (requestId === requestIdRef.current) {
          setListLoading(false);
        }
      }
    },
    [t],
  );

  const loadNextPersonsPage = useCallback(async () => {
    if (
      appendLoadingRef.current ||
      listLoading ||
      list.items.length >= list.total
    ) {
      return;
    }

    const nextQuery = v1.persons.listPersonsQuerySchema.parse({
      ...query,
      page: list.page + 1,
      pageSize: LIST_PAGE_SIZE,
    });
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    appendLoadingRef.current = true;
    setAppendLoading(true);
    setAppendError(null);

    try {
      const nextList = await webApi.fetch(
        personsListPath(nextQuery),
        v1.persons.personListSchema,
        { cache: "no-store" },
      );

      if (requestId !== requestIdRef.current) {
        return;
      }

      setList((current) => ({
        ...nextList,
        items: [...current.items, ...nextList.items],
      }));
      setQuery(nextQuery);
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setAppendError(
        error instanceof ApiError ? error.message : t("feedback.genericError"),
      );
    } finally {
      if (requestId === requestIdRef.current) {
        appendLoadingRef.current = false;
        setAppendLoading(false);
      }
    }
  }, [list.items.length, list.page, list.total, listLoading, query, t]);

  useEffect(() => {
    if (!searchDebounceReadyRef.current) {
      searchDebounceReadyRef.current = true;
      return;
    }

    if (draftQuery.search === query.search) {
      return;
    }

    clearSearchDebounce();
    const delay = draftQuery.search ? SEARCH_DEBOUNCE_MS : 0;
    const timeoutId = window.setTimeout(() => {
      searchDebounceTimeoutRef.current = null;
      void loadPersons(
        {
          ...query,
          search: draftQuery.search,
          sort:
            query.sort === "relevance" && !draftQuery.search
              ? undefined
              : query.sort,
          page: 1,
          pageSize: LIST_PAGE_SIZE,
        },
        { history: "replace", preserveDraft: true },
      );
    }, delay);
    searchDebounceTimeoutRef.current = timeoutId;

    return () => {
      window.clearTimeout(timeoutId);
      if (searchDebounceTimeoutRef.current === timeoutId) {
        searchDebounceTimeoutRef.current = null;
      }
    };
  }, [clearSearchDebounce, draftQuery.search, loadPersons, query]);

  async function searchPersons() {
    clearSearchDebounce();
    const search = normalizedSearch(draftQuery.search);
    if (search === normalizedSearch(query.search)) return;

    await loadPersons({
      ...draftQuery,
      search: search || undefined,
      page: 1,
      pageSize: LIST_PAGE_SIZE,
    });
  }

  async function clearPersonsSearch() {
    clearSearchDebounce();
    setDraftQuery((current) => ({
      ...current,
      search: undefined,
      sort: current.sort === "relevance" ? undefined : current.sort,
    }));

    if (!query.search) return;
    await loadPersons(
      {
        ...query,
        search: undefined,
        sort: query.sort === "relevance" ? undefined : query.sort,
        page: 1,
        pageSize: LIST_PAGE_SIZE,
      },
      { history: "replace" },
    );
  }

  async function changeSort(value: string | null) {
    if (!value) {
      return;
    }

    clearSearchDebounce();
    const sort = value as v1.persons.PersonListSort;
    const nextQuery = {
      ...draftQuery,
      page: 1,
      pageSize: LIST_PAGE_SIZE,
      sort: isDefaultSort(draftQuery, sort) ? undefined : sort,
    };

    setDraftQuery(nextQuery);
    await loadPersons(nextQuery);
  }

  async function resetFilters() {
    clearSearchDebounce();
    await loadPersons({
      page: 1,
      pageSize: LIST_PAGE_SIZE,
      includeDeleted: false,
    });
  }

  function setDraftValue<Key extends keyof v1.persons.ListPersonsQuery>(
    key: Key,
    value: v1.persons.ListPersonsQuery[Key],
  ) {
    setDraftQuery((current) => ({
      ...current,
      [key]: value,
    }));
  }

  const hasMore = list.items.length < list.total;

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex justify-end">
        <Link href={createHref} className={buttonVariants()}>
          <UserPlusIcon data-icon="inline-start" />
          {t("actions.add")}
        </Link>
      </div>

      {feedback ? (
        <Alert variant="destructive">
          <AlertTitle>{feedback.title}</AlertTitle>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-4">
        <div className="grid w-full gap-3 lg:grid-cols-2 lg:items-end">
          <div className="w-full lg:max-w-md">
            <ListSearchInput
              id="persons-search"
              label={t("list.searchLabel")}
              clearLabel={t("list.clearSearchLabel")}
              placeholder={t("placeholders.search")}
              value={draftQuery.search ?? ""}
              onChange={(search) => {
                setDraftQuery((current) => ({
                  ...current,
                  search: search || undefined,
                  sort:
                    current.sort === "relevance" && !search
                      ? undefined
                      : current.sort,
                }));
              }}
              onClear={clearPersonsSearch}
              onSearch={searchPersons}
            />
          </div>

          <div className="flex w-full items-center justify-between gap-4 lg:justify-end">
            <ListSortSelect
              id="persons-sort"
              label={t("filters.sort")}
              value={effectiveListSort(draftQuery)}
              values={v1.persons.PERSON_LIST_SORTS.filter(
                (sort) => sort !== "relevance" || draftQuery.search,
              )}
              getOptionLabel={(sort) => t(`listSorts.${sort}`)}
              onValueChange={(value) => void changeSort(value)}
            />

            <ListFilterSheet
              appliedCount={operationalFilterCount(query)}
              applyLabel={t("actions.apply")}
              description={t("filters.description")}
              disabled={listLoading}
              formId="persons-filter-form"
              onApply={() =>
                loadPersons({
                  ...draftQuery,
                  page: 1,
                  pageSize: LIST_PAGE_SIZE,
                })
              }
              onReset={resetFilters}
              resetLabel={t("filters.reset")}
              title={t("filters.title")}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FilterField
                  id="persons-record-status"
                  label={t("filters.recordStatus")}
                >
                  <Select
                    value={effectiveRecordStatus(draftQuery)}
                    onValueChange={(value) => {
                      setDraftQuery((current) => ({
                        ...current,
                        includeDeleted: false,
                        recordStatus:
                          value === "active"
                            ? undefined
                            : (value as v1.persons.PersonRecordStatus),
                      }));
                    }}
                  >
                    <SelectTrigger
                      id="persons-record-status"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {v1.persons.PERSON_RECORD_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {t(`recordStatus.${status}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField
                  id="persons-document-type"
                  label={t("filters.documentType")}
                >
                  <Select
                    value={draftQuery.documentType ?? ALL_FILTERS}
                    onValueChange={(value) =>
                      setDraftValue(
                        "documentType",
                        value === ALL_FILTERS
                          ? undefined
                          : (value as v1.persons.PersonDocumentType),
                      )
                    }
                  >
                    <SelectTrigger
                      id="persons-document-type"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_FILTERS}>
                        {t("filters.all")}
                      </SelectItem>
                      {v1.persons.PERSON_DOCUMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`documentTypes.${type}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField
                  id="persons-document-status"
                  label={t("filters.documentStatus")}
                >
                  <Select
                    value={draftQuery.documentStatus ?? ALL_FILTERS}
                    onValueChange={(value) =>
                      setDraftValue(
                        "documentStatus",
                        value === ALL_FILTERS
                          ? undefined
                          : (value as v1.persons.PersonDocumentStatus),
                      )
                    }
                  >
                    <SelectTrigger
                      id="persons-document-status"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_FILTERS}>
                        {t("filters.all")}
                      </SelectItem>
                      {v1.persons.PERSON_DOCUMENT_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {t(`documentStatuses.${status}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField
                  id="persons-document-expiry"
                  label={t("filters.documentExpiry")}
                >
                  <Select
                    value={draftQuery.documentExpiry ?? ALL_FILTERS}
                    onValueChange={(value) =>
                      setDraftValue(
                        "documentExpiry",
                        value === ALL_FILTERS
                          ? undefined
                          : (value as v1.persons.PersonDocumentExpiry),
                      )
                    }
                  >
                    <SelectTrigger
                      id="persons-document-expiry"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_FILTERS}>
                        {t("filters.all")}
                      </SelectItem>
                      {v1.persons.PERSON_DOCUMENT_EXPIRIES.map((expiry) => (
                        <SelectItem key={expiry} value={expiry}>
                          {t(`documentExpiries.${expiry}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField
                  id="persons-document-expires-from-day"
                  label={t("filters.documentExpiresFrom")}
                >
                  <DatePartsField
                    baseId="persons-document-expires-from"
                    label={t("filters.documentExpiresFrom")}
                    locale={locale}
                    value={draftQuery.documentExpiresFrom ?? ""}
                    onChange={(value) =>
                      setDraftValue("documentExpiresFrom", value || undefined)
                    }
                  />
                </FilterField>

                <FilterField
                  id="persons-document-expires-to-day"
                  label={t("filters.documentExpiresTo")}
                >
                  <DatePartsField
                    baseId="persons-document-expires-to"
                    label={t("filters.documentExpiresTo")}
                    locale={locale}
                    value={draftQuery.documentExpiresTo ?? ""}
                    onChange={(value) =>
                      setDraftValue("documentExpiresTo", value || undefined)
                    }
                  />
                </FilterField>

                <FilterField
                  id="persons-country"
                  label={t("filters.countryCode")}
                >
                  <CountrySheetSelect
                    id="persons-country"
                    label={t("filters.countryCode")}
                    labelledById="persons-country-label"
                    locale={locale}
                    value={draftQuery.countryCode}
                    placeholder={t("filters.all")}
                    onValueChange={(value) =>
                      setDraftValue("countryCode", value)
                    }
                    onClear={() => setDraftValue("countryCode", undefined)}
                    clearOptionLabel={t("filters.all")}
                    searchPlaceholder={t("countryPicker.search")}
                    clearSearchLabel={t("countryPicker.clearSearch")}
                    emptyMessage={t("countryPicker.empty")}
                    closeLabel={t("actions.close")}
                  />
                </FilterField>

                <FilterField
                  id="persons-document-issuing-country"
                  label={t("filters.documentIssuingCountryCode")}
                >
                  <CountrySheetSelect
                    id="persons-document-issuing-country"
                    label={t("filters.documentIssuingCountryCode")}
                    labelledById="persons-document-issuing-country-label"
                    locale={locale}
                    value={draftQuery.documentIssuingCountryCode}
                    placeholder={t("filters.all")}
                    onValueChange={(value) =>
                      setDraftValue("documentIssuingCountryCode", value)
                    }
                    onClear={() =>
                      setDraftValue("documentIssuingCountryCode", undefined)
                    }
                    clearOptionLabel={t("filters.all")}
                    searchPlaceholder={t("countryPicker.search")}
                    clearSearchLabel={t("countryPicker.clearSearch")}
                    emptyMessage={t("countryPicker.empty")}
                    closeLabel={t("actions.close")}
                  />
                </FilterField>
              </div>
            </ListFilterSheet>
          </div>
        </div>

        <PersonList items={list.items} />

        <InfiniteListFooter
          hasMore={hasMore && !listLoading}
          loading={appendLoading}
          error={appendError}
          onLoadMore={loadNextPersonsPage}
        />
      </div>
    </div>
  );
}

function personsListPath(query: v1.persons.ListPersonsQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  appendPersonsQueryParams(params, query);
  return `${v1.persons.ROUTES.list}?${params}`;
}

function personsPageStateKey(
  query: v1.persons.ListPersonsQuery,
  list: v1.persons.PersonList,
): string {
  return JSON.stringify({
    query,
    list: {
      page: list.page,
      pageSize: list.pageSize,
      total: list.total,
      items: list.items.map((person) => [person.id, person.updatedAt]),
    },
  });
}

function updatePersonsUrl(
  query: v1.persons.ListPersonsQuery,
  history: "push" | "replace",
) {
  const params = new URLSearchParams();
  appendPersonsQueryParams(params, query);

  const search = params.toString();
  const href = `${window.location.pathname}${search ? `?${search}` : ""}`;
  if (history === "replace") {
    window.history.replaceState(null, "", href);
    return;
  }

  window.history.pushState(null, "", href);
}

function appendPersonsQueryParams(
  params: URLSearchParams,
  query: v1.persons.ListPersonsQuery,
) {
  if (query.search) params.set("search", query.search);
  if (query.recordStatus) params.set("recordStatus", query.recordStatus);
  if (query.documentType) params.set("documentType", query.documentType);
  if (query.documentStatus) params.set("documentStatus", query.documentStatus);
  if (query.documentExpiry) params.set("documentExpiry", query.documentExpiry);
  if (query.documentExpiresFrom) {
    params.set("documentExpiresFrom", query.documentExpiresFrom);
  }
  if (query.documentExpiresTo) {
    params.set("documentExpiresTo", query.documentExpiresTo);
  }
  if (query.countryCode) params.set("countryCode", query.countryCode);
  if (query.documentIssuingCountryCode) {
    params.set("documentIssuingCountryCode", query.documentIssuingCountryCode);
  }
  if (query.sort && !isDefaultSort(query, query.sort)) {
    params.set("sort", query.sort);
  }
  if (query.includeDeleted) params.set("includeDeleted", "true");
}

function effectiveRecordStatus(
  query: v1.persons.ListPersonsQuery,
): v1.persons.PersonRecordStatus {
  return query.recordStatus ?? (query.includeDeleted ? "all" : "active");
}

function effectiveListSort(
  query: v1.persons.ListPersonsQuery,
): v1.persons.PersonListSort {
  if (query.sort === "relevance" && !query.search) {
    return "nameAsc";
  }

  return query.sort ?? (query.search ? "relevance" : "nameAsc");
}

function isDefaultSort(
  query: v1.persons.ListPersonsQuery,
  sort: v1.persons.PersonListSort,
): boolean {
  if (sort === "relevance" && !query.search) {
    return true;
  }

  return sort === (query.search ? "relevance" : "nameAsc");
}

function operationalFilterCount(query: v1.persons.ListPersonsQuery): number {
  return [
    query.includeDeleted,
    query.recordStatus,
    query.documentType,
    query.documentStatus,
    query.documentExpiry,
    query.documentExpiresFrom,
    query.documentExpiresTo,
    query.countryCode,
    query.documentIssuingCountryCode,
  ].filter(Boolean).length;
}

function normalizedSearch(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function FilterField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label id={`${id}-label`} htmlFor={id}>
        {label}
      </Label>
      {children}
    </div>
  );
}
