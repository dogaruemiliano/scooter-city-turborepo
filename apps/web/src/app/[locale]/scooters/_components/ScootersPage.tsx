"use client";

import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";

import { ApiError, v1 } from "@repo/api-shared";
import {
  buttonVariants,
  Label,
  ListFilterSheet,
  ListLayout,
  ListStatus,
  SheetSelect,
} from "@repo/ui/components";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
import { ScooterList } from "./ScooterList";

interface ScootersPageProps {
  createHref: string;
  initialList: v1.scooters.ScooterList;
  initialQuery: v1.scooters.ListScootersQuery;
  /** Scooter IDs with an active sale, resolved for `initialList`. */
}

const LIST_PAGE_SIZE = 25;
const ALL_FILTERS = "all";
const ACTIVE_RECORDS = "active";
const SEARCH_DEBOUNCE_MS = 500;
const QUERY_KEYS = [
  "search",
  "powertrainType",
  "registrationType",
  "sort",
  "includeDeleted",
] as const;

export function ScootersPage({
  createHref,
  initialList,
  initialQuery,
}: ScootersPageProps) {
  return (
    <ScootersPageContent
      key={scootersPageStateKey(initialQuery, initialList)}
      createHref={createHref}
      initialList={initialList}
      initialQuery={initialQuery}
    />
  );
}

