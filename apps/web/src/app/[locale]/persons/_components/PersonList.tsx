"use client";

import { v1 } from "@repo/api-shared";
import { Badge, Card, CardHeader, CardTitle } from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import {
  BadgeAlertIcon,
  BadgeCheckIcon,
  CarFrontIcon,
  CircleAlertIcon,
  FileTextIcon,
  IdCardIcon,
  MailIcon,
  PhoneIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { localizePath, resolveRouteLocale } from "@/i18n/paths";

interface PersonListProps {
  items: v1.persons.Person[];
}

const inlineIconClassName = "size-4 shrink-0";
const documentStatusClasses = {
  unverified: "border-warning-subtle text-warning",
  verified: "border-success-subtle text-success",
  rejected: "border-destructive-subtle text-destructive",
  expired: "border-destructive-subtle text-destructive",
} as const satisfies Record<v1.persons.PersonDocumentStatus, string>;
const documentStatusIcons = {
  unverified: CircleAlertIcon,
  verified: BadgeCheckIcon,
  rejected: BadgeAlertIcon,
  expired: BadgeAlertIcon,
} as const satisfies Record<v1.persons.PersonDocumentStatus, LucideIcon>;
const documentTypeIcons = {
  passport: IdCardIcon,
  nationalId: IdCardIcon,
  driverLicense: CarFrontIcon,
  residencePermit: IdCardIcon,
  other: FileTextIcon,
} as const satisfies Record<v1.persons.PersonDocumentType, LucideIcon>;

export function PersonList({ items }: PersonListProps) {
  const t = useTranslations("persons");
  const locale = useLocale();
  const routeLocale = resolveRouteLocale(locale);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {t("list.empty")}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((person) => {
        const fullName = `${person.firstName} ${person.lastName}`;
        const canOpenDetail = !person.deletedAt;
        const detailHref = localizePath(
          `/persons/${encodeURIComponent(person.id)}`,
          routeLocale,
        );

        return (
          <li
            key={person.id}
            className={cn(
              canOpenDetail &&
                "group/person-card relative rounded-xl focus-within:ring-2 focus-within:ring-ring",
            )}
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
            <Card
              size="sm"
              className={cn(
                canOpenDetail &&
                  "pointer-events-none transition-colors group-hover/person-card:bg-muted",
              )}
            >
              <CardHeader className="gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <CardTitle className="flex items-start justify-between gap-2">
                    <span className="truncate">{fullName}</span>
                    <span className="text-xs font-light text-muted-foreground">
                      {formatDate(person.createdAt, locale)}
                    </span>
                  </CardTitle>
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground md:flex-1">
                      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 font-medium">
                        <MailIcon
                          aria-hidden="true"
                          className={inlineIconClassName}
                        />
                        <span className="truncate">{person.email}</span>
                      </span>
                      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 font-medium">
                        <PhoneIcon
                          aria-hidden="true"
                          className={inlineIconClassName}
                        />
                        <span className="truncate">{person.phone}</span>
                      </span>
                      {person.deletedAt && (
                        <Badge variant="outline">
                          {t("recordStatus.deleted")}
                        </Badge>
                      )}
                    </div>
                    <div className="min-w-0 md:flex md:flex-1 md:justify-end">
                      {person.documents.length > 0 ? (
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap md:justify-end">
                          {person.documents.map((document) => (
                            <DocumentCard
                              key={document.id}
                              document={document}
                              typeText={t(`documentTypes.${document.type}`)}
                              statusText={t(
                                `documentStatuses.${document.status}`,
                              )}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm text-disabled-foreground md:justify-end">
                          <FileTextIcon
                            aria-hidden="true"
                            className={inlineIconClassName}
                          />
                          {t("list.noDocuments")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function DocumentCard({
  document,
  typeText,
  statusText,
}: {
  document: v1.persons.PersonDocument;
  typeText: string;
  statusText: string;
}) {
  const TypeIcon = documentTypeIcons[document.type];
  const StatusIcon = documentStatusIcons[document.status];

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg border p-2.5 text-sm",
        documentStatusClasses[document.status],
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground">
          <TypeIcon aria-label={typeText} className={inlineIconClassName} />
          <span className="truncate font-medium">{typeText}</span>
        </span>
        <Badge
          variant="outline"
          className={cn("shrink-0", documentStatusClasses[document.status])}
        >
          <StatusIcon aria-label={statusText} data-icon="inline-start" />
          {statusText}
        </Badge>
      </div>
    </div>
  );
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
