import { ApiError, v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  getLocalizedSignInPath,
  localizePath,
  resolveRouteLocale,
} from "@/i18n/paths";
import { webApi } from "@/lib/api";
import { meFromApi } from "@/lib/auth-server";
import { ScooterEditForm } from "../../_components/ScooterEditForm";

const SCOOTERS_PATH = "/scooters";
const ADMIN_ROLE = "ADMIN";

interface EditScooterRoutePageProps {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({
  params,
}: EditScooterRoutePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return {
    title: messages[locale].scooters.editPage.title,
  };
}

export default async function EditScooterRoutePage({
  params,
}: EditScooterRoutePageProps) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const editPath = scooterEditPath(id, locale);
  const user = await meFromApi();

  if (!user) {
    redirect(getLocalizedSignInPath(locale, editPath));
  }

  if (!user.roles.includes(ADMIN_ROLE)) {
    notFound();
  }

  const cookieHeader = (await cookies()).toString();
  const [scooter, brands] = await Promise.all([
    scooterFromApi(locale, id, editPath, cookieHeader),
    scooterBrandsFromApi(locale, editPath, cookieHeader),
  ]);

  return (
    <ScooterEditForm
      scooter={scooter}
      scooterHref={localizePath(
        `${SCOOTERS_PATH}/${encodeURIComponent(id)}`,
        locale,
      )}
      brands={brands.items}
    />
  );
}

async function scooterFromApi(
  locale: ReturnType<typeof resolveRouteLocale>,
  id: string,
  editPath: string,
  cookieHeader: string,
): Promise<v1.scooters.Scooter> {
  try {
    return await webApi.fetch(
      v1.scooters.ROUTES.get(id),
      v1.scooters.scooterSchema,
      { headers: { cookie: cookieHeader }, cache: "no-store" },
    );
  } catch (error) {
    handleEditFetchError(error, locale, editPath);
  }
}

async function scooterBrandsFromApi(
  locale: ReturnType<typeof resolveRouteLocale>,
  editPath: string,
  cookieHeader: string,
): Promise<v1.scooterBrands.ScooterBrandList> {
  try {
    return await webApi.fetch(
      v1.scooterBrands.ROUTES.list,
      v1.scooterBrands.scooterBrandListSchema,
      { headers: { cookie: cookieHeader }, cache: "no-store" },
    );
  } catch (error) {
    handleEditFetchError(error, locale, editPath);
  }
}

function handleEditFetchError(
  error: unknown,
  locale: ReturnType<typeof resolveRouteLocale>,
  editPath: string,
): never {
  if (error instanceof ApiError && error.status === 401) {
    redirect(getLocalizedSignInPath(locale, editPath));
  }
  if (
    error instanceof ApiError &&
    (error.status === 403 || error.status === 404)
  ) {
    notFound();
  }
  throw error;
}

function scooterEditPath(
  id: string,
  locale: ReturnType<typeof resolveRouteLocale>,
): string {
  return localizePath(
    `${SCOOTERS_PATH}/${encodeURIComponent(id)}/edit`,
    locale,
  );
}
