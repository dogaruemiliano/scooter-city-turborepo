import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  getLocalizedSignInPath,
  localizePath,
  resolveRouteLocale,
} from "../../../../i18n/paths";
import { webApi } from "../../../../lib/api";
import { meFromApi } from "../../../../lib/auth-server";
import { ScooterCreateForm } from "../_components/ScooterCreateForm";

const SCOOTERS_PATH = "/scooters";
const SCOOTERS_NEW_PATH = "/scooters/new";
const ADMIN_ROLE = "ADMIN";

interface NewScooterRoutePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: NewScooterRoutePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return {
    title: messages[locale].scooters.createPage.title,
  };
}

export default async function NewScooterRoutePage({
  params,
}: NewScooterRoutePageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const user = await meFromApi();

  if (!user) {
    redirect(
      getLocalizedSignInPath(locale, localizePath(SCOOTERS_NEW_PATH, locale)),
    );
  }

  if (!user.roles.includes(ADMIN_ROLE)) {
    notFound();
  }

  const cookieHeader = (await cookies()).toString();
  const brands = await webApi.fetch(
    v1.scooterBrands.ROUTES.list,
    v1.scooterBrands.scooterBrandListSchema,
    { headers: { cookie: cookieHeader }, cache: "no-store" },
  );

  return (
    <ScooterCreateForm
      scootersHref={localizePath(SCOOTERS_PATH, locale)}
      brands={brands.items}
    />
  );
}
