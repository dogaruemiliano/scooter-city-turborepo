"use client";

import { v1 } from "@repo/api-shared";
import { tokens } from "@repo/theme";
import { Badge } from "@repo/ui/components/badge";
import { RegistrationPlate } from "@repo/ui/components/registration-plate";
import { Odometer } from "@repo/ui/components/odometer";
import { IdCardIcon, MotorbikeIcon } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { webApi } from "@/lib/api";

export function ScooterDetailHero({
  scooter,
}: {
  scooter: v1.scooters.Scooter;
}) {
  const t = useTranslations("scooters");
  const locale = useLocale();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const code = v1.scooters.scooterDisplayCode(scooter);
  const src = scooter.coverUrl ? webApi.url(scooter.coverUrl) : null;
  const mileage =
    scooter.currentMileageKm == null
      ? null
      : new Intl.NumberFormat(locale).format(scooter.currentMileageKm);

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
            {scooter.registrationType === "unregistered" ? (
              <Badge variant="warning">{t("detail.hero.unregistered")}</Badge>
            ) : null}
            {scooter.hasCivDocument === false ? (
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
              className="flex flex-col items-center gap-3 text-muted-foreground"
            >
              <MotorbikeIcon aria-hidden="true" className="size-32" />
              <span className="text-sm">
                {src ? t("card.photoUnavailable") : t("card.noPhoto")}
              </span>
            </div>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 z-raised grid grid-cols-2 items-end gap-3">
          <div className="min-w-0 justify-self-start">
            <Odometer
              value={scooter.currentMileageKm}
              readingLabel={
                mileage === null
                  ? `${t("detail.hero.totalKilometers")}: ${t("detail.emptyValue")}`
                  : t("list.mileageValue", { km: mileage })
              }
            />
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
