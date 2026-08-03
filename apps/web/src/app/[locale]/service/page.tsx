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
import { FleetServiceDashboard } from "./_components/FleetServiceDashboard";

const SERVICE_PATH = "/service";
const ADMIN_ROLE = "ADMIN";
const SERVICE_LIST_PAGE_SIZE = 25;

interface ServiceRoutePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: ServiceRoutePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return { title: messages[locale].appShell.pages.service };
}

export default async function ServiceRoutePage({
  params,
}: ServiceRoutePageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const user = await meFromApi();

  if (!user) {
    redirect(
      getLocalizedSignInPath(locale, localizePath(SERVICE_PATH, locale)),
    );
  }

  if (!user.roles.includes(ADMIN_ROLE)) {
    notFound();
  }

  const cookieHeader = (await cookies()).toString();
  const [dashboard, issues, schedule] = await Promise.all([
    serviceDataFromApi(
      locale,
      cookieHeader,
      v1.maintenance.ROUTES.dashboard,
      v1.maintenance.fleetMaintenanceDashboardSchema,
    ),
    serviceDataFromApi(
      locale,
      cookieHeader,
      `${v1.maintenance.ROUTES.issues.fleetList}?page=1&pageSize=${SERVICE_LIST_PAGE_SIZE}&status=OPEN`,
      v1.maintenance.fleetIssueListSchema,
    ),
    serviceDataFromApi(
      locale,
      cookieHeader,
      `${v1.maintenance.ROUTES.schedule}?page=1&pageSize=${SERVICE_LIST_PAGE_SIZE}`,
      v1.maintenance.serviceScheduleListSchema,
    ),
  ]);

  return (
    <FleetServiceDashboard
      dashboard={dashboard}
      initialIssues={issues}
      initialSchedule={schedule}
    />
  );
}

async function serviceDataFromApi<Output>(
  locale: ReturnType<typeof resolveRouteLocale>,
  cookieHeader: string,
  path: string,
  schema: Parameters<typeof webApi.fetch<Output>>[1],
): Promise<Output> {
  try {
    return await webApi.fetch(path, schema, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(
        getLocalizedSignInPath(locale, localizePath(SERVICE_PATH, locale)),
      );
    }
    if (error instanceof ApiError && error.status === 403) {
      notFound();
    }
    throw error;
  }
}
