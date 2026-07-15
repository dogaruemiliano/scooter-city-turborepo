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
import { PersonDetailPage } from "../_components/PersonDetailPage";

const PERSONS_PATH = "/persons";
const ADMIN_ROLE = "ADMIN";

interface PersonRoutePageProps {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({
  params,
}: PersonRoutePageProps): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const detailPath = personDetailPath(id, locale);
  const cookieHeader = (await cookies()).toString();
  const person = await personFromApi(locale, id, detailPath, cookieHeader);

  return {
    title: personTitle(person),
  };
}

export default async function PersonRoutePage({
  params,
}: PersonRoutePageProps) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const detailPath = personDetailPath(id, locale);
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
  const documentPhotos = await documentPhotosFromApi(
    locale,
    person,
    detailPath,
    cookieHeader,
  );

  return (
    <PersonDetailPage
      person={person}
      auditEvents={auditEvents}
      documentPhotos={documentPhotos}
      personsHref={localizePath(PERSONS_PATH, locale)}
    />
  );
}

const personFromApi = cache(async function personFromApi(
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
});

function personDetailPath(
  id: string,
  locale: ReturnType<typeof resolveRouteLocale>,
): string {
  return localizePath(`${PERSONS_PATH}/${encodeURIComponent(id)}`, locale);
}

function personTitle(person: v1.persons.Person): string {
  return `${person.firstName} ${person.lastName}`;
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

async function documentPhotosFromApi(
  locale: ReturnType<typeof resolveRouteLocale>,
  person: v1.persons.Person,
  detailPath: string,
  cookieHeader: string,
): Promise<Record<string, v1.persons.PersonDocumentPhoto[]>> {
  try {
    const entries = await Promise.all(
      person.documents.map(async (document) => {
        const photos = await webApi.fetch(
          v1.persons.ROUTES.documents.photos.list(person.id, document.id),
          v1.persons.personDocumentPhotoListSchema,
          {
            headers: { cookie: cookieHeader },
            cache: "no-store",
          },
        );

        return [document.id, photos] as const;
      }),
    );

    return Object.fromEntries(entries);
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
