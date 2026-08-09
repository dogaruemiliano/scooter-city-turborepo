"use client";

import { v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DatePartsField,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@repo/ui/components";
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CheckIcon,
  CircleCheckIcon,
  GaugeIcon,
  PlusIcon,
  RotateCcwIcon,
  WrenchIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, type FormEvent, type ReactNode } from "react";

import { webApi } from "@/lib/api";
import { FeedbackAlert } from "./ScooterCreateForm";

interface ScooterMaintenanceSectionProps {
  scooter: v1.scooters.Scooter;
  overview: v1.maintenance.ScooterMaintenanceOverview;
  maintenanceTypes: v1.maintenance.MaintenanceTypeList;
}

interface MutationFeedback {
  kind: "success" | "error";
  title: string;
  messages: string[];
}

type IssueField = "title" | "description" | "severity";
type RecordField =
  | "maintenanceTypeId"
  | "performedAt"
  | "performedKm"
  | "notes"
  | "nextDueKm"
  | "nextDueAt";

export function ScooterMaintenanceSection({
  scooter,
  overview,
  maintenanceTypes,
}: ScooterMaintenanceSectionProps) {
  const t = useTranslations("scooters");
  const locale = useLocale();
  const router = useRouter();
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [issueDialogKey, setIssueDialogKey] = useState(0);
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [recordDialogKey, setRecordDialogKey] = useState(0);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<MutationFeedback | null>(null);
  const [issueDialogError, setIssueDialogError] =
    useState<MutationFeedback | null>(null);
  const [recordDialogError, setRecordDialogError] =
    useState<MutationFeedback | null>(null);

  async function createIssue(
    input: v1.maintenance.CreateScooterIssueInput,
  ): Promise<boolean> {
    setBusyAction("issue:create");
    setFeedback(null);
    setIssueDialogError(null);

    try {
      await webApi.fetch(
        v1.maintenance.ROUTES.issues.create(scooter.id),
        v1.maintenance.scooterIssueSchema,
        { method: "POST", json: input },
      );
      setFeedback({
        kind: "success",
        title: t("maintenance.feedback.issueCreatedTitle"),
        messages: [t("maintenance.feedback.issueCreatedMessage")],
      });
      router.refresh();
      return true;
    } catch (error) {
      const nextFeedback = mutationError(
        t("maintenance.feedback.issueErrorTitle"),
        error,
        t,
      );
      setFeedback(nextFeedback);
      setIssueDialogError(nextFeedback);
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function createMaintenanceRecord(
    input: v1.maintenance.CreateMaintenanceRecordInput,
  ): Promise<boolean> {
    setBusyAction("record:create");
    setFeedback(null);
    setRecordDialogError(null);

    try {
      await webApi.fetch(
        v1.maintenance.ROUTES.records.create(scooter.id),
        v1.maintenance.maintenanceRecordSchema,
        { method: "POST", json: input },
      );
      setFeedback({
        kind: "success",
        title: t("maintenance.feedback.recordCreatedTitle"),
        messages: [t("maintenance.feedback.recordCreatedMessage")],
      });
      router.refresh();
      return true;
    } catch (error) {
      const nextFeedback = mutationError(
        t("maintenance.feedback.recordErrorTitle"),
        error,
        t,
      );
      setFeedback(nextFeedback);
      setRecordDialogError(nextFeedback);
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function markIssueFixed(issue: v1.maintenance.ScooterIssue) {
    setBusyAction(`issue:fix:${issue.id}`);
    setFeedback(null);

    try {
      await webApi.fetch(
        v1.maintenance.ROUTES.issues.fix(scooter.id, issue.id),
        v1.maintenance.scooterIssueSchema,
        { method: "POST", json: {} },
      );
      setFeedback({
        kind: "success",
        title: t("maintenance.feedback.issueFixedTitle"),
        messages: [t("maintenance.feedback.issueFixedMessage")],
      });
      router.refresh();
    } catch (error) {
      setFeedback(
        mutationError(t("maintenance.feedback.issueErrorTitle"), error, t),
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section
      aria-labelledby="maintenance-title"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="maintenance-title" className="text-xl font-semibold">
            {t("maintenance.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("maintenance.description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busyAction !== null}
            onClick={() => {
              setIssueDialogError(null);
              setIssueDialogKey((current) => current + 1);
              setIssueDialogOpen(true);
            }}
          >
            <AlertTriangleIcon data-icon="inline-start" />
            {t("maintenance.actions.addIssue")}
          </Button>
          <Button
            type="button"
            disabled={busyAction !== null || maintenanceTypes.length === 0}
            onClick={() => {
              setRecordDialogError(null);
              setRecordDialogKey((current) => current + 1);
              setRecordDialogOpen(true);
            }}
          >
            <PlusIcon data-icon="inline-start" />
            {t("maintenance.actions.addRecord")}
          </Button>
        </div>
      </div>

      {feedback ? <FeedbackAlert feedback={feedback} /> : null}

      {overview.recommendedOperationalStatus === "UNAVAILABLE" ? (
        <Alert variant="destructive">
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>{t("maintenance.blocking.title")}</AlertTitle>
          <AlertDescription>
            {t("maintenance.blocking.description")}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
          <SummaryRow
            icon={<GaugeIcon aria-hidden="true" />}
            label={t("maintenance.summary.currentMileage")}
            value={
              overview.currentMileageKm === null
                ? t("maintenance.values.unknown")
                : t("maintenance.values.kilometers", {
                    value: overview.currentMileageKm,
                  })
            }
          />
          <SummaryRow
            icon={<AlertTriangleIcon aria-hidden="true" />}
            label={t("maintenance.summary.openIssues")}
            value={String(overview.openIssues.length)}
          />
          <SummaryRow
            icon={<WrenchIcon aria-hidden="true" />}
            label={t("maintenance.summary.recommendation")}
            value={t(
              `maintenance.operationalStatuses.${overview.recommendedOperationalStatus}`,
            )}
            destructive={
              overview.recommendedOperationalStatus === "UNAVAILABLE"
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("maintenance.issues.title")}</CardTitle>
          <CardDescription>
            {t("maintenance.issues.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {overview.openIssues.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("maintenance.issues.empty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {overview.openIssues.map((issue) => (
                <li
                  key={issue.id}
                  className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words font-medium">{issue.title}</p>
                      <IssueSeverityBadge severity={issue.severity} />
                    </div>
                    {issue.description ? (
                      <p className="mt-1 break-words text-sm text-muted-foreground">
                        {issue.description}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("maintenance.issues.reportedAt", {
                        date: formatDateTime(issue.reportedAt, locale),
                      })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label={t("maintenance.actions.markFixedIssue", {
                      title: issue.title,
                    })}
                    disabled={busyAction !== null}
                    onClick={() => void markIssueFixed(issue)}
                  >
                    <CheckIcon data-icon="inline-start" />
                    {busyAction === `issue:fix:${issue.id}`
                      ? t("maintenance.actions.fixing")
                      : t("maintenance.actions.markFixed")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <DeadlineListCard
          title={t("maintenance.schedule.overdueTitle")}
          empty={t("maintenance.schedule.overdueEmpty")}
          items={overview.overdueMaintenance}
          locale={locale}
        />
        <DeadlineListCard
          title={t("maintenance.schedule.dueSoonTitle")}
          empty={t("maintenance.schedule.dueSoonEmpty")}
          items={overview.dueSoonMaintenance}
          locale={locale}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("maintenance.schedule.title")}</CardTitle>
          <CardDescription>
            {t("maintenance.schedule.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {overview.maintenanceStatuses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("maintenance.schedule.empty")}
            </p>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {overview.maintenanceStatuses.map((item) => (
                <li
                  key={item.maintenanceType.id}
                  className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="break-words font-medium">
                      {item.maintenanceType.name}
                    </p>
                    <MaintenanceStatusBadge status={item.status} />
                  </div>
                  {item.latestRecord ? (
                    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                      <p>
                        {t("maintenance.schedule.lastPerformed", {
                          date: formatDate(
                            item.latestRecord.performedAt,
                            locale,
                          ),
                          mileage: item.latestRecord.performedKm,
                        })}
                      </p>
                      <p>
                        {t("maintenance.schedule.nextDue", {
                          mileage:
                            item.latestRecord.nextDueKm === null
                              ? t("maintenance.values.unknown")
                              : t("maintenance.values.kilometers", {
                                  value: item.latestRecord.nextDueKm,
                                }),
                          date:
                            item.latestRecord.nextDueAt === null
                              ? t("maintenance.values.unknown")
                              : formatDate(item.latestRecord.nextDueAt, locale),
                        })}
                      </p>
                      {item.latestRecord.notes ? (
                        <p className="break-words">{item.latestRecord.notes}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("maintenance.schedule.noRecord")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("maintenance.activity.title")}</CardTitle>
          <CardDescription>
            {t("maintenance.activity.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {overview.activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("maintenance.activity.empty")}
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {overview.activity.map((activity, index) => (
                <li
                  key={`${activity.kind}-${activity.occurredAt}-${activity.issueId ?? activity.maintenanceRecordId}-${index}`}
                  className="flex items-start gap-3"
                >
                  <ActivityIconBadge activity={activity} />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">
                      {t(`maintenance.activity.kinds.${activity.kind}`, {
                        title: activity.title,
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activity.kind === "MAINTENANCE_COMPLETED"
                        ? formatDate(activity.occurredAt.slice(0, 10), locale)
                        : formatDateTime(activity.occurredAt, locale)}
                      {activity.performedKm === null
                        ? ""
                        : ` · ${t("maintenance.values.kilometers", { value: activity.performedKm })}`}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <IssueDialog
        key={`issue-dialog-${issueDialogKey}`}
        open={issueDialogOpen}
        busy={busyAction === "issue:create"}
        errorFeedback={issueDialogError}
        onOpenChange={setIssueDialogOpen}
        onSubmit={createIssue}
      />
      <MaintenanceRecordDialog
        key={`record-dialog-${recordDialogKey}`}
        open={recordDialogOpen}
        busy={busyAction === "record:create"}
        errorFeedback={recordDialogError}
        currentMileageKm={overview.currentMileageKm}
        maintenanceTypes={maintenanceTypes}
        onOpenChange={setRecordDialogOpen}
        onSubmit={createMaintenanceRecord}
      />
    </section>
  );
}

function DeadlineListCard({
  title,
  empty,
  items,
  locale,
}: {
  title: string;
  empty: string;
  items: v1.maintenance.MaintenanceTypeStatus[];
  locale: string;
}) {
  const t = useTranslations("scooters");

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          {title}
          <Badge
            variant={
              items.some((item) => item.status === "OVERDUE")
                ? "destructive"
                : items.length > 0
                  ? "outline"
                  : "secondary"
            }
          >
            {items.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={item.maintenanceType.id}
                className="flex items-start justify-between gap-2"
              >
                <span className="min-w-0 break-words text-sm font-medium">
                  {item.maintenanceType.name}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
                  {item.latestRecord?.nextDueKm !== null &&
                  item.latestRecord?.nextDueKm !== undefined ? (
                    <span>
                      {t("maintenance.schedule.deadlineMileage", {
                        mileage: item.latestRecord.nextDueKm,
                      })}
                    </span>
                  ) : null}
                  {item.latestRecord?.nextDueAt ? (
                    <span>
                      {t("maintenance.schedule.deadlineDate", {
                        date: formatDate(item.latestRecord.nextDueAt, locale),
                      })}
                    </span>
                  ) : null}
                  {item.latestRecord?.nextDueKm == null &&
                  !item.latestRecord?.nextDueAt
                    ? t("maintenance.values.unknown")
                    : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  destructive = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  destructive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </span>
      <Badge variant={destructive ? "destructive" : "secondary"}>{value}</Badge>
    </div>
  );
}

function IssueSeverityBadge({
  severity,
}: {
  severity: v1.maintenance.ScooterIssueSeverity;
}) {
  const t = useTranslations("scooters");
  const variant =
    severity === "CRITICAL" || severity === "HIGH"
      ? "destructive"
      : severity === "MEDIUM"
        ? "secondary"
        : "outline";

  return (
    <Badge variant={variant}>
      {t(`maintenance.issueSeverities.${severity}`)}
    </Badge>
  );
}

function ActivityIconBadge({
  activity,
}: {
  activity: v1.maintenance.MaintenanceActivity;
}) {
  if (activity.kind === "MAINTENANCE_COMPLETED") {
    return (
      <Badge
        aria-hidden="true"
        data-activity-kind={activity.kind}
        variant="outline"
        className="mt-0.5 px-1.5"
      >
        <WrenchIcon />
      </Badge>
    );
  }

  if (activity.kind === "ISSUE_FIXED") {
    return (
      <Badge
        aria-hidden="true"
        data-activity-kind={activity.kind}
        variant="secondary"
        className="mt-0.5 px-1.5"
      >
        <CircleCheckIcon />
      </Badge>
    );
  }

  if (activity.kind === "ISSUE_REOPENED") {
    return (
      <Badge
        aria-hidden="true"
        data-activity-kind={activity.kind}
        variant={issueSeverityBadgeVariant(activity.severity)}
        className="mt-0.5 px-1.5"
      >
        <RotateCcwIcon />
      </Badge>
    );
  }

  return (
    <Badge
      aria-hidden="true"
      data-activity-kind={activity.kind}
      variant={issueSeverityBadgeVariant(activity.severity)}
      className="mt-0.5 px-1.5"
    >
      <AlertTriangleIcon />
    </Badge>
  );
}

function issueSeverityBadgeVariant(
  severity: v1.maintenance.ScooterIssueSeverity,
): "destructive" | "secondary" | "outline" {
  return severity === "CRITICAL" || severity === "HIGH"
    ? "destructive"
    : severity === "MEDIUM"
      ? "secondary"
      : "outline";
}

function MaintenanceStatusBadge({
  status,
}: {
  status: v1.maintenance.MaintenanceStatus;
}) {
  const t = useTranslations("scooters");
  const variant =
    status === "OVERDUE"
      ? "destructive"
      : status === "OK"
        ? "secondary"
        : "outline";

  return <Badge variant={variant}>{t(`maintenance.statuses.${status}`)}</Badge>;
}

function IssueDialog({
  open,
  busy,
  errorFeedback,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  errorFeedback: MutationFeedback | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: v1.maintenance.CreateScooterIssueInput) => Promise<boolean>;
}) {
  const t = useTranslations("scooters");
  const formId = useId();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] =
    useState<v1.maintenance.ScooterIssueSeverity>("MEDIUM");
  const [errors, setErrors] = useState<Partial<Record<IssueField, string>>>({});

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    onOpenChange(nextOpen);
    if (nextOpen) {
      setTitle("");
      setDescription("");
      setSeverity("MEDIUM");
      setErrors({});
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = v1.maintenance.createScooterIssueInputSchema.safeParse({
      title,
      description: description || undefined,
      severity,
    });

    if (!result.success) {
      setErrors(issueErrors(result.error.issues, t));
      return;
    }

    if (await onSubmit(result.data)) {
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <form noValidate onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t("maintenance.dialogs.issue.title")}</DialogTitle>
            <DialogDescription>
              {t("maintenance.dialogs.issue.description")}
            </DialogDescription>
          </DialogHeader>
          {errorFeedback ? <FeedbackAlert feedback={errorFeedback} /> : null}
          <FieldGroup className="py-4">
            <Field data-invalid={Boolean(errors.title) || undefined}>
              <FieldLabel htmlFor={`${formId}-issue-title`}>
                {t("maintenance.fields.issueTitle")}
              </FieldLabel>
              <Input
                id={`${formId}-issue-title`}
                value={title}
                disabled={busy}
                aria-invalid={Boolean(errors.title) || undefined}
                onChange={(event) => setTitle(event.target.value)}
              />
              <FieldError>{errors.title}</FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.description) || undefined}>
              <FieldLabel htmlFor={`${formId}-issue-description`}>
                {t("maintenance.fields.issueDescription")}
              </FieldLabel>
              <Textarea
                id={`${formId}-issue-description`}
                value={description}
                disabled={busy}
                aria-invalid={Boolean(errors.description) || undefined}
                onChange={(event) => setDescription(event.target.value)}
              />
              <FieldError>{errors.description}</FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.severity) || undefined}>
              <FieldLabel htmlFor={`${formId}-issue-severity`}>
                {t("maintenance.fields.severity")}
              </FieldLabel>
              <Select
                value={severity}
                disabled={busy}
                onValueChange={(value) =>
                  value &&
                  setSeverity(value as v1.maintenance.ScooterIssueSeverity)
                }
              >
                <SelectTrigger
                  id={`${formId}-issue-severity`}
                  className="w-full"
                  aria-invalid={Boolean(errors.severity) || undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {v1.maintenance.SCOOTER_ISSUE_SEVERITIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`maintenance.issueSeverities.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError>{errors.severity}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={busy} />
              }
            >
              {t("actions.cancel")}
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy
                ? t("maintenance.actions.adding")
                : t("maintenance.actions.addIssue")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MaintenanceRecordDialog({
  open,
  busy,
  errorFeedback,
  currentMileageKm,
  maintenanceTypes,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  errorFeedback: MutationFeedback | null;
  currentMileageKm: number | null;
  maintenanceTypes: v1.maintenance.MaintenanceTypeList;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    input: v1.maintenance.CreateMaintenanceRecordInput,
  ) => Promise<boolean>;
}) {
  const t = useTranslations("scooters");
  const locale = useLocale();
  const formId = useId();
  const [maintenanceTypeId, setMaintenanceTypeId] = useState(
    () => maintenanceTypes[0]?.id ?? "",
  );
  const [performedAt, setPerformedAt] = useState(todayDateOnly);
  const [performedKm, setPerformedKm] = useState(() =>
    currentMileageKm === null ? "" : String(currentMileageKm),
  );
  const [notes, setNotes] = useState("");
  const [nextDueKm, setNextDueKm] = useState("");
  const [nextDueAt, setNextDueAt] = useState("");
  const [errors, setErrors] = useState<Partial<Record<RecordField, string>>>(
    {},
  );
  const selectedType = maintenanceTypes.find(
    (type) => type.id === maintenanceTypeId,
  );
  const preview = calculateDeadlinePreview(
    selectedType,
    performedAt,
    performedKm,
  );

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    onOpenChange(nextOpen);
    if (nextOpen) {
      setMaintenanceTypeId(maintenanceTypes[0]?.id ?? "");
      setPerformedAt(todayDateOnly());
      setPerformedKm(currentMileageKm === null ? "" : String(currentMileageKm));
      setNotes("");
      setNextDueKm("");
      setNextDueAt("");
      setErrors({});
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = v1.maintenance.createMaintenanceRecordInputSchema.safeParse({
      maintenanceTypeId,
      performedAt,
      performedKm: parseWholeNumber(performedKm),
      notes: notes || undefined,
      nextDueKm: nextDueKm ? parseWholeNumber(nextDueKm) : undefined,
      nextDueAt: nextDueAt || undefined,
    });

    if (!result.success) {
      setErrors(recordErrors(result.error.issues, t));
      return;
    }

    if (await onSubmit(result.data)) {
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[calc(100svh-var(--spacing-8))] overflow-y-auto sm:max-w-2xl">
        <form noValidate onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t("maintenance.dialogs.record.title")}</DialogTitle>
            <DialogDescription>
              {t("maintenance.dialogs.record.description")}
            </DialogDescription>
          </DialogHeader>
          {errorFeedback ? <FeedbackAlert feedback={errorFeedback} /> : null}
          <FieldGroup className="py-4">
            <Field
              data-invalid={Boolean(errors.maintenanceTypeId) || undefined}
            >
              <FieldLabel htmlFor={`${formId}-maintenance-type`}>
                {t("maintenance.fields.maintenanceType")}
              </FieldLabel>
              <Select
                value={maintenanceTypeId}
                disabled={busy}
                onValueChange={(value) => value && setMaintenanceTypeId(value)}
              >
                <SelectTrigger
                  id={`${formId}-maintenance-type`}
                  className="w-full"
                  aria-invalid={Boolean(errors.maintenanceTypeId) || undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {maintenanceTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError>{errors.maintenanceTypeId}</FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.performedAt) || undefined}>
              <FieldLabel htmlFor={`${formId}-performed-at-day`}>
                {t("maintenance.fields.performedAt")}
              </FieldLabel>
              <DatePartsField
                baseId={`${formId}-performed-at`}
                label={t("maintenance.fields.performedAt")}
                locale={locale}
                value={performedAt}
                disabled={busy}
                invalid={Boolean(errors.performedAt)}
                onChange={setPerformedAt}
              />
              <FieldError>{errors.performedAt}</FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.performedKm) || undefined}>
              <FieldLabel htmlFor={`${formId}-performed-km`}>
                {t("maintenance.fields.performedKm")}
              </FieldLabel>
              <Input
                id={`${formId}-performed-km`}
                type="number"
                min={0}
                inputMode="numeric"
                value={performedKm}
                disabled={busy}
                aria-invalid={Boolean(errors.performedKm) || undefined}
                onChange={(event) => setPerformedKm(event.target.value)}
              />
              <FieldDescription>
                {t("maintenance.fields.performedKmDescription")}
              </FieldDescription>
              <FieldError>{errors.performedKm}</FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.notes) || undefined}>
              <FieldLabel htmlFor={`${formId}-notes`}>
                {t("maintenance.fields.recordNotes")}
              </FieldLabel>
              <Textarea
                id={`${formId}-notes`}
                value={notes}
                disabled={busy}
                aria-invalid={Boolean(errors.notes) || undefined}
                onChange={(event) => setNotes(event.target.value)}
              />
              <FieldError>{errors.notes}</FieldError>
            </Field>

            {preview ? (
              <Alert>
                <CalendarClockIcon aria-hidden="true" />
                <AlertTitle>
                  {t("maintenance.deadlinePreview.title")}
                </AlertTitle>
                <AlertDescription>
                  {t("maintenance.deadlinePreview.description", {
                    mileage:
                      preview.nextDueKm === null
                        ? t("maintenance.values.unknown")
                        : t("maintenance.values.kilometers", {
                            value: preview.nextDueKm,
                          }),
                    date:
                      preview.nextDueAt === null
                        ? t("maintenance.values.unknown")
                        : formatDate(preview.nextDueAt, locale),
                  })}
                </AlertDescription>
              </Alert>
            ) : null}

            <Field data-invalid={Boolean(errors.nextDueKm) || undefined}>
              <FieldLabel htmlFor={`${formId}-next-due-km`}>
                {t("maintenance.fields.nextDueKm")}
              </FieldLabel>
              <Input
                id={`${formId}-next-due-km`}
                type="number"
                min={0}
                inputMode="numeric"
                value={nextDueKm}
                disabled={busy}
                aria-invalid={Boolean(errors.nextDueKm) || undefined}
                onChange={(event) => setNextDueKm(event.target.value)}
              />
              <FieldDescription>
                {t("maintenance.fields.manualDeadlineDescription")}
              </FieldDescription>
              <FieldError>{errors.nextDueKm}</FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.nextDueAt) || undefined}>
              <FieldLabel htmlFor={`${formId}-next-due-at-day`}>
                {t("maintenance.fields.nextDueAt")}
              </FieldLabel>
              <DatePartsField
                baseId={`${formId}-next-due-at`}
                label={t("maintenance.fields.nextDueAt")}
                locale={locale}
                value={nextDueAt}
                disabled={busy}
                invalid={Boolean(errors.nextDueAt)}
                onChange={setNextDueAt}
              />
              <FieldDescription>
                {t("maintenance.fields.manualDeadlineDescription")}
              </FieldDescription>
              <FieldError>{errors.nextDueAt}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={busy} />
              }
            >
              {t("actions.cancel")}
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy
                ? t("maintenance.actions.adding")
                : t("maintenance.actions.addRecord")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function mutationError(
  title: string,
  error: unknown,
  t: ReturnType<typeof useTranslations>,
): MutationFeedback {
  return {
    kind: "error",
    title,
    messages: [
      error instanceof Error ? error.message : t("feedback.genericError"),
    ],
  };
}

function issueErrors(
  issues: ReadonlyArray<{ path: PropertyKey[] }>,
  t: ReturnType<typeof useTranslations>,
): Partial<Record<IssueField, string>> {
  const result: Partial<Record<IssueField, string>> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (
      (field === "title" || field === "description" || field === "severity") &&
      !result[field]
    ) {
      result[field] = t("maintenance.validation.invalidField", {
        field: t(
          `maintenance.fields.${field === "title" ? "issueTitle" : field === "description" ? "issueDescription" : "severity"}`,
        ),
      });
    }
  }
  return result;
}

function recordErrors(
  issues: ReadonlyArray<{ path: PropertyKey[] }>,
  t: ReturnType<typeof useTranslations>,
): Partial<Record<RecordField, string>> {
  const result: Partial<Record<RecordField, string>> = {};
  const labels: Record<RecordField, string> = {
    maintenanceTypeId: t("maintenance.fields.maintenanceType"),
    performedAt: t("maintenance.fields.performedAt"),
    performedKm: t("maintenance.fields.performedKm"),
    notes: t("maintenance.fields.recordNotes"),
    nextDueKm: t("maintenance.fields.nextDueKm"),
    nextDueAt: t("maintenance.fields.nextDueAt"),
  };

  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && field in labels) {
      const recordField = field as RecordField;
      if (!result[recordField]) {
        result[recordField] = t("maintenance.validation.invalidField", {
          field: labels[recordField],
        });
      }
    }
  }
  return result;
}

function parseWholeNumber(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

function todayDateOnly(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculateDeadlinePreview(
  type: v1.maintenance.MaintenanceType | undefined,
  performedAt: string,
  performedKm: string,
): { nextDueKm: number | null; nextDueAt: string | null } | null {
  if (!type) return null;

  const mileage = parseWholeNumber(performedKm);
  const nextDueKm =
    type.intervalKm !== null && Number.isInteger(mileage) && mileage >= 0
      ? mileage + type.intervalKm
      : null;
  const nextDueAt =
    type.intervalMonths !== null
      ? addCalendarMonths(performedAt, type.intervalMonths)
      : null;

  return nextDueKm === null && nextDueAt === null
    ? null
    : { nextDueKm, nextDueAt };
}

function addCalendarMonths(dateOnly: string, months: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const targetStart = new Date(Date.UTC(year, monthIndex + months, 1));
  const targetYear = targetStart.getUTCFullYear();
  const targetMonthIndex = targetStart.getUTCMonth();
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonthIndex + 1, 0),
  ).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonthIndex + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
