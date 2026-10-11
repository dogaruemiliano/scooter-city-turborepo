"use client";

import { v1 } from "@repo/api-shared";
import { tokens } from "@repo/theme";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import {
  CalendarClockIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  EllipsisIcon,
  EyeIcon,
  GaugeIcon,
  ImageIcon,
  KeyRoundIcon,
  OctagonAlertIcon,
  PencilIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { localizePath, resolveRouteLocale } from "@/i18n/paths";

// Presentation only: the list API does not yet supply these fields. Missing
// rental/inspection data must never imply availability or roadworthiness.
export interface ScooterCardDetails {
  photoUrl?: string | null;
  rentalStatus?: "available" | "rented" | "reserved" | "maintenance" | null;
  technicalHealth?: "healthy" | "minor" | "major" | "critical" | null;
  renterName?: string | null;
  /** Calendar date in YYYY-MM-DD format. */
  nextPaymentDate?: string | null;
}

const rentalStyles = {
  available: "bg-success-subtle text-success",
  rented: "bg-info-subtle text-info",
  reserved: "bg-accent text-accent-foreground",
  maintenance: "bg-warning-subtle text-foreground",
  unknown: "bg-muted text-muted-foreground",
};
const healthStyles = {
  healthy: "bg-success-subtle text-success",
  minor: "bg-warning-subtle text-foreground",
  major: "bg-destructive-subtle text-destructive",
  critical: "bg-destructive text-destructive-foreground",
  unknown: "bg-muted text-muted-foreground",
};
const rentalIcons = {
  available: CircleCheckIcon,
  rented: KeyRoundIcon,
  reserved: CalendarClockIcon,
  maintenance: WrenchIcon,
  unknown: CircleHelpIcon,
};
const healthIcons = {
  healthy: ShieldCheckIcon,
  minor: TriangleAlertIcon,
  major: TriangleAlertIcon,
  critical: OctagonAlertIcon,
  unknown: CircleHelpIcon,
};

function ScooterPhoto({ src, code }: { src?: string | null; code: string }) {
  const t = useTranslations("scooters.card");
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <div className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted sm:h-32 sm:w-36">
      {src && src !== failedSrc ? (
        <Image
          src={src}
          alt={t("photoAlt", { code })}
          fill
          // Photo storage is not connected yet; allow supplied preview URLs
          // without assuming an optimization host or stripping authentication.
          unoptimized
          sizes={`(min-width: ${tokens.breakpoints.sm}px) ${tokens.spacing[36]}px, ${tokens.spacing[24]}px`}
          className="object-contain p-2"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span className="flex flex-col items-center gap-2 px-2 text-center text-xs text-muted-foreground">
          <ImageIcon aria-hidden="true" className="size-6" />
          {src ? t("photoUnavailable") : t("noPhoto")}
        </span>
      )}
    </div>
  );
}

