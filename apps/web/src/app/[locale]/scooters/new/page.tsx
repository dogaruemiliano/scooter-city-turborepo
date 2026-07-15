import { messages } from "@repo/i18n";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  getLocalizedSignInPath,
  localizePath,
  resolveRouteLocale,
} from "../../../../i18n/paths";
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

  return (
    <ScooterCreateForm scootersHref={localizePath(SCOOTERS_PATH, locale)} />
  );
}
