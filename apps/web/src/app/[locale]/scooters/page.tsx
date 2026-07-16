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
import { ScootersPage } from "./_components/ScootersPage";

const SCOOTERS_PATH = "/scooters";
const SCOOTERS_NEW_PATH = "/scooters/new";
const ADMIN_ROLE = "ADMIN";

interface ScootersRoutePageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: Pick<ScootersRoutePageProps, "params">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return {
    title: messages[locale].appShell.pages.scooters,
  };
}

export default async function ScootersRoutePage({
  params,
  searchParams,
}: ScootersRoutePageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const initialQuery = scootersQueryFromSearchParams(await searchParams);
  const user = await meFromApi();

  if (!user) {
    redirect(
      getLocalizedSignInPath(locale, localizePath(SCOOTERS_PATH, locale)),
    );
  }

  if (!user.roles.includes(ADMIN_ROLE)) {
    notFound();
  }

  const initialList = await scootersFromApi(locale, initialQuery);

  return (
    <ScootersPage
      createHref={localizePath(SCOOTERS_NEW_PATH, locale)}
      initialList={initialList}
      initialQuery={initialQuery}
    />
  );
}

async function scootersFromApi(
  locale: ReturnType<typeof resolveRouteLocale>,
  query: v1.scooters.ListScootersQuery,
): Promise<v1.scooters.ScooterList> {
  const cookieHeader = (await cookies()).toString();

  try {
    return await webApi.fetch(
      scootersListPath(query),
      v1.scooters.scooterListSchema,
      {
        headers: { cookie: cookieHeader },
        cache: "no-store",
      },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(
        getLocalizedSignInPath(locale, localizePath(SCOOTERS_PATH, locale)),
      );
    }
    if (error instanceof ApiError && error.status === 403) {
      notFound();
    }
    throw error;
  }
}

function scootersQueryFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): v1.scooters.ListScootersQuery {
  return v1.scooters.listScootersQuerySchema.parse({
    search: firstSearchParam(searchParams.search),
    powertrainType: firstSearchParam(searchParams.powertrainType),
    registrationStatus: firstSearchParam(searchParams.registrationStatus),
    sort: firstSearchParam(searchParams.sort),
    includeDeleted: firstSearchParam(searchParams.includeDeleted),
  });
}

function firstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function scootersListPath(query: v1.scooters.ListScootersQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  appendScootersQueryParams(params, query);
  return `${v1.scooters.ROUTES.list}?${params}`;
}

function appendScootersQueryParams(
  params: URLSearchParams,
  query: v1.scooters.ListScootersQuery,
) {
  if (query.search) params.set("search", query.search);
  if (query.powertrainType) {
    params.set("powertrainType", query.powertrainType);
  }
  if (query.registrationStatus) {
    params.set("registrationStatus", query.registrationStatus);
  }
  if (query.sort && !isDefaultSort(query, query.sort)) {
    params.set("sort", query.sort);
  }
  if (query.includeDeleted) params.set("includeDeleted", "true");
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
