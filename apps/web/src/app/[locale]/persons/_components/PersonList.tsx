"use client";

import { v1 } from "@repo/api-shared";
import {
  Badge,
  buttonVariants,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import {
  BadgeAlertIcon,
  BadgeCheckIcon,
  CalendarDaysIcon,
  CarFrontIcon,
  CircleAlertIcon,
  EyeIcon,
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
        const detailHref = localizePath(
          `/persons/${encodeURIComponent(person.id)}`,
          routeLocale,
        );

        return (
          <li key={person.id}>
            <Card size="sm">
              <CardHeader className="gap-3 has-data-[slot=card-action]:grid-cols-1 sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
                <div className="flex min-w-0 flex-col gap-1">
                  <CardTitle className="flex justify-between truncate">
                    {fullName}
                    <span className="text-xs font-light text-muted-foreground">
                      {formatDate(person.createdAt, locale)}
                    </span>
                  </CardTitle>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                    <span className="truncate font-medium">{person.email}</span>
                    <span className="truncate font-medium">{person.phone}</span>
                  </div>
                </div>
                <CardAction className="col-start-1 row-span-1 row-start-2 justify-self-start sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-self-end">
                  <div className="flex flex-wrap justify-end gap-2">
                    {person.deletedAt && (
                      <Badge variant="outline">
                        {t("recordStatus.deleted")}
                      </Badge>
                    )}
                    {!person.deletedAt ? (
                      <Link
                        href={detailHref}
                        aria-label={t("actions.viewDetails", {
                          name: fullName,
                        })}
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        <EyeIcon data-icon="inline-start" />
                        {t("actions.view")}
                      </Link>
                    ) : null}
                    <Link
                      href={`mailto:${person.email}`}
                      aria-label={t("actions.emailPerson", { name: fullName })}
                      className={buttonVariants({
                        variant: "ghost",
                        size: "sm",
                      })}
                    >
                      <MailIcon data-icon="inline-start" />
                      {t("actions.email")}
                    </Link>
                    <Link
                      href={`tel:${person.phone}`}
                      aria-label={t("actions.callPerson", { name: fullName })}
                      className={buttonVariants({
                        variant: "ghost",
                        size: "sm",
                      })}
                    >
                      <PhoneIcon data-icon="inline-start" />
                      {t("actions.call")}
                    </Link>
                  </div>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {person.documents.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {person.documents.map((document) => (
                      <DocumentCard
                        key={document.id}
                        document={document}
                        typeText={t(`documentTypes.${document.type}`)}
                        statusText={t(`documentStatuses.${document.status}`)}
                        expirationText={formatDocumentExpiration(
                          document,
                          locale,
                          t("list.noExpirationDate"),
                          t("list.expirationPrefix"),
                        )}
                        expirationLabel={t("fields.documentExpiresOn")}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm text-disabled-foreground">
                    <FileTextIcon
                      aria-hidden="true"
                      className={inlineIconClassName}
                    />
                    {t("list.noDocuments")}
                  </span>
                )}
              </CardContent>
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
  expirationText,
  expirationLabel,
}: {
  document: v1.persons.PersonDocument;
  typeText: string;
  statusText: string;
  expirationText: string;
  expirationLabel: string;
}) {
  const TypeIcon = documentTypeIcons[document.type];
  const StatusIcon = documentStatusIcons[document.status];

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-2.5 text-sm",
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
      <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarDaysIcon
          aria-label={expirationLabel}
          className={inlineIconClassName}
        />
        <span className="truncate font-medium">{expirationText}</span>
      </span>
    </div>
  );
}

function formatDocumentExpiration(
  document: v1.persons.PersonDocument,
  locale: string,
  fallbackText: string,
  prefixText: string,
): string {
  if (!document.expiresOn) {
    return fallbackText;
  }

  const formattedDate = formatDate(document.expiresOn, locale);

  // if (document.status !== "verified") {
  //   return formattedDate;
  // }

  return `${prefixText} ${formattedDate}`;
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
