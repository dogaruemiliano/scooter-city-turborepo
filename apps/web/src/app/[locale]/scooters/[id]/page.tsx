import { ApiError, v1 } from "@repo/api-shared";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import {
  getLocalizedSignInPath,
  localizePath,
  resolveRouteLocale,
} from "@/i18n/paths";
import { webApi } from "@/lib/api";
import { meFromApi } from "@/lib/auth-server";
import { ScooterDetailPage } from "../_components/ScooterDetailPage";

const SCOOTERS_PATH = "/scooters";
const ADMIN_ROLE = "ADMIN";

interface ScooterRoutePageProps {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({
  params,
}: ScooterRoutePageProps): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const detailPath = scooterDetailPath(id, locale);
  const cookieHeader = (await cookies()).toString();
  const scooter = await scooterFromApi(locale, id, detailPath, cookieHeader);

  return {
    title: scooterTitle(scooter),
  };
}

export default async function ScooterRoutePage({
  params,
}: ScooterRoutePageProps) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const detailPath = scooterDetailPath(id, locale);
  const user = await meFromApi();

  if (!user) {
    redirect(getLocalizedSignInPath(locale, detailPath));
  }

  if (!user.roles.includes(ADMIN_ROLE)) {
    notFound();
  }

  const cookieHeader = (await cookies()).toString();
  const scooter = await scooterFromApi(locale, id, detailPath, cookieHeader);

  return (
    <ScooterDetailPage
      scooter={scooter}
      scootersHref={localizePath(SCOOTERS_PATH, locale)}
    />
  );
}

const scooterFromApi = cache(async function scooterFromApi(
  locale: ReturnType<typeof resolveRouteLocale>,
  id: string,
  detailPath: string,
  cookieHeader: string,
): Promise<v1.scooters.Scooter> {
  try {
    return await webApi.fetch(
      v1.scooters.ROUTES.get(id),
      v1.scooters.scooterSchema,
      {
        headers: { cookie: cookieHeader },
        cache: "no-store",
      },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(getLocalizedSignInPath(locale, detailPath));
    }
    if (
      error instanceof ApiError &&
      (error.status === 403 || error.status === 404)
    ) {
      notFound();
    }
    throw error;
  }
});

function scooterDetailPath(
  id: string,
  locale: ReturnType<typeof resolveRouteLocale>,
): string {
  return localizePath(`${SCOOTERS_PATH}/${encodeURIComponent(id)}`, locale);
}

function scooterTitle(scooter: v1.scooters.Scooter): string {
  return `${scooter.brand} ${scooter.model}`;
}
