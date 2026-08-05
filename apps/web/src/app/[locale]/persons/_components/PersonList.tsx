"use client";

import { v1 } from "@repo/api-shared";
import { Badge, Card, CardHeader, CardTitle } from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import {
  CarFrontIcon,
  IdCardIcon,
  MailIcon,
  PhoneIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { isPersonDocumentExpired } from "./document-status";

interface PersonListProps {
  items: v1.persons.Person[];
}

const inlineIconClassName = "size-4 shrink-0";
type DocumentIndicatorState =
  | "missing"
  | "valid"
  | "unverified"
  | "expired"
  | "rejected";

const documentIndicatorClasses = {
  missing: "border-border bg-muted text-disabled-foreground",
  valid: "border-success-subtle bg-success-subtle text-success",
  unverified: "border-warning-subtle bg-warning-subtle text-warning",
  expired: "border-destructive-subtle bg-destructive-subtle text-destructive",
  rejected: "border-destructive-subtle bg-destructive-subtle text-destructive",
} as const satisfies Record<DocumentIndicatorState, string>;

export function PersonList({ items }: PersonListProps) {
  const t = useTranslations("persons");
  const locale = useLocale();
  const routeLocale = resolveRouteLocale(locale);
  const documentStateText = {
    missing: t("list.documentNotPresent"),
    valid: t("documentExpiries.valid"),
    unverified: t("documentStatuses.unverified"),
    expired: t("documentStatuses.expired"),
    rejected: t("documentStatuses.rejected"),
  } as const satisfies Record<DocumentIndicatorState, string>;

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
        const activeDocuments = person.documents.filter(
          (document) => !document.deletedAt,
        );
        const identityDocument = activeDocuments.find((document) =>
          v1.persons.isPersonIdentityDocumentType(document.type),
        );
        const driverLicense = activeDocuments.find(
          (document) => document.type === "driverLicense",
        );
        const documentIndicators = [
          {
            key: "identity",
            document: identityDocument,
            icon: IdCardIcon,
            label: t("list.identityDocument"),
          },
          {
            key: "driverLicense",
            document: driverLicense,
            icon: CarFrontIcon,
            label: t("documentTypes.driverLicense"),
          },
        ] as const;

        return (
          <li
            key={person.id}
            className={cn(
              canOpenDetail && "group/person-card relative rounded-xl",
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
                  "pointer-events-none transition-colors group-hover/person-card:bg-muted group-focus-within/person-card:bg-muted/60",
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
                      <div className="flex items-center gap-2 md:justify-end">
                        {documentIndicators.map((indicator) => {
                          const state = getDocumentIndicatorState(
                            indicator.document,
                          );

                          return (
                            <DocumentStatusIndicator
                              key={indicator.key}
                              icon={indicator.icon}
                              label={t("list.documentIndicatorLabel", {
                                document: indicator.label,
                                status: documentStateText[state],
                              })}
                              state={state}
                            />
                          );
                        })}
                      </div>
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

function DocumentStatusIndicator({
  icon: Icon,
  label,
  state,
}: {
  icon: LucideIcon;
  label: string;
  state: DocumentIndicatorState;
}) {
  return (
    <span
      aria-label={label}
      role="img"
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md border",
        documentIndicatorClasses[state],
      )}
    >
      <Icon aria-hidden="true" className={inlineIconClassName} />
    </span>
  );
}

function getDocumentIndicatorState(
  document: v1.persons.PersonDocument | undefined,
): DocumentIndicatorState {
  if (!document) {
    return "missing";
  }

  if (document.status === "rejected") {
    return "rejected";
  }

  if (isPersonDocumentExpired(document)) {
    return "expired";
  }

  return document.status === "verified" ? "valid" : "unverified";
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
