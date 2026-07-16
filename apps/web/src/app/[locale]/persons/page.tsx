import { ApiError, v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  getLocalizedSignInPath,
  localizePath,
  resolveRouteLocale,
} from "../../../i18n/paths";
import { webApi } from "../../../lib/api";
import { meFromApi } from "../../../lib/auth-server";
import { PersonsPage } from "./_components/PersonsPage";

const PERSONS_PATH = "/persons";
const PERSONS_NEW_PATH = "/persons/new";
const ADMIN_ROLE = "ADMIN";

interface PersonsRoutePageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: Pick<PersonsRoutePageProps, "params">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return {
    title: messages[locale].appShell.pages.persons,
  };
}

export default async function PersonsRoutePage({
  params,
  searchParams,
}: PersonsRoutePageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const initialQuery = personsQueryFromSearchParams(await searchParams);
  const user = await meFromApi();

  if (!user) {
    redirect(
      getLocalizedSignInPath(locale, localizePath(PERSONS_PATH, locale)),
    );
  }

  if (!user.roles.includes(ADMIN_ROLE)) {
    notFound();
  }

  const initialList = await personsFromApi(locale, initialQuery);

  return (
    <PersonsPage
      createHref={localizePath(PERSONS_NEW_PATH, locale)}
      initialList={initialList}
      initialQuery={initialQuery}
    />
  );
}

async function personsFromApi(
  locale: ReturnType<typeof resolveRouteLocale>,
  query: v1.persons.ListPersonsQuery,
): Promise<v1.persons.PersonList> {
  const cookieHeader = (await cookies()).toString();

  try {
    return await webApi.fetch(
      personsListPath(query),
      v1.persons.personListSchema,
      {
        headers: { cookie: cookieHeader },
        cache: "no-store",
      },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(
        getLocalizedSignInPath(locale, localizePath(PERSONS_PATH, locale)),
      );
    }
    if (error instanceof ApiError && error.status === 403) {
      notFound();
    }
    throw error;
  }
}

function personsQueryFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): v1.persons.ListPersonsQuery {
  return v1.persons.listPersonsQuerySchema.parse({
    page: firstSearchParam(searchParams.page),
    pageSize: firstSearchParam(searchParams.pageSize),
    search: firstSearchParam(searchParams.search),
    recordStatus: firstSearchParam(searchParams.recordStatus),
    documentType: firstSearchParam(searchParams.documentType),
    documentStatus: firstSearchParam(searchParams.documentStatus),
    documentExpiry: firstSearchParam(searchParams.documentExpiry),
    documentExpiresFrom: firstSearchParam(searchParams.documentExpiresFrom),
    documentExpiresTo: firstSearchParam(searchParams.documentExpiresTo),
    countryCode: firstSearchParam(searchParams.countryCode),
    documentIssuingCountryCode: firstSearchParam(
      searchParams.documentIssuingCountryCode,
    ),
    sort: firstSearchParam(searchParams.sort),
    includeDeleted: firstSearchParam(searchParams.includeDeleted),
  });
}

function firstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function personsListPath(query: v1.persons.ListPersonsQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  appendPersonsQueryParams(params, query);
  return `${v1.persons.ROUTES.list}?${params}`;
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

function isDefaultSort(
  query: v1.persons.ListPersonsQuery,
  sort: v1.persons.PersonListSort,
): boolean {
  if (sort === "relevance" && !query.search) {
    return true;
  }

  return sort === (query.search ? "relevance" : "nameAsc");
}