function ScootersPageContent({
  createHref,
  initialList,
  initialQuery,
}: ScootersPageProps) {
  const session = useOptionalSession();
  const t = useTranslations("scooters");
  const tShared = useTranslations("shared");
  const [list, setList] = useState(initialList);
  const [filterNavigationKey, setFilterNavigationKey] = useState(0);
  const [query, setQuery] =
    useState<v1.scooters.ListScootersQuery>(initialQuery);
  const [draftQuery, setDraftQuery] =
    useState<v1.scooters.ListScootersQuery>(initialQuery);
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

  const loadScooters = useCallback(
    async (
      nextQuery: v1.scooters.ListScootersQuery,
      options: {
        clearFeedback?: boolean;
        history?: "push" | "replace" | "none";
        preserveDraft?: boolean;
      } = {},
    ) => {
      const parsedQuery = v1.scooters.listScootersQuerySchema.parse({
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
          scootersListPath(parsedQuery),
          v1.scooters.scooterListSchema,
          { cache: "no-store" },
        );

        if (requestId !== requestIdRef.current) {
          return false;
        }

        if (options.history !== "none") {
          updateScootersUrl(parsedQuery, options.history ?? "push");
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

  const loadNextScootersPage = useCallback(async () => {
    if (
      appendLoadingRef.current ||
      listLoading ||
      list.items.length >= list.total
    ) {
      return;
    }

    const nextQuery = v1.scooters.listScootersQuerySchema.parse({
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
        scootersListPath(nextQuery),
        v1.scooters.scooterListSchema,
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
      void loadScooters(
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
  }, [clearSearchDebounce, draftQuery.search, loadScooters, query]);

  async function searchScooters() {
    clearSearchDebounce();
    const search = normalizedSearch(draftQuery.search);
    if (search === normalizedSearch(query.search)) return;

    await loadScooters({
      ...query,
      search: search || undefined,
      page: 1,
      pageSize: LIST_PAGE_SIZE,
    });
  }

  async function clearScootersSearch() {
    clearSearchDebounce();
    setDraftQuery((current) => ({
      ...current,
      search: undefined,
      sort: current.sort === "relevance" ? undefined : current.sort,
    }));

    if (!query.search) return;
    await loadScooters(
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
      const restoredQuery = v1.scooters.listScootersQuerySchema.safeParse({
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
      void loadScooters(restoredQuery.data, { history: "none" });
    }

    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, [clearSearchDebounce, loadScooters]);

  const hasMore = list.items.length < list.total;

  const selectLabels = {
    searchPlaceholder: tShared("list.selectSearch"),
    clearSearchLabel: tShared("list.selectClearSearch"),
    emptyMessage: tShared("list.selectEmpty"),
    closeLabel: tShared("actions.close"),
  };

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <ListLayout
        action={
          canAccess(session?.user, "scooters.create") ? (
            <Link href={createHref} className={buttonVariants()}>
              <PlusIcon data-icon="inline-start" />
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
            cancelLabel={t("actions.cancel")}
            applyErrorLabel={tShared("list.applyError")}
            description={t("filters.description")}
            disabled={listLoading}
            onApply={(value) => {
              clearSearchDebounce();
              return loadScooters({
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
                Key extends keyof v1.scooters.ListScootersQuery,
              >(key: Key, fieldValue: v1.scooters.ListScootersQuery[Key]) {
                setValue((current) => ({ ...current, [key]: fieldValue }));
              }
              return (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FilterField id="scooters-sort" label={t("filters.sort")}>
                    <SheetSelect
                      {...selectLabels}
                      id="scooters-sort"
                      label={t("filters.sort")}
                      value={effectiveListSort(value)}
                      options={v1.scooters.SCOOTER_LIST_SORTS.filter(
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
                            sort as v1.scooters.ScooterListSort,
                          )
                            ? undefined
                            : (sort as v1.scooters.ScooterListSort),
                        )
                      }
                    />
                  </FilterField>

                  <FilterField
                    id="scooters-record-status"
                    label={t("filters.recordStatus")}
                  >
                    <SheetSelect
                      {...selectLabels}
                      id="scooters-record-status"
                      label={t("filters.recordStatus")}
                      value={
                        value.includeDeleted ? ALL_FILTERS : ACTIVE_RECORDS
                      }
                      onValueChange={(value) =>
                        setFilterValue("includeDeleted", value === ALL_FILTERS)
                      }
                      options={[
                        {
                          value: ACTIVE_RECORDS,
                          label: t("recordStatus.active"),
                        },
                        { value: ALL_FILTERS, label: t("recordStatus.all") },
                      ]}
                    />
                  </FilterField>

                  <FilterField
                    id="scooters-powertrain-type"
                    label={t("filters.powertrainType")}
                  >
                    <SheetSelect
                      {...selectLabels}
                      id="scooters-powertrain-type"
                      label={t("filters.powertrainType")}
                      value={value.powertrainType ?? ALL_FILTERS}
                      onValueChange={(value) =>
                        setFilterValue(
                          "powertrainType",
                          value === ALL_FILTERS
                            ? undefined
                            : (value as v1.scooters.ScooterPowertrainType),
                        )
                      }
                      options={[
                        { value: ALL_FILTERS, label: t("filters.all") },
                        ...v1.scooters.SCOOTER_POWERTRAIN_TYPES.map(
                          (option) => ({
                            value: option,
                            label: t(`powertrainTypes.${option}`),
                          }),
                        ),
                      ]}
                    />
                  </FilterField>

                  <FilterField
                    id="scooters-registration-type"
                    label={t("filters.registrationType")}
                  >
                    <SheetSelect
                      {...selectLabels}
                      id="scooters-registration-type"
                      label={t("filters.registrationType")}
                      value={value.registrationType ?? ALL_FILTERS}
                      onValueChange={(value) =>
                        setFilterValue(
                          "registrationType",
                          value === ALL_FILTERS
                            ? undefined
                            : (value as v1.scooters.ScooterRegistrationType),
                        )
                      }
                      options={[
                        { value: ALL_FILTERS, label: t("filters.all") },
                        ...v1.scooters.SCOOTER_REGISTRATION_TYPES.map(
                          (option) => ({
                            value: option,
                            label: t(`registrationTypes.${option}`),
                          }),
                        ),
                      ]}
                    />
                  </FilterField>
                </div>
              );
            }}
          </ListFilterSheet>
        }
        search={
          <ListSearchInput
            id="scooters-search"
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
            onClear={clearScootersSearch}
            onSearch={searchScooters}
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
                onRetry={() => void loadScooters(lastRequestRef.current)}
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
              onLoadMore={loadNextScootersPage}
            />
          ) : null
        }
      >
        <ScooterList
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

function scootersListPath(query: v1.scooters.ListScootersQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  appendScootersQueryParams(params, query);
  return `${v1.scooters.ROUTES.list}?${params}`;
}

function scootersPageStateKey(
  query: v1.scooters.ListScootersQuery,
  list: v1.scooters.ScooterList,
): string {
  return JSON.stringify({
    query,
    list: {
      page: list.page,
      pageSize: list.pageSize,
      total: list.total,
      items: list.items.map((scooter) => [scooter.id, scooter.updatedAt]),
    },
  });
}

function updateScootersUrl(
  query: v1.scooters.ListScootersQuery,
  history: "push" | "replace",
) {
  const params = new URLSearchParams(window.location.search);
  for (const key of QUERY_KEYS) params.delete(key);
  params.delete("page");
  params.delete("pageSize");
  appendScootersQueryParams(params, query);

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

function appendScootersQueryParams(
  params: URLSearchParams,
  query: v1.scooters.ListScootersQuery,
) {
  if (query.search) params.set("search", query.search);
  if (query.powertrainType) {
    params.set("powertrainType", query.powertrainType);
  }
  if (query.registrationType) {
    params.set("registrationType", query.registrationType);
  }
  if (query.sort && !isDefaultSort(query, query.sort)) {
    params.set("sort", query.sort);
  }
  if (query.includeDeleted) params.set("includeDeleted", "true");
}

function effectiveListSort(
  query: v1.scooters.ListScootersQuery,
): v1.scooters.ScooterListSort {
  if (query.sort === "relevance" && !query.search) {
    return "fleetNumberAsc";
  }

  return query.sort ?? (query.search ? "relevance" : "fleetNumberAsc");
}

function isDefaultSort(
  query: v1.scooters.ListScootersQuery,
  sort: v1.scooters.ScooterListSort,
): boolean {
  if (sort === "relevance" && !query.search) {
    return true;
  }

  return sort === (query.search ? "relevance" : "fleetNumberAsc");
}

function operationalFilterCount(query: v1.scooters.ListScootersQuery): number {
  return [
    query.sort && !isDefaultSort(query, query.sort),
    query.includeDeleted,
    query.powertrainType,
    query.registrationType,
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
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
