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
import { PersonEditForm } from "../../_components/PersonEditForm";

const PERSONS_PATH = "/persons";
const ADMIN_ROLE = "ADMIN";

interface EditPersonRoutePageProps {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({
  params,
}: EditPersonRoutePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return {
    title: messages[locale].persons.editPage.title,
  };
}

export default async function EditPersonRoutePage({
  params,
}: EditPersonRoutePageProps) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const editPath = localizePath(
    `${PERSONS_PATH}/${encodeURIComponent(id)}/edit`,
    locale,
  );
  const user = await meFromApi();

  if (!user) {
    redirect(getLocalizedSignInPath(locale, editPath));
  }

  if (!user.roles.includes(ADMIN_ROLE)) {
    notFound();
  }

  const cookieHeader = (await cookies()).toString();
  let person: v1.persons.Person;

  try {
    person = await webApi.fetch(
      v1.persons.ROUTES.get(id),
      v1.persons.personSchema,
      { headers: { cookie: cookieHeader }, cache: "no-store" },
    );
  } catch (error) {
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

  return (
    <PersonEditForm
      person={person}
      personHref={localizePath(
        `${PERSONS_PATH}/${encodeURIComponent(id)}`,
        locale,
      )}
    />
  );
}
