"use client";

import { v1 } from "@repo/api-shared";
import { Badge } from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { PersonIdentityCard } from "@/components/PersonIdentity";

export function PersonListItem({ person }: { person: v1.persons.Person }) {
  const t = useTranslations("persons");
  const locale = useLocale();
  const routeLocale = resolveRouteLocale(locale);
  const fullName = `${person.firstName} ${person.lastName}`;
  const canOpenDetail = !person.deletedAt;
  const detailHref = localizePath(
    `/persons/${encodeURIComponent(person.id)}`,
    routeLocale,
  );
  return (
    <article
      className={cn(canOpenDetail && "group/person-card relative rounded-xl")}
    >
      {canOpenDetail ? (
        <Link
          href={detailHref}
          aria-label={t("actions.viewDetails", { name: fullName })}
          className="absolute inset-0 rounded-xl outline-none"
        >
          <span aria-hidden="true" />
        </Link>
      ) : null}
      <PersonIdentityCard
        person={person}
        className={cn(
          canOpenDetail &&
            "pointer-events-none transition-colors group-hover/person-card:bg-muted group-focus-within/person-card:bg-muted/60",
        )}
        metadata={
          <>
            <span>{formatDate(person.createdAt, locale)}</span>
            {person.deletedAt ? (
              <Badge variant="outline">{t("recordStatus.deleted")}</Badge>
            ) : null}
          </>
        }
      />
    </article>
  );
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
