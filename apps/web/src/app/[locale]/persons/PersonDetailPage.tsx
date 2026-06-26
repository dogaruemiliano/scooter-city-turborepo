"use client";

import { v1 } from "@repo/api-shared";
import {
  Badge,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import {
  ArrowLeftIcon,
  BadgeAlertIcon,
  BadgeCheckIcon,
  CalendarDaysIcon,
  CarFrontIcon,
  CircleAlertIcon,
  FileTextIcon,
  IdCardIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

interface PersonDetailPageProps {
  person: v1.persons.Person;
  personsHref: string;
}

type ReadinessIssue =
  | "missingIdentity"
  | "missingDriverLicense"
  | "hasRejected"
  | "hasExpired"
  | "hasUnverified";

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

export function PersonDetailPage({
  person,
  personsHref,
}: PersonDetailPageProps) {
  const t = useTranslations("persons");
  const locale = useLocale();
  const fullName = `${person.firstName} ${person.lastName}`;
  const readiness = getRentalReadiness(person);
  const readinessIsReady = readiness.issues.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-col gap-4">
        <Link
          href={personsHref}
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "w-fit text-muted-foreground",
          )}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {t("actions.backToList")}
        </Link>

        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold">{fullName}</h1>
            <p className="text-sm text-muted-foreground">
              {t("detail.description")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {person.deletedAt
                ? t("recordStatus.deleted")
                : t("recordStatus.active")}
            </Badge>
            <Badge
              variant="outline"
              className={
                readinessIsReady
                  ? "border-success-subtle text-success"
                  : "border-warning-subtle text-warning"
              }
            >
              {readinessIsReady ? (
                <BadgeCheckIcon aria-hidden="true" data-icon="inline-start" />
              ) : (
                <CircleAlertIcon aria-hidden="true" data-icon="inline-start" />
              )}
              {readinessIsReady
                ? t("detail.readiness.readyTitle")
                : t("detail.readiness.reviewTitle")}
            </Badge>
          </div>
        </div>
      </div>

      <section className="grid min-w-0 gap-3 rounded-lg bg-muted p-4 md:grid-cols-3 md:gap-6">
        <div className="flex items-start gap-2">
          {readinessIsReady ? (
            <BadgeCheckIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-success"
            />
          ) : (
            <CircleAlertIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-warning"
            />
          )}
          <h2 className="text-base font-semibold underline md:text-sm">
            {t("detail.readiness.title")}
          </h2>
        </div>
        <div className="md:col-span-2">
          {readinessIsReady ? (
            <p className="text-sm text-muted-foreground">
              {t("detail.readiness.readyDescription")}
            </p>
          ) : (
            <ul className="grid gap-2 text-sm text-muted-foreground">
              {readiness.issues.map((issue) => (
                <li key={issue} className="flex items-start gap-2">
                  <CircleAlertIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-warning"
                  />
                  <span>{t(`detail.readiness.issues.${issue}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <DetailSection
        title={t("detail.sections.profile")}
        icon={
          <UserRoundIcon aria-hidden="true" className={inlineIconClassName} />
        }
      >
        <DetailField label={t("fields.firstName")} value={person.firstName} />
        <DetailField label={t("fields.lastName")} value={person.lastName} />
        <DetailField
          label={t("fields.dateOfBirth")}
          value={formatOptionalDate(
            person.dateOfBirth,
            locale,
            t("detail.emptyValue"),
          )}
        />
        <DetailField label={t("detail.fields.personId")} value={person.id} />
        <DetailField
          label={t("detail.fields.createdAt")}
          value={formatDateTime(person.createdAt, locale)}
        />
        <DetailField
          label={t("detail.fields.updatedAt")}
          value={formatDateTime(person.updatedAt, locale)}
        />
        {person.deletedAt ? (
          <DetailField
            label={t("detail.fields.deletedAt")}
            value={formatDateTime(person.deletedAt, locale)}
          />
        ) : null}
      </DetailSection>

      <DetailSection
        title={t("sections.contact")}
        icon={<MailIcon aria-hidden="true" className={inlineIconClassName} />}
      >
        <DetailField label={t("fields.email")} value={person.email} />
        <DetailField
          label={t("fields.phone")}
          value={person.phone}
          icon={
            <PhoneIcon aria-hidden="true" className={inlineIconClassName} />
          }
        />
      </DetailSection>

      <DetailSection
        title={t("sections.address")}
        icon={<MapPinIcon aria-hidden="true" className={inlineIconClassName} />}
      >
        <DetailField
          label={t("fields.countryCode")}
          value={person.countryCode ?? t("detail.emptyValue")}
        />
        <DetailField
          label={t("fields.region")}
          value={person.region ?? t("detail.emptyValue")}
        />
        <DetailField
          label={t("fields.city")}
          value={person.city ?? t("detail.emptyValue")}
        />
        <DetailField
          label={t("fields.postalCode")}
          value={person.postalCode ?? t("detail.emptyValue")}
        />
        <DetailField
          label={t("fields.addressLine1")}
          value={person.addressLine1 ?? t("detail.emptyValue")}
          className="sm:col-span-2"
        />
        <DetailField
          label={t("fields.addressLine2")}
          value={person.addressLine2 ?? t("detail.emptyValue")}
          className="sm:col-span-2"
        />
      </DetailSection>

      <section className="grid min-w-0 gap-4 rounded-lg bg-muted p-4 md:grid-cols-3 md:gap-6">
        <div className="flex items-start gap-2">
          <FileTextIcon aria-hidden="true" className={inlineIconClassName} />
          <h2 className="text-base font-semibold underline md:text-sm">
            {t("fields.notes")}
          </h2>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground md:col-span-2">
          {person.notes || t("detail.emptyValue")}
        </p>
      </section>

      <section className="grid gap-4">
        <div className="flex items-center gap-2">
          <FileTextIcon aria-hidden="true" className={inlineIconClassName} />
          <h2 className="text-base font-semibold">{t("sections.document")}</h2>
        </div>
        {person.documents.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {person.documents.map((document) => (
              <DocumentDetailCard
                key={document.id}
                document={document}
                locale={locale}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            {t("detail.documents.empty")}
          </div>
        )}
      </section>
    </div>
  );
}

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-4 rounded-lg bg-muted p-4 md:grid-cols-3 md:gap-6">
      <div className="flex items-start gap-2">
        {icon}
        <h2 className="text-base font-semibold underline md:text-sm">
          {title}
        </h2>
      </div>
      <dl className="grid min-w-0 gap-4 sm:grid-cols-2 md:col-span-2">
        {children}
      </dl>
    </section>
  );
}

function DetailField({
  label,
  value,
  icon,
  className,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 gap-1", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5 break-words text-sm font-medium">
        {icon}
        <span className="min-w-0 break-words">{value}</span>
      </dd>
    </div>
  );
}

function DocumentDetailCard({
  document,
  locale,
}: {
  document: v1.persons.PersonDocument;
  locale: string;
}) {
  const t = useTranslations("persons");
  const TypeIcon = documentTypeIcons[document.type];
  const StatusIcon = documentStatusIcons[document.status];

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          <TypeIcon
            aria-label={t(`documentTypes.${document.type}`)}
            className={inlineIconClassName}
          />
          <span className="min-w-0 truncate">
            {t(`documentTypes.${document.type}`)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Badge
          variant="outline"
          className={cn("w-fit", documentStatusClasses[document.status])}
        >
          <StatusIcon
            aria-label={t(`documentStatuses.${document.status}`)}
            data-icon="inline-start"
          />
          {t(`documentStatuses.${document.status}`)}
        </Badge>
        <p className="text-xs text-muted-foreground">
          {t("detail.documents.masked")}
        </p>

        <dl className="grid gap-3 sm:grid-cols-2">
          <DetailField
            label={t("fields.documentSeries")}
            value={document.series ?? t("detail.emptyValue")}
          />
          <DetailField
            label={t("fields.documentNumber")}
            value={maskSensitiveValue(document.number, t("detail.emptyValue"))}
          />
          <DetailField
            label={t("fields.documentCnp")}
            value={maskSensitiveValue(document.cnp, t("detail.emptyValue"))}
          />
          <DetailField
            label={t("fields.documentIssuingCountryCode")}
            value={document.issuingCountryCode ?? t("detail.emptyValue")}
          />
          <DetailField
            label={t("fields.documentIssuedBy")}
            value={document.issuedBy ?? t("detail.emptyValue")}
          />
          <DetailField
            label={t("fields.documentIssuedOn")}
            value={formatOptionalDate(
              document.issuedOn,
              locale,
              t("detail.emptyValue"),
            )}
          />
          <DetailField
            label={t("fields.documentExpiresOn")}
            value={formatOptionalDate(
              document.expiresOn,
              locale,
              t("detail.emptyValue"),
            )}
            icon={
              <CalendarDaysIcon
                aria-hidden="true"
                className={inlineIconClassName}
              />
            }
          />
          <DetailField
            label={t("detail.fields.documentId")}
            value={document.id}
          />
          <DetailField
            label={t("fields.notes")}
            value={document.notes ?? t("detail.emptyValue")}
            className="sm:col-span-2"
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function getRentalReadiness(person: v1.persons.Person): {
  issues: ReadinessIssue[];
} {
  const documents = person.documents.filter((document) => !document.deletedAt);
  const issues: ReadinessIssue[] = [];

  if (
    !documents.some((document) =>
      v1.persons.isPersonIdentityDocumentType(document.type),
    )
  ) {
    issues.push("missingIdentity");
  }

  if (!documents.some((document) => document.type === "driverLicense")) {
    issues.push("missingDriverLicense");
  }

  if (documents.some((document) => document.status === "rejected")) {
    issues.push("hasRejected");
  }

  if (documents.some(isExpiredDocument)) {
    issues.push("hasExpired");
  }

  if (documents.some((document) => document.status === "unverified")) {
    issues.push("hasUnverified");
  }

  return { issues };
}

function isExpiredDocument(document: v1.persons.PersonDocument): boolean {
  if (document.status === "expired") {
    return true;
  }

  if (!document.expiresOn) {
    return false;
  }

  const expiryDate = dateOnlyToUtcTime(document.expiresOn);
  if (expiryDate == null) {
    return false;
  }

  const now = new Date();
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  return expiryDate < today;
}

function dateOnlyToUtcTime(value: string): number | null {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return Date.UTC(year, month - 1, day);
}

function maskSensitiveValue(value: string | null, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const visibleLength = Math.min(4, value.length);
  const hiddenLength = Math.max(4, value.length - visibleLength);

  return `${"*".repeat(hiddenLength)}${value.slice(-visibleLength)}`;
}

function formatOptionalDate(
  value: string | null,
  locale: string,
  fallback: string,
): string {
  return value ? formatDate(value, locale) : fallback;
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