export function ScooterCard({
  scooter,
  details = {},
}: {
  scooter: v1.scooters.ScooterListItem;
  details?: ScooterCardDetails;
}) {
  const t = useTranslations("scooters");
  const locale = useLocale();
  const routeLocale = resolveRouteLocale(locale);
  const code = v1.scooters.scooterDisplayCode(scooter);
  const href = localizePath(
    `/scooters/${encodeURIComponent(scooter.id)}`,
    routeLocale,
  );
  const rental = details.rentalStatus ?? "unknown";
  const health = details.technicalHealth ?? "unknown";
  const RentalIcon = rentalIcons[rental];
  const HealthIcon = healthIcons[health];
  const model = [scooter.brand, scooter.model ?? scooter.commercialName]
    .filter(Boolean)
    .join(" ");
  const attention = [
    ...(scooter.insuranceAttention
      ? [t(`list.attention.insurance.${scooter.insuranceAttention}`)]
      : []),
    ...(scooter.speedometerWorking === false
      ? [t("list.attention.speedometer")]
      : []),
    ...(scooter.odometerWorking === false
      ? [t("list.attention.odometer")]
      : []),
  ];
  const powertrain =
    (scooter.powertrainType === "combustion" ||
      scooter.powertrainType === "hybrid") &&
    scooter.engineDisplacementCc
      ? `${t("list.ccValue", { cc: scooter.engineDisplacementCc })}${scooter.powertrainType === "hybrid" ? ` · ${t("powertrainTypes.hybrid")}` : ""}`
      : t(`powertrainTypes.${scooter.powertrainType}`);
  const mileage =
    scooter.currentMileageKm == null
      ? null
      : new Intl.NumberFormat(locale).format(scooter.currentMileageKm);
  const paymentDate = details.nextPaymentDate
    ? new Date(`${details.nextPaymentDate}T00:00:00Z`)
    : null;
  const paymentLabel =
    paymentDate && !Number.isNaN(paymentDate.getTime())
      ? new Intl.DateTimeFormat(locale, {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(paymentDate)
      : null;

  return (
    <article className="relative isolate flex h-full min-w-0 flex-col rounded-xl border border-border bg-card text-card-foreground transition-colors duration-fast hover:border-border-strong">
      {!scooter.deletedAt ? (
        <Link
          href={href}
          aria-label={t("actions.viewDetails", { name: code })}
          className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : null}
      <div className="pointer-events-none flex flex-1 flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <ScooterPhoto src={details.photoUrl} code={code} />
          <div className="min-w-0 flex-1 py-1">
            <div className="flex min-w-0 flex-col items-start gap-1">
              <h2 className="text-xl font-semibold leading-tight tabular-nums">
                {code}
              </h2>
              <span
                className={cn(
                  "min-w-0 break-words text-sm",
                  scooter.registrationNumber
                    ? "font-medium"
                    : "text-muted-foreground",
                )}
              >
                {scooter.registrationNumber ??
                  (scooter.registrationType === "unregistered"
                    ? t("registrationTypes.unregistered")
                    : t("list.registrationMissing"))}
              </span>
            </div>
            <p className="mt-2 break-words text-sm text-muted-foreground">
              {model}
            </p>
            {scooter.deletedAt ? (
              <Badge variant="outline" className="mt-2">
                {t("recordStatus.deleted")}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {scooter.color ? <span>{scooter.color}</span> : null}
          <span>{powertrain}</span>
          <span>
            {t("list.licenceValue", {
              category: t(
                `requiredDriverLicenseTypes.${scooter.requiredLicenseCategory}`,
              ),
            })}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4">
          <div className="min-w-0">
            <dt className="mb-2 text-xs text-muted-foreground">
              {t("card.rentalLabel")}
            </dt>
            <dd
              className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-2 sm:gap-2 sm:px-3 text-sm font-medium",
                rentalStyles[rental],
              )}
            >
              <RentalIcon aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0 break-words">
                {t(`card.rental.${rental}`)}
              </span>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="mb-2 text-xs text-muted-foreground">
              {t("card.healthLabel")}
            </dt>
            <dd
              className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-2 sm:gap-2 sm:px-3 text-sm font-medium",
                healthStyles[health],
              )}
            >
              <HealthIcon aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0 break-words">
                {t(`card.health.${health}`)}
              </span>
            </dd>
          </div>
        </dl>
        {attention.length ? (
          <p className="flex items-start gap-2 text-sm">
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-warning"
            />
            <span>{attention.join(" · ")}</span>
          </p>
        ) : null}
      </div>
      <div className="pointer-events-none flex flex-wrap items-center justify-between gap-4 border-t border-border px-4 py-3 sm:px-5">
        <dl className="flex min-w-0 flex-wrap gap-x-6 gap-y-3">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">
              {t("card.renterLabel")}
            </dt>
            <dd
              className={cn(
                "mt-1 break-words text-sm",
                !details.renterName && "text-muted-foreground",
              )}
            >
              {details.renterName || t("card.notRecorded")}
            </dd>
          </div>
          {rental === "rented" ? (
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("card.paymentLabel")}
              </dt>
              <dd className="mt-1 text-sm tabular-nums">
                {paymentLabel ? (
                  <time dateTime={details.nextPaymentDate!}>
                    {paymentLabel}
                  </time>
                ) : (
                  t("card.notRecorded")
                )}
              </dd>
            </div>
          ) : null}
        </dl>
        {mileage !== null ? (
          <span
            className="inline-flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground"
            aria-label={t("list.mileageValue", { km: mileage })}
          >
            <GaugeIcon aria-hidden="true" className="size-4 shrink-0" />
            {t("list.kmValue", { km: mileage })}
          </span>
        ) : null}
        {!scooter.deletedAt ? (
          <div className="pointer-events-auto relative shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("card.quickActions", { code })}
                  />
                }
              >
                <EllipsisIcon aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-48">
                <DropdownMenuItem render={<Link href={href} />}>
                  <EyeIcon aria-hidden="true" />
                  {t("card.openDetails")}
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href={`${href}/edit`} />}>
                  <PencilIcon aria-hidden="true" />
                  {t("actions.editScooter")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>
    </article>
  );
}
