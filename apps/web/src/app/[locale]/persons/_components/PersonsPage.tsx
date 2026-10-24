"use client";

import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";

import { ApiError, v1 } from "@repo/api-shared";
import {
  buttonVariants,
  CountrySheetSelect,
  Label,
  ListFilterSheet,
  ListLayout,
  ListStatus,
  SheetSelect,
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
import { ListSearchInput } from "@/components/ListSearchInput";
import { webApi } from "@/lib/api";
import { PersonList } from "./PersonList";
import { DatePartsField } from "@/components/DateField";

interface PersonsPageProps {
  createHref: string;
  initialList: v1.persons.PersonList;
  initialQuery: v1.persons.ListPersonsQuery;
}

const LIST_PAGE_SIZE = 25;
const ALL_FILTERS = "all";
const SEARCH_DEBOUNCE_MS = 500;
const QUERY_KEYS = [
  "search",
  "recordStatus",
  "documentType",
  "documentStatus",
  "documentExpiry",
  "documentExpiresFrom",
  "documentExpiresTo",
  "countryCode",
  "documentIssuingCountryCode",
  "sort",
  "includeDeleted",
] as const;

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
  const session = useOptionalSession();
  const t = useTranslations("persons");
  const tShared = useTranslations("shared");
  const locale = useLocale();
  const [list, setList] = useState(initialList);
  const [filterNavigationKey, setFilterNavigationKey] = useState(0);
  const [query, setQuery] = useState<v1.persons.ListPersonsQuery>(initialQuery);
  const [draftQuery, setDraftQuery] =
    useState<v1.persons.ListPersonsQuery>(initialQuery);
  const [listLoading, setListLoading] = useState(false);
  const [appendLoading, setAppendLoading] = useState(false);
  const [appendError, setAppendError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const lastRequestRef = useRef(initialQuery);
  const appendLoadingRef = useRef(false);
  const searchDebounceReadyRef = useRef(false);
  const pendingSearchRef = useRef<string | null>(null);
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
        history?: "push" | "replace" | "none";
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
      pendingSearchRef.current = normalizedSearch(parsedQuery.search);
      lastRequestRef.current = parsedQuery;
      appendLoadingRef.current = false;
      setListLoading(true);
      setAppendLoading(false);
      setAppendError(null);
      if (options.clearFeedback !== false) {
        setListError(null);
      }

      try {
        const nextList = await webApi.fetch(
          personsListPath(parsedQuery),
          v1.persons.personListSchema,
          { cache: "no-store" },
        );

        if (requestId !== requestIdRef.current) {
          return false;
        }

        if (options.history !== "none") {
          updatePersonsUrl(parsedQuery, options.history ?? "push");
        }
        setList(nextList);
        setQuery(parsedQuery);
        if (!options.preserveDraft) {
          setDraftQuery(parsedQuery);
        }
        return true;
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return false;
        }

        setListError(
          error instanceof ApiError
            ? error.message
            : t("feedback.genericError"),
        );
        return false;
      } finally {
        if (requestId === requestIdRef.current) {
          pendingSearchRef.current = null;
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

    if (
      normalizedSearch(draftQuery.search) === normalizedSearch(query.search) ||
      pendingSearchRef.current === normalizedSearch(draftQuery.search)
    ) {
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
      ...query,
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

  useEffect(() => {
    const pathname = window.location.pathname;
    function restoreLocation() {
      if (window.location.pathname !== pathname) return;
      clearSearchDebounce();
      const params = new URLSearchParams(window.location.search);
      const restoredQuery = v1.persons.listPersonsQuerySchema.safeParse({
        ...Object.fromEntries(
          QUERY_KEYS.map((key) => [key, params.get(key) ?? undefined]),
        ),
        page: 1,
        pageSize: LIST_PAGE_SIZE,
      });
      if (!restoredQuery.success) {
        // URL validation remains the server route's responsibility.
        window.location.reload();
        return;
      }
      setFilterNavigationKey((current) => current + 1);
      setDraftQuery(restoredQuery.data);
      void loadPersons(restoredQuery.data, { history: "none" });
    }

    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, [clearSearchDebounce, loadPersons]);

  const hasMore = list.items.length < list.total;

  const selectLabels = {
    searchPlaceholder: tShared("list.selectSearch"),
    clearSearchLabel: tShared("list.selectClearSearch"),
    emptyMessage: tShared("list.selectEmpty"),
    closeLabel: tShared("actions.close"),
  };

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-4 pt-6 sm:px-6 sm:pt-10">
      <ListLayout
        action={
          canAccess(session?.user, "persons.create") ? (
            <Link href={createHref} className={buttonVariants()}>
              <UserPlusIcon data-icon="inline-start" />
              {t("actions.add")}
            </Link>
          ) : null
        }
        filters={
          <ListFilterSheet
            key={filterNavigationKey}
            value={{ ...query, search: draftQuery.search }}
            defaultValue={{
              page: 1,
              pageSize: LIST_PAGE_SIZE,
              includeDeleted: false,
              search: draftQuery.search,
            }}
            appliedCount={operationalFilterCount(query)}
            applyLabel={t("actions.apply")}
            applyingLabel={t("actions.applying")}
            cancelLabel={t("actions.cancel")}
            applyErrorLabel={tShared("list.applyError")}
            description={t("filters.description")}
            disabled={listLoading}
            onApply={(value) => {
              clearSearchDebounce();
              return loadPersons({
                ...value,
                search: normalizedSearch(draftQuery.search) || undefined,
                page: 1,
                pageSize: LIST_PAGE_SIZE,
              });
            }}
            resetLabel={t("filters.reset")}
            title={t("filters.title")}
          >
            {({ value, setValue }) => {
              function setFilterValue<
                Key extends keyof v1.persons.ListPersonsQuery,
              >(key: Key, fieldValue: v1.persons.ListPersonsQuery[Key]) {
                setValue((current) => ({ ...current, [key]: fieldValue }));
              }
              return (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FilterField id="persons-sort" label={t("filters.sort")}>
                    <SheetSelect
                      {...selectLabels}
                      id="persons-sort"
                      label={t("filters.sort")}
                      value={effectiveListSort(value)}
                      options={v1.persons.PERSON_LIST_SORTS.filter(
                        (sort) => sort !== "relevance" || draftQuery.search,
                      ).map((sort) => ({
                        value: sort,
                        label: t(`listSorts.${sort}`),
                      }))}
                      onValueChange={(sort) =>
                        setFilterValue(
                          "sort",
                          isDefaultSort(
                            { ...value, search: draftQuery.search },
                            sort as v1.persons.PersonListSort,
                          )
                            ? undefined
                            : (sort as v1.persons.PersonListSort),
                        )
                      }
                    />
                  </FilterField>

                  <FilterField
                    id="persons-record-status"
                    label={t("filters.recordStatus")}
                  >
                    <SheetSelect
                      {...selectLabels}
                      id="persons-record-status"
                      label={t("filters.recordStatus")}
                      value={effectiveRecordStatus(value)}
                      onValueChange={(value) => {
                        setValue((current) => ({
                          ...current,
                          includeDeleted: false,
                          recordStatus:
                            value === "active"
                              ? undefined
                              : (value as v1.persons.PersonRecordStatus),
                        }));
                      }}
                      options={v1.persons.PERSON_RECORD_STATUSES.map(
                        (status) => ({
                          value: status,
                          label: t(`recordStatus.${status}`),
                        }),
                      )}
                    />
                  </FilterField>

                  <FilterField
                    id="persons-document-type"
                    label={t("filters.documentType")}
                  >
                    <SheetSelect
                      {...selectLabels}
                      id="persons-document-type"
                      label={t("filters.documentType")}
                      value={value.documentType ?? ALL_FILTERS}
                      onValueChange={(value) =>
                        setFilterValue(
                          "documentType",
                          value === ALL_FILTERS
                            ? undefined
                            : (value as v1.persons.PersonDocumentType),
                        )
                      }
                      options={[
                        { value: ALL_FILTERS, label: t("filters.all") },
                        ...v1.persons.PERSON_DOCUMENT_TYPES.map((option) => ({
                          value: option,
                          label: t(`documentTypes.${option}`),
                        })),
                      ]}
                    />
                  </FilterField>

                  <FilterField
                    id="persons-document-status"
                    label={t("filters.documentStatus")}
                  >
                    <SheetSelect
                      {...selectLabels}
                      id="persons-document-status"
                      label={t("filters.documentStatus")}
                      value={value.documentStatus ?? ALL_FILTERS}
                      onValueChange={(value) =>
                        setFilterValue(
                          "documentStatus",
                          value === ALL_FILTERS
                            ? undefined
                            : (value as v1.persons.PersonDocumentStatus),
                        )
                      }
                      options={[
                        { value: ALL_FILTERS, label: t("filters.all") },
                        ...v1.persons.PERSON_DOCUMENT_STATUSES.map(
                          (option) => ({
                            value: option,
                            label: t(`documentStatuses.${option}`),
                          }),
                        ),
                      ]}
                    />
                  </FilterField>

                  <FilterField
                    id="persons-document-expiry"
                    label={t("filters.documentExpiry")}
                  >
                    <SheetSelect
                      {...selectLabels}
                      id="persons-document-expiry"
                      label={t("filters.documentExpiry")}
                      value={value.documentExpiry ?? ALL_FILTERS}
                      onValueChange={(value) =>
                        setFilterValue(
                          "documentExpiry",
                          value === ALL_FILTERS
                            ? undefined
                            : (value as v1.persons.PersonDocumentExpiry),
                        )
                      }
                      options={[
                        { value: ALL_FILTERS, label: t("filters.all") },
                        ...v1.persons.PERSON_DOCUMENT_EXPIRIES.map(
                          (option) => ({
                            value: option,
                            label: t(`documentExpiries.${option}`),
                          }),
                        ),
                      ]}
                    />
                  </FilterField>

                  <FilterField
                    id="persons-document-expires-from-day"
                    label={t("filters.documentExpiresFrom")}
                  >
                    <DatePartsField
                      baseId="persons-document-expires-from"
                      label={t("filters.documentExpiresFrom")}
                      locale={locale}
                      value={value.documentExpiresFrom ?? ""}
                      onChange={(value) =>
                        setFilterValue(
                          "documentExpiresFrom",
                          value || undefined,
                        )
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
                      value={value.documentExpiresTo ?? ""}
                      onChange={(value) =>
                        setFilterValue("documentExpiresTo", value || undefined)
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
                      value={value.countryCode}
                      placeholder={t("filters.all")}
                      onValueChange={(value) =>
                        setFilterValue("countryCode", value)
                      }
                      onClear={() => setFilterValue("countryCode", undefined)}
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
                      value={value.documentIssuingCountryCode}
                      placeholder={t("filters.all")}
                      onValueChange={(value) =>
                        setFilterValue("documentIssuingCountryCode", value)
                      }
                      onClear={() =>
                        setFilterValue("documentIssuingCountryCode", undefined)
                      }
                      clearOptionLabel={t("filters.all")}
                      searchPlaceholder={t("countryPicker.search")}
                      clearSearchLabel={t("countryPicker.clearSearch")}
                      emptyMessage={t("countryPicker.empty")}
                      closeLabel={t("actions.close")}
                    />
                  </FilterField>
                </div>
              );
            }}
          </ListFilterSheet>
        }
        search={
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
        }
        summary={
          listLoading || listError ? (
            <>
              <ListStatus
                loading={listLoading}
                error={listError}
                loadingLabel={tShared("status.refreshing")}
                retryLabel={tShared("actions.retry")}
                onRetry={() => void loadPersons(lastRequestRef.current)}
              />
              {(listLoading || listError) && list.items.length > 0 ? (
                <p role="status">{tShared("list.staleResults")}</p>
              ) : null}
            </>
          ) : null
        }
        footer={
          hasMore || appendLoading || appendError ? (
            <InfiniteListFooter
              hasMore={hasMore && !listLoading}
              loading={appendLoading}
              error={appendError}
              onLoadMore={loadNextPersonsPage}
            />
          ) : null
        }
      >
        <PersonList
          items={list.items}
          emptyMessage={
            query.search || operationalFilterCount(query) > 0
              ? tShared("list.noResults")
              : undefined
          }
        />
      </ListLayout>
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
  const params = new URLSearchParams(window.location.search);
  for (const key of QUERY_KEYS) params.delete(key);
  params.delete("page");
  params.delete("pageSize");
  appendPersonsQueryParams(params, query);

  const search = params.toString();
  const href = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  if (
    `${window.location.pathname}${window.location.search}${window.location.hash}` ===
    href
  )
    return;
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
    query.sort && !isDefaultSort(query, query.sort),
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
