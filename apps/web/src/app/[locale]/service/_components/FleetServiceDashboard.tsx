"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components";
import {
  AlertTriangleIcon,
  BikeIcon,
  CalendarClockIcon,
  CircleAlertIcon,
  GaugeIcon,
  ShieldAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useState, type ReactNode } from "react";

import { InfiniteListFooter } from "@/components/InfiniteListFooter";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { webApi } from "@/lib/api";

interface FleetServiceDashboardProps {
  dashboard: v1.maintenance.FleetMaintenanceDashboard;
  initialIssues: v1.maintenance.FleetIssueList;
  initialSchedule: v1.maintenance.ServiceScheduleList;
}

interface ListLoadingState {
  issues: boolean;
  schedule: boolean;
}

interface ListErrorState {
  issues: string | null;
  schedule: string | null;
}

export function FleetServiceDashboard({
  dashboard,
  initialIssues,
  initialSchedule,
}: FleetServiceDashboardProps) {
  const t = useTranslations("service");
  const locale = useLocale();
  const routeLocale = resolveRouteLocale(locale);
  const [issues, setIssues] = useState(initialIssues);
  const [schedule, setSchedule] = useState(initialSchedule);
  const [loading, setLoading] = useState<ListLoadingState>({
    issues: false,
    schedule: false,
  });
  const [errors, setErrors] = useState<ListErrorState>({
    issues: null,
    schedule: null,
  });

  const loadMoreIssues = useCallback(async () => {
    if (loading.issues || issues.items.length >= issues.total) return;

    setLoading((current) => ({ ...current, issues: true }));
    setErrors((current) => ({ ...current, issues: null }));
    try {
      const nextPage = issues.page + 1;
      const next = await webApi.fetch(
        `${v1.maintenance.ROUTES.issues.fleetList}?page=${nextPage}&pageSize=${issues.pageSize}&status=OPEN`,
        v1.maintenance.fleetIssueListSchema,
        { cache: "no-store" },
      );
      setIssues((current) => ({
        ...next,
        items: [...current.items, ...next.items],
      }));
    } catch (error) {
      setErrors((current) => ({
        ...current,
        issues: errorMessage(error, t("feedback.genericError")),
      }));
    } finally {
      setLoading((current) => ({ ...current, issues: false }));
    }
  }, [issues, loading.issues, t]);

  const loadMoreSchedule = useCallback(async () => {
    if (loading.schedule || schedule.items.length >= schedule.total) return;

    setLoading((current) => ({ ...current, schedule: true }));
    setErrors((current) => ({ ...current, schedule: null }));
    try {
      const nextPage = schedule.page + 1;
      const next = await webApi.fetch(
        `${v1.maintenance.ROUTES.schedule}?page=${nextPage}&pageSize=${schedule.pageSize}`,
        v1.maintenance.serviceScheduleListSchema,
        { cache: "no-store" },
      );
      setSchedule((current) => ({
        ...next,
        items: [...current.items, ...next.items],
      }));
    } catch (error) {
      setErrors((current) => ({
        ...current,
        schedule: errorMessage(error, t("feedback.genericError")),
      }));
    } finally {
      setLoading((current) => ({ ...current, schedule: false }));
    }
  }, [loading.schedule, schedule, t]);

  return (
    <main className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("dashboard.description")}
        </p>
      </header>

      <section
        aria-label={t("dashboard.stats.label")}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <DashboardStat
          icon={<BikeIcon aria-hidden="true" />}
          label={t("dashboard.stats.total")}
          value={dashboard.totalScooters}
        />
        <DashboardStat
          icon={<CircleAlertIcon aria-hidden="true" />}
          label={t("dashboard.stats.openIssues")}
          value={dashboard.scootersWithOpenIssues}
        />
        <DashboardStat
          icon={<ShieldAlertIcon aria-hidden="true" />}
          label={t("dashboard.stats.blocking")}
          value={dashboard.scootersWithBlockingIssues}
          destructive={dashboard.scootersWithBlockingIssues > 0}
        />
        <DashboardStat
          icon={<AlertTriangleIcon aria-hidden="true" />}
          label={t("dashboard.stats.overdue")}
          value={dashboard.scootersWithOverdueMaintenance}
          destructive={dashboard.scootersWithOverdueMaintenance > 0}
        />
        <DashboardStat
          icon={<CalendarClockIcon aria-hidden="true" />}
          label={t("dashboard.stats.dueSoon")}
          value={dashboard.scootersWithMaintenanceDueSoon}
        />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <ServiceQueueCard
          title={t("issues.title")}
          description={t("issues.description", { count: issues.total })}
          empty={t("issues.empty")}
          isEmpty={issues.items.length === 0}
        >
          <ul className="flex flex-col gap-2">
            {issues.items.map((item) => (
              <IssueQueueItem
                key={item.issue.id}
                item={item}
                routeLocale={routeLocale}
              />
            ))}
          </ul>
          <InfiniteListFooter
            hasMore={issues.items.length < issues.total}
            loading={loading.issues}
            error={errors.issues}
            onLoadMore={loadMoreIssues}
          />
        </ServiceQueueCard>

        <ServiceQueueCard
          title={t("schedule.title")}
          description={t("schedule.description", { count: schedule.total })}
          empty={t("schedule.empty")}
          isEmpty={schedule.items.length === 0}
        >
          <ul className="flex flex-col gap-2">
            {schedule.items.map((item) => (
              <ScheduleQueueItem
                key={item.latestRecord.id}
                item={item}
                routeLocale={routeLocale}
              />
            ))}
          </ul>
          <InfiniteListFooter
            hasMore={schedule.items.length < schedule.total}
            loading={loading.schedule}
            error={errors.schedule}
            onLoadMore={loadMoreSchedule}
          />
        </ServiceQueueCard>
      </div>
    </main>
  );
}

