"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  buttonVariants,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components";
import { CheckIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { InfiniteListFooter } from "@/components/InfiniteListFooter";
import { webApi } from "@/lib/api";
import { ScooterList } from "./ScooterList";

interface ScootersPageProps {
  createHref: string;
  initialList: v1.scooters.ScooterList;
  initialQuery: v1.scooters.ListScootersQuery;
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
  const t = useTranslations("scooters");
  const [list, setList] = useState(initialList);
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
        setDraftQuery(parsedQuery);
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
        { history: "replace" },
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

  async function searchScooters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearSearchDebounce();
    await loadScooters({
      ...draftQuery,
      page: 1,
      pageSize: LIST_PAGE_SIZE,
    });
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
    <div className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-6 py-10">
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
        <form
          className="grid w-full gap-3"
          onSubmit={(event) => void searchScooters(event)}
        >
          <Accordion
            defaultValue={
              hasOperationalFilters(initialQuery) ? ["filters"] : []
            }
          >
            <AccordionItem value="filters">
              <div className="grid w-full gap-3 lg:grid-cols-2 lg:items-end">
                <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-md">
                  <Label htmlFor="scooters-search" className="sr-only">
                    {t("list.searchLabel")}
                  </Label>
                  <Input
                    id="scooters-search"
                    type="search"
                    placeholder={t("placeholders.search")}
                    value={draftQuery.search ?? ""}
                    onChange={(event) => {
                      const search = event.target.value || undefined;
                      setDraftQuery((current) => ({
                        ...current,
                        search,
                        sort:
                          current.sort === "relevance" && !search
                            ? undefined
                            : current.sort,
                      }));
                    }}
                  />
                  <Button type="submit" disabled={listLoading}>
                    <CheckIcon data-icon="inline-start" />
                    {t("actions.apply")}
                  </Button>
                </div>

                <div className="flex w-full items-center justify-between gap-4 lg:justify-end">
                  <div className="min-w-0">
                    <Label htmlFor="scooters-sort" className="sr-only">
                      {t("filters.sort")}
                    </Label>
                    <Select
                      value={effectiveListSort(draftQuery)}
                      onValueChange={(value) => void changeSort(value)}
                    >
                      <SelectTrigger
                        id="scooters-sort"
                        className="w-auto border-transparent bg-transparent px-0 text-muted-foreground hover:text-foreground focus-visible:border-transparent"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {v1.scooters.SCOOTER_LIST_SORTS.filter(
                          (sort) => sort !== "relevance" || draftQuery.search,
                        ).map((sort) => (
                          <SelectItem key={sort} value={sort}>
                            {t(`listSorts.${sort}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <AccordionTrigger className="h-8 flex-none items-center justify-center border-transparent bg-transparent px-0 py-0 text-muted-foreground hover:text-foreground hover:no-underline focus-visible:border-transparent">
                    {t("filters.title")}
                  </AccordionTrigger>
                </div>
              </div>

              <AccordionContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                        <SelectItem value={ACTIVE_RECORDS}>
                          {t("recordStatus.active")}
                        </SelectItem>
                        <SelectItem value={ALL_FILTERS}>
                          {t("recordStatus.all")}
                        </SelectItem>
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
                        <SelectItem value={ALL_FILTERS}>
                          {t("filters.all")}
                        </SelectItem>
                        {v1.scooters.SCOOTER_POWERTRAIN_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {t(`powertrainTypes.${type}`)}
                          </SelectItem>
                        ))}
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
                      </SelectContent>
                    </Select>
                  </FilterField>
                </div>

                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={listLoading}
                    onClick={() => void resetFilters()}
                  >
                    <RotateCcwIcon data-icon="inline-start" />
                    {t("filters.reset")}
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </form>

        <ScooterList items={list.items} />

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

function hasOperationalFilters(query: v1.scooters.ListScootersQuery): boolean {
  return Boolean(
    query.includeDeleted || query.powertrainType || query.registrationType,
  );
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
