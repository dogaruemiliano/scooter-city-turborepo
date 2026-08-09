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

  const cookieHeader = (await cookies()).toString();
  const initialList = await scootersFromApi(locale, initialQuery, cookieHeader);
  const initialSoldScooterIds = await soldScooterIdsFromApi(
    initialList.items.map((item) => item.id),
    cookieHeader,
  );

  return (
    <ScootersPage
      createHref={localizePath(SCOOTERS_NEW_PATH, locale)}
      initialList={initialList}
      initialQuery={initialQuery}
      initialSoldScooterIds={initialSoldScooterIds}
    />
  );
}

async function soldScooterIdsFromApi(
  scooterIds: string[],
  cookieHeader: string,
): Promise<string[]> {
  if (scooterIds.length === 0) return [];

  try {
    const params = new URLSearchParams({
      scooterIds: scooterIds.join(","),
      pageSize: String(scooterIds.length),
    });
    const sales = await webApi.fetch(
      `${v1.finance.SCOOTER_SALE_ROUTES.list}?${params}`,
      v1.finance.scooterSaleListSchema,
      { headers: { cookie: cookieHeader }, cache: "no-store" },
    );
    return sales.items
      .filter((sale) => sale.status !== "CANCELLED")
      .map((sale) => sale.scooterId);
  } catch {
    // Non-critical: the "Sold" badge is a convenience indicator, so a
    // failure here should not block rendering the scooter list.
    return [];
  }
}

async function scootersFromApi(
  locale: ReturnType<typeof resolveRouteLocale>,
  query: v1.scooters.ListScootersQuery,
  cookieHeader: string,
): Promise<v1.scooters.ScooterList> {
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
    registrationType: firstSearchParam(searchParams.registrationType),
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
  if (query.registrationType) {
    params.set("registrationType", query.registrationType);
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
