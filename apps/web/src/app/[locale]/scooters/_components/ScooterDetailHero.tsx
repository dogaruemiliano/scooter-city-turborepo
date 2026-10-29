"use client";

import { v1 } from "@repo/api-shared";
import { tokens } from "@repo/theme";
import { Badge, badgeVariants } from "@repo/ui/components/badge";
import { RegistrationPlate } from "@repo/ui/components/registration-plate";
import { Odometer } from "@repo/ui/components/odometer";
import { Button } from "@repo/ui/components/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@repo/ui/components/popover";
import { cn } from "@repo/ui/lib/utils";
import { GaugeIcon, TriangleAlertIcon, IdCardIcon } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ComponentProps, type ReactNode } from "react";
import { webApi } from "@/lib/api";

export function ScooterDetailHero({
  scooter,
}: {
  scooter: v1.scooters.Scooter;
}) {
  const t = useTranslations("scooters");
  const locale = useLocale();
  const readiness = v1.scooters.scooterReadinessIssues(scooter);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const code = v1.scooters.scooterDisplayCode(scooter);
  const src = scooter.coverUrl ? webApi.url(scooter.coverUrl) : null;
  const mileage =
    scooter.currentMileageKm == null
      ? null
      : new Intl.NumberFormat(locale).format(scooter.currentMileageKm);

  const equipment = [
    {
      key: "gps",
      value: scooter.hasGps,
      icon: "/icons/satellite.svg",
      label: t(
        scooter.hasGps == null
          ? "detail.hero.gpsUnknown"
          : scooter.hasGps
            ? "detail.hero.gpsPresent"
            : "detail.hero.gpsAbsent",
      ),
    },
    {
      key: "phoneStand",
      value: scooter.hasPhoneStand,
      icon: "/icons/phone-stand.svg",
      label: t(
        scooter.hasPhoneStand == null
          ? "detail.hero.phoneStandUnknown"
          : scooter.hasPhoneStand
            ? "detail.hero.phoneStandPresent"
            : "detail.hero.phoneStandAbsent",
      ),
    },
    {
      key: "chargingOutlet",
      value: scooter.hasChargingOutlet,
      icon: "/icons/power.svg",
      label: t(
        scooter.hasChargingOutlet == null
          ? "detail.hero.chargingOutletUnknown"
          : scooter.hasChargingOutlet
            ? "detail.hero.chargingOutletPresent"
            : "detail.hero.chargingOutletAbsent",
      ),
    },
  ];
  const speedometerLabel = t(
    scooter.speedometerWorking == null
      ? "detail.hero.speedometerUnknown"
      : scooter.speedometerWorking
        ? "detail.hero.speedometerWorking"
        : "detail.hero.speedometerBroken",
  );
  const maxSpeed =
    scooter.actualMaxSpeedKmh == null
      ? "—"
      : new Intl.NumberFormat(locale).format(scooter.actualMaxSpeedKmh);
  const speedLabel = `${speedometerLabel}. ${t("detail.hero.maxSpeed", { speed: maxSpeed })}`;

  const plate =
    scooter.registrationType === "unregistered"
      ? null
      : scooter.registrationNumber?.trim();
  const plateNumber = plate
    ? (v1.scooters.validatePlateForRegistrationType(
        scooter.registrationType,
        plate,
      )?.displayValue ?? plate)
    : null;

  return (
    <section
      aria-labelledby="scooter-hero-title"
      className="mx-auto w-full max-w-(--breakpoint-md)"
    >
      <div
        data-slot="scooter-hero-image"
        className="relative isolate h-72 w-full sm:h-96"
      >
        <div className="absolute inset-x-0 top-0 z-raised grid grid-cols-2 items-start gap-3">
          <div className="flex min-w-0 flex-col items-start gap-2">
            {scooter.deletedAt ? (
              <Badge variant="outline">{t("recordStatus.deleted")}</Badge>
            ) : null}
            {(scooter.maintenanceHoldCount ?? 0) > 0 ? (
              <Badge variant="destructive">
                {t("detail.hero.nonfunctional")}
              </Badge>
            ) : null}
            {readiness.includes("needsRegistration") ? (
              <Badge variant="warning">
                {scooter.registrationType === "unregistered"
                  ? t("detail.hero.unregistered")
                  : t("readiness.needsRegistration")}
              </Badge>
            ) : null}
            {readiness.includes("needsCiv") ? (
              <Badge variant="warning">{t("detail.hero.withoutRar")}</Badge>
            ) : null}
          </div>
          <div className="flex min-w-0 justify-end">
            <Badge variant="secondary" iconSize="md">
              <IdCardIcon aria-hidden="true" data-icon="inline-start" />
              {scooter.requiredLicenseCategory === "none"
                ? t("detail.hero.withoutLicense")
                : t("detail.hero.licenseCategory", {
                    category: scooter.requiredLicenseCategory,
                  })}
            </Badge>
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          {src && src !== failedSrc ? (
            <Image
              src={src}
              alt={t("card.photoAlt", { code })}
              fill
              unoptimized
              loading="eager"
              sizes={`(min-width: ${tokens.breakpoints.md}px) ${tokens.breakpoints.md}px, 100vw`}
              className="object-contain"
              onError={() => setFailedSrc(src)}
            />
          ) : (
            <div
              role="img"
              aria-label={t("card.noPhoto")}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Image
                src="/scooter-placeholder.png"
                alt=""
                aria-hidden="true"
                fill
                sizes={`(min-width: ${tokens.breakpoints.md}px) ${tokens.breakpoints.md}px, 100vw`}
                className="object-contain"
                style={{ opacity: tokens.opacity.imagePlaceholder }}
              />
              <div className="relative flex max-w-48 flex-col gap-2 px-3 text-center text-foreground dark:text-image-grid-outline sm:max-w-64">
                <span className="text-xl font-bold leading-tight sm:text-2xl">
                  {src
                    ? t("card.photoUnavailable")
                    : t("detail.hero.noImageUploaded")}
                </span>
                <span className="text-xs leading-snug sm:text-sm">
                  {t("detail.hero.coverImageHint")}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-raised flex -translate-y-1/2 items-center justify-between gap-3">
          <OperationalIndicator
            label={speedLabel}
            className={
              scooter.speedometerWorking == null
                ? "text-warning"
                : scooter.speedometerWorking
                  ? "text-foreground"
                  : "text-destructive"
            }
          >
            <span className="relative flex flex-col items-center">
              <span className="relative block">
                <GaugeIcon aria-hidden="true" className="size-20" />
                <span
                  aria-hidden="true"
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-sm bg-background px-1 font-mono text-lg font-semibold leading-tight tabular-nums"
                >
                  {maxSpeed}
                </span>
              </span>
              <span aria-hidden="true" className="text-xs">
                km/h
              </span>
            </span>
          </OperationalIndicator>
          <div className="flex flex-col items-center gap-1">
            {equipment.map((item) => (
              <OperationalIndicator
                key={item.key}
                label={item.label}
                size="icon"
                className={cn(
                  badgeVariants({
                    variant:
                      item.value == null
                        ? "warning"
                        : item.value
                          ? "success"
                          : "destructive",
                  }),
                  "size-9 min-h-9 min-w-9 rounded-sm p-0 md:size-11 md:min-h-11 md:min-w-11",
                  item.value == null
                    ? "hover:bg-warning-subtle aria-expanded:bg-warning-subtle"
                    : item.value
                      ? "hover:bg-success-subtle aria-expanded:bg-success-subtle"
                      : "hover:bg-destructive-subtle aria-expanded:bg-destructive-subtle",
                )}
              >
                <span
                  aria-hidden="true"
                  className="block size-6 bg-current"
                  style={{
                    maskImage: `url(${item.icon})`,
                    maskSize: "contain",
                    maskPosition: "center",
                    maskRepeat: "no-repeat",
                  }}
                />
              </OperationalIndicator>
            ))}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-raised grid grid-cols-2 items-end gap-3">
          <div className="flex min-w-0 items-center gap-2 justify-self-start">
            <Odometer
              value={scooter.currentMileageKm}
              readingLabel={
                mileage === null
                  ? `${t("detail.hero.totalKilometers")}: ${t("detail.emptyValue")}`
                  : t("list.mileageValue", { km: mileage })
              }
            />
            {scooter.odometerWorking === false ? (
              <OperationalIndicator
                label={t("detail.hero.odometerBroken")}
                className="shrink-0 text-warning"
              >
                <TriangleAlertIcon aria-hidden="true" className="size-5" />
              </OperationalIndicator>
            ) : null}
          </div>
          <div className="flex min-w-0 justify-end text-right">
            {plateNumber && scooter.registrationType !== "unregistered" ? (
              <RegistrationPlate
                number={plateNumber}
                variant={scooter.registrationType}
                readingLabel={`${t(`registrationTypes.${scooter.registrationType}`)}: ${plateNumber}`}
              />
            ) : scooter.registrationType !== "unregistered" ? (
              <span className="text-sm text-muted-foreground">
                {t("list.registrationMissing")}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-6 flex min-w-0 flex-col items-center gap-2 text-center">
        <h1
          id="scooter-hero-title"
          className="break-words text-4xl font-bold leading-tight tabular-nums sm:text-5xl"
        >
          {code}
        </h1>
        <p className="break-words text-sm text-muted-foreground">
          {[scooter.brand, scooter.model ?? scooter.commercialName]
            .filter(Boolean)
            .join(" ")}
        </p>
      </div>
    </section>
  );
}

function OperationalIndicator({
  label,
  className,
  children,
  size,
}: {
  label: string;
  className: string;
  children: ReactNode;
  size?: ComponentProps<typeof Button>["size"];
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size={size}
            aria-label={label}
            title={label}
            className={cn("pointer-events-auto h-auto w-auto p-1", className)}
          />
        }
      >
        {children}
      </PopoverTrigger>
      <PopoverContent aria-label={label}>{label}</PopoverContent>
    </Popover>
  );
}
