"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  buttonVariants,
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { InfiniteListFooter } from "@/components/InfiniteListFooter";
import { ListFilterSheet } from "@/components/ListFilterSheet";
import { ListSearchInput } from "@/components/ListSearchInput";
import { ListSortSelect } from "@/components/ListSortSelect";
import { webApi } from "@/lib/api";
import { ScooterList } from "./ScooterList";

interface ScootersPageProps {
  createHref: string;
  initialList: v1.scooters.ScooterList;
  initialQuery: v1.scooters.ListScootersQuery;
  /** Scooter IDs with an active sale, resolved for `initialList`. */
  initialSoldScooterIds?: string[];
}

interface Feedback {
  kind: "error";
  title: string;
  message: string;
}

const LIST_PAGE_SIZE = 25;
const ALL_FILTERS = "all";
const ACTIVE_RECORDS = "active";
const SEARCH_DEBOUNCE_MS = 500;

export function ScootersPage({
  createHref,
  initialList,
  initialQuery,
  initialSoldScooterIds,
}: ScootersPageProps) {
  return (
    <ScootersPageContent
      key={scootersPageStateKey(initialQuery, initialList)}
      createHref={createHref}
      initialList={initialList}
      initialQuery={initialQuery}
      initialSoldScooterIds={initialSoldScooterIds}
    />
  );
}

function ScootersPageContent({
  createHref,
  initialList,
  initialQuery,
  initialSoldScooterIds = [],
}: ScootersPageProps) {
  const t = useTranslations("scooters");
  const [list, setList] = useState(initialList);
  const soldScooterIds = useMemo(
    () => new Set(initialSoldScooterIds),
    [initialSoldScooterIds],
  );
  const [query, setQuery] =
    useState<v1.scooters.ListScootersQuery>(initialQuery);
  const [draftQuery, setDraftQuery] =
    useState<v1.scooters.ListScootersQuery>(initialQuery);
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

  const loadScooters = useCallback(
    async (
      nextQuery: v1.scooters.ListScootersQuery,
      options: {
        clearFeedback?: boolean;
        history?: "push" | "replace";
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
      appendLoadingRef.current = false;
      setListLoading(true);
      setAppendLoading(false);
      setAppendError(null);
      if (options.clearFeedback !== false) {
        setFeedback(null);
      }

      try {
        const nextList = await webApi.fetch(
          scootersListPath(parsedQuery),
          v1.scooters.scooterListSchema,
          { cache: "no-store" },
        );

        if (requestId !== requestIdRef.current) {
          return;
        }

        updateScootersUrl(parsedQuery, options.history ?? "push");
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

    if (draftQuery.search === query.search) {
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
      ...draftQuery,
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

  async function changeSort(value: string | null) {
    if (!value) {
      return;
    }

    clearSearchDebounce();
    const sort = value as v1.scooters.ScooterListSort;
    const nextQuery = {
      ...draftQuery,
      page: 1,
      pageSize: LIST_PAGE_SIZE,
      sort: isDefaultSort(draftQuery, sort) ? undefined : sort,
    };

    setDraftQuery(nextQuery);
    await loadScooters(nextQuery);
  }

  async function resetFilters() {
    clearSearchDebounce();
    await loadScooters({
      page: 1,
      pageSize: LIST_PAGE_SIZE,
      includeDeleted: false,
    });
  }

  function setDraftValue<Key extends keyof v1.scooters.ListScootersQuery>(
    key: Key,
    value: v1.scooters.ListScootersQuery[Key],
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
          <PlusIcon data-icon="inline-start" />
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
          </div>

          <div className="flex w-full items-center justify-between gap-4 lg:justify-end">
            <ListSortSelect
              id="scooters-sort"
              label={t("filters.sort")}
              value={effectiveListSort(draftQuery)}
              values={v1.scooters.SCOOTER_LIST_SORTS.filter(
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
              formId="scooters-filter-form"
              onApply={() =>
                loadScooters({
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
                  id="scooters-record-status"
                  label={t("filters.recordStatus")}
                >
                  <Select
                    value={
                      draftQuery.includeDeleted ? ALL_FILTERS : ACTIVE_RECORDS
                    }
                    onValueChange={(value) =>
                      setDraftValue("includeDeleted", value === ALL_FILTERS)
                    }
                  >
                    <SelectTrigger
                      id="scooters-record-status"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={ACTIVE_RECORDS}>
                          {t("recordStatus.active")}
                        </SelectItem>
                        <SelectItem value={ALL_FILTERS}>
                          {t("recordStatus.all")}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField
                  id="scooters-powertrain-type"
                  label={t("filters.powertrainType")}
                >
                  <Select
                    value={draftQuery.powertrainType ?? ALL_FILTERS}
                    onValueChange={(value) =>
                      setDraftValue(
                        "powertrainType",
                        value === ALL_FILTERS
                          ? undefined
                          : (value as v1.scooters.ScooterPowertrainType),
                      )
                    }
                  >
                    <SelectTrigger
                      id="scooters-powertrain-type"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={ALL_FILTERS}>
                          {t("filters.all")}
                        </SelectItem>
                        {v1.scooters.SCOOTER_POWERTRAIN_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {t(`powertrainTypes.${type}`)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField
                  id="scooters-registration-type"
                  label={t("filters.registrationType")}
                >
                  <Select
                    value={draftQuery.registrationType ?? ALL_FILTERS}
                    onValueChange={(value) =>
                      setDraftValue(
                        "registrationType",
                        value === ALL_FILTERS
                          ? undefined
                          : (value as v1.scooters.ScooterRegistrationType),
                      )
                    }
                  >
                    <SelectTrigger
                      id="scooters-registration-type"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={ALL_FILTERS}>
                          {t("filters.all")}
                        </SelectItem>
                        {v1.scooters.SCOOTER_REGISTRATION_TYPES.map(
                          (registrationType) => (
                            <SelectItem
                              key={registrationType}
                              value={registrationType}
                            >
                              {t(`registrationTypes.${registrationType}`)}
                            </SelectItem>
                          ),
                        )}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FilterField>
              </div>
            </ListFilterSheet>
          </div>
        </div>

        <ScooterList items={list.items} soldScooterIds={soldScooterIds} />

        <InfiniteListFooter
          hasMore={hasMore && !listLoading}
          loading={appendLoading}
          error={appendError}
          onLoadMore={loadNextScootersPage}
        />
      </div>
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
  const params = new URLSearchParams();
  appendScootersQueryParams(params, query);

  const search = params.toString();
  const href = `${window.location.pathname}${search ? `?${search}` : ""}`;
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
    return "vinAsc";
  }

  return query.sort ?? (query.search ? "relevance" : "vinAsc");
}

function isDefaultSort(
  query: v1.scooters.ListScootersQuery,
  sort: v1.scooters.ScooterListSort,
): boolean {
  if (sort === "relevance" && !query.search) {
    return true;
  }

  return sort === (query.search ? "relevance" : "vinAsc");
}

function operationalFilterCount(query: v1.scooters.ListScootersQuery): number {
  return [
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
