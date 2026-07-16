import { messages } from "@repo/i18n";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  getLocalizedSignInPath,
  localizePath,
  resolveRouteLocale,
} from "../../../../i18n/paths";
import { meFromApi } from "../../../../lib/auth-server";
import { PersonCreateForm } from "../_components/PersonCreateForm";

const PERSONS_PATH = "/persons";
const PERSONS_NEW_PATH = "/persons/new";
const ADMIN_ROLE = "ADMIN";

interface NewPersonRoutePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: NewPersonRoutePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return {
    title: messages[locale].persons.createPage.title,
  };
}

export default async function NewPersonRoutePage({
  params,
}: NewPersonRoutePageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const user = await meFromApi();

  if (!user) {
    redirect(
      getLocalizedSignInPath(locale, localizePath(PERSONS_NEW_PATH, locale)),
    );
  }

  if (!user.roles.includes(ADMIN_ROLE)) {
    notFound();
  }

  return <PersonCreateForm personsHref={localizePath(PERSONS_PATH, locale)} />;
}
