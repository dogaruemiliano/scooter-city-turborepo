"use client";

import { v1 } from "@repo/api-shared";
import { Badge, Card, CardHeader, CardTitle } from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import {
  BatteryChargingIcon,
  CarFrontIcon,
  CalendarIcon,
  GaugeIcon,
  IdCardIcon,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { localizePath, resolveRouteLocale } from "@/i18n/paths";

interface ScooterListProps {
  items: v1.scooters.Scooter[];
}

const inlineIconClassName = "size-4 shrink-0";

export function ScooterList({ items }: ScooterListProps) {
  const t = useTranslations("scooters");
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
      {items.map((scooter) => {
        const title = `${scooter.brand} ${scooter.model}`;
        const canOpenDetail = !scooter.deletedAt;
        const detailHref = localizePath(
          `/scooters/${encodeURIComponent(scooter.id)}`,
          routeLocale,
        );

        return (
          <li
            key={scooter.id}
            className={cn(
              canOpenDetail &&
                "group/scooter-card relative rounded-xl focus-within:ring-2 focus-within:ring-ring",
            )}
          >
            {canOpenDetail ? (
              <Link
                href={detailHref}
                aria-label={t("actions.viewDetails", { name: title })}
                className="absolute inset-0 rounded-xl outline-none"
              >
                <span aria-hidden="true" />
              </Link>
            ) : null}
            <Card
              size="sm"
              className={cn(
                canOpenDetail &&
                  "pointer-events-none transition-colors group-hover/scooter-card:bg-muted",
              )}
            >
              <CardHeader className="gap-3">
                <div className="flex min-w-0 flex-col gap-2">
                  <CardTitle className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate">{title}</span>
                    <span className="shrink-0 text-xs font-light text-muted-foreground">
                      {formatDate(scooter.createdAt, locale)}
                    </span>
                  </CardTitle>

                  <div className="grid min-w-0 gap-2 text-sm text-muted-foreground sm:grid-cols-2 md:grid-cols-12 md:items-start md:gap-x-3 md:gap-y-1.5 lg:gap-x-4">
                    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 font-medium text-foreground sm:col-span-2 md:col-span-4">
                      <CarFrontIcon
                        aria-hidden="true"
                        className={inlineIconClassName}
                      />
                      <span className="truncate">{scooter.vin}</span>
                    </span>
                    <span className="min-w-0 truncate md:col-span-2">
                      {scooter.color}
                    </span>
                    <span className="md:col-span-1">
                      {scooter.manufactureYear}
                    </span>
                    <span className="inline-flex min-w-0 items-center gap-1.5 md:col-span-2">
                      <CalendarIcon
                        aria-hidden="true"
                        className={inlineIconClassName}
                      />
                      <span className="truncate">
                        {formatDate(scooter.purchasedOn, locale)}
                      </span>
                    </span>
                    {scooter.plateNumber ? (
                      <span className="inline-flex min-w-0 items-center gap-1.5 md:col-span-2">
                        <IdCardIcon
                          aria-hidden="true"
                          className={inlineIconClassName}
                        />
                        <span className="truncate">{scooter.plateNumber}</span>
                      </span>
                    ) : null}

                    <div className="flex min-w-0 flex-wrap gap-2 sm:col-span-2 md:col-span-3 md:justify-end">
                      <PowertrainBadge scooter={scooter} />
                      <Badge variant="outline">
                        {t(`registrationTypes.${scooter.registrationType}`)}
                      </Badge>
                      {scooter.deletedAt ? (
                        <Badge variant="outline">
                          {t("recordStatus.deleted")}
                        </Badge>
                      ) : null}
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

function PowertrainBadge({ scooter }: { scooter: v1.scooters.Scooter }) {
  const t = useTranslations("scooters");
  const Icon =
    scooter.powertrainType === "electric" ? BatteryChargingIcon : GaugeIcon;

  return (
    <Badge variant="outline">
      <Icon aria-hidden="true" data-icon="inline-start" />
      {scooter.powertrainType === "combustion" && scooter.engineCc
        ? t("list.ccValue", { cc: scooter.engineCc })
        : t(`powertrainTypes.${scooter.powertrainType}`)}
    </Badge>
  );
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
