import { ApiError, v1 } from "@repo/api-shared";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  getLocalizedSignInPath,
  localizePath,
  resolveRouteLocale,
} from "@/i18n/paths";
import { webApi } from "@/lib/api";
import { meFromApi } from "@/lib/auth-server";
import { PersonDetailPage } from "../_components/PersonDetailPage";

const PERSONS_PATH = "/persons";
const ADMIN_ROLE = "ADMIN";

interface PersonRoutePageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function PersonRoutePage({
  params,
}: PersonRoutePageProps) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const detailPath = localizePath(
    `${PERSONS_PATH}/${encodeURIComponent(id)}`,
    locale,
  );
  const user = await meFromApi();

  if (!user) {
    redirect(getLocalizedSignInPath(locale, detailPath));
  }

  if (!user.roles.includes(ADMIN_ROLE)) {
    notFound();
  }

  const cookieHeader = (await cookies()).toString();
  const [person, auditEvents] = await Promise.all([
    personFromApi(locale, id, detailPath, cookieHeader),
    auditEventsFromApi(locale, id, detailPath, cookieHeader),
  ]);

  return (
    <PersonDetailPage
      person={person}
      auditEvents={auditEvents}
      personsHref={localizePath(PERSONS_PATH, locale)}
    />
  );
}

async function personFromApi(
  locale: ReturnType<typeof resolveRouteLocale>,
  id: string,
  detailPath: string,
  cookieHeader: string,
): Promise<v1.persons.Person> {
  try {
    return await webApi.fetch(
      v1.persons.ROUTES.get(id),
      v1.persons.personSchema,
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
}

async function auditEventsFromApi(
  locale: ReturnType<typeof resolveRouteLocale>,
  id: string,
  detailPath: string,
  cookieHeader: string,
): Promise<v1.persons.PersonAuditEvent[]> {
  try {
    return await webApi.fetch(
      v1.persons.ROUTES.auditEvents.list(id),
      v1.persons.personAuditEventListSchema,
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
}