function ServiceQueueCard({
  title,
  description,
  empty,
  isEmpty,
  children,
}: {
  title: string;
  description: string;
  empty: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function IssueQueueItem({
  item,
  routeLocale,
}: {
  item: v1.maintenance.FleetIssueItem;
  routeLocale: ReturnType<typeof resolveRouteLocale>;
}) {
  const t = useTranslations("service");

  return (
    <li>
      <Link
        href={scooterHref(item.scooter.id, routeLocale)}
        className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {item.issue.title}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {item.scooter.brand} {item.scooter.model} · {item.scooter.vin}
            </span>
          </span>
          <Badge variant={severityVariant(item.issue.severity)}>
            {t(`issueSeverities.${item.issue.severity}`)}
          </Badge>
        </span>
        <span className="text-xs text-muted-foreground">
          {t("issues.reportedAt", {
            date: formatDate(item.issue.reportedAt, routeLocale),
          })}
        </span>
      </Link>
    </li>
  );
}

function ScheduleQueueItem({
  item,
  routeLocale,
}: {
  item: v1.maintenance.ServiceScheduleItem;
  routeLocale: ReturnType<typeof resolveRouteLocale>;
}) {
  const t = useTranslations("service");

  return (
    <li>
      <Link
        href={scooterHref(item.scooter.id, routeLocale)}
        className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {item.maintenanceType.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {item.scooter.brand} {item.scooter.model} · {item.scooter.vin}
            </span>
          </span>
          <Badge
            variant={item.status === "OVERDUE" ? "destructive" : "outline"}
          >
            {t(`schedule.statuses.${item.status}`)}
          </Badge>
        </span>
        <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {item.latestRecord.nextDueAt ? (
            <span className="inline-flex items-center gap-1.5">
              <CalendarClockIcon aria-hidden="true" className="size-3.5" />
              {t("schedule.dueAt", {
                date: formatDate(item.latestRecord.nextDueAt, routeLocale),
              })}
            </span>
          ) : null}
          {item.latestRecord.nextDueKm !== null ? (
            <span className="inline-flex items-center gap-1.5">
              <GaugeIcon aria-hidden="true" className="size-3.5" />
              {t("schedule.dueKm", {
                value: item.latestRecord.nextDueKm,
              })}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

function DashboardStat({
  icon,
  label,
  value,
  destructive = false,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  destructive?: boolean;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          {icon}
          {label}
        </CardDescription>
        <CardTitle>
          <Badge variant={destructive ? "destructive" : "secondary"}>
            {value}
          </Badge>
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function scooterHref(
  scooterId: string,
  locale: ReturnType<typeof resolveRouteLocale>,
): string {
  return localizePath(`/scooters/${encodeURIComponent(scooterId)}`, locale);
}

function severityVariant(
  severity: v1.maintenance.ScooterIssueSeverity,
): "destructive" | "secondary" | "outline" {
  if (severity === "HIGH" || severity === "CRITICAL") {
    return "destructive";
  }
  return severity === "MEDIUM" ? "secondary" : "outline";
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}
