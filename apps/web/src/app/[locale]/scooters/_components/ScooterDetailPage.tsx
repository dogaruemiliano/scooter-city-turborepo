"use client";

import { v1 } from "@repo/api-shared";
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  buttonVariants,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import {
  ArrowLeftIcon,
  BatteryChargingIcon,
  CarFrontIcon,
  EllipsisIcon,
  GaugeIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, type FormEvent, type ReactNode } from "react";

import { PageTitleOverride } from "@/components/PageTitleOverride";
import { webApi } from "@/lib/api";
import { FeedbackAlert, formErrorsFromIssues } from "./ScooterCreateForm";
import { ScooterFormFields } from "./ScooterFormFields";
import {
  buildScooterInputCandidate,
  fieldFromIssue,
  scooterFormFromScooter,
  type ScooterFormErrors,
  type ScooterFormField,
  type ScooterFormIssue,
  type ScooterFormState,
} from "./scooter-form";

interface ScooterDetailPageProps {
  scooter: v1.scooters.Scooter;
  scootersHref: string;
}

interface Feedback {
  kind: "success" | "error";
  title: string;
  messages: string[];
}

type ScooterTranslations = ReturnType<typeof useTranslations>;

export function ScooterDetailPage({
  scooter,
  scootersHref,
}: ScooterDetailPageProps) {
  const t = useTranslations("scooters");
  const locale = useLocale();
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editDialogKey, setEditDialogKey] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const title = `${scooter.brand} ${scooter.model}`;

  async function updateScooter(
    input: v1.scooters.UpdateScooterInput,
  ): Promise<boolean> {
    setFeedback(null);
    setBusyAction("scooter:update");
    try {
      await webApi.fetch(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        { method: "PATCH", json: input },
      );
      setFeedback({
        kind: "success",
        title: t("feedback.updateSuccessTitle"),
        messages: [t("feedback.updateSuccessMessage")],
      });
      router.refresh();
      return true;
    } catch (error) {
      setFeedback({
        kind: "error",
        title: t("feedback.updateErrorTitle"),
        messages: [
          error instanceof Error ? error.message : t("feedback.genericError"),
        ],
      });
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteScooter(): Promise<boolean> {
    setFeedback(null);
    setBusyAction("scooter:delete");
    try {
      await webApi.fetch(
        v1.scooters.ROUTES.delete(scooter.id),
        v1.common.noContentSchema,
        { method: "DELETE" },
      );
      router.replace(scootersHref);
      router.refresh();
      return true;
    } catch (error) {
      setFeedback({
        kind: "error",
        title: t("feedback.deleteErrorTitle"),
        messages: [
          error instanceof Error ? error.message : t("feedback.genericError"),
        ],
      });
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <PageTitleOverride title={title} />
      <div className="flex flex-col gap-4">
        <Link
          href={scootersHref}
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
            <h1 className="break-words text-2xl font-semibold">{title}</h1>
            <p className="break-words text-sm text-muted-foreground">
              {scooter.vin}
            </p>
          </div>
          <div className="flex flex-col gap-2 md:items-end">
            <div className="flex flex-wrap gap-2 md:justify-end">
              <Badge variant="outline">
                {scooter.deletedAt
                  ? t("recordStatus.deleted")
                  : t("recordStatus.active")}
              </Badge>
              <PowertrainBadge scooter={scooter} />
              <Badge variant="outline">
                {t(`registrationStatuses.${scooter.registrationStatus}`)}
              </Badge>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="lg" />}
              >
                <EllipsisIcon data-icon="inline-start" />
                {t("actions.moreActions")}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-48">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={busyAction !== null}
                    onClick={() => {
                      setEditDialogKey((current) => current + 1);
                      setEditOpen(true);
                    }}
                  >
                    <PencilIcon data-icon="inline-start" />
                    {t("actions.editScooter")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={busyAction !== null}
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2Icon data-icon="inline-start" />
                    {t("actions.deleteScooter")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {feedback ? <FeedbackAlert feedback={feedback} /> : null}

      <DetailSection title={t("sections.identity")}>
        <DetailField label={t("fields.vin")} value={scooter.vin} />
        <DetailField label={t("fields.brand")} value={scooter.brand} />
        <DetailField label={t("fields.model")} value={scooter.model} />
        <DetailField
          label={t("fields.color")}
          value={scooter.color ?? t("detail.emptyValue")}
        />
        <DetailField
          label={t("detail.fields.scooterId")}
          value={scooter.id}
          className="sm:col-span-2"
        />
      </DetailSection>

      <DetailSection title={t("sections.technical")}>
        <DetailField
          label={t("fields.manufactureYear")}
          value={String(scooter.manufactureYear)}
        />
        <DetailField
          label={t("fields.powertrainType")}
          value={t(`powertrainTypes.${scooter.powertrainType}`)}
        />
        <DetailField
          label={t("fields.cylinderCapacityCc")}
          value={
            scooter.cylinderCapacityCc
              ? t("list.ccValue", { cc: scooter.cylinderCapacityCc })
              : t("detail.emptyValue")
          }
        />
        <DetailField
          label={t("fields.registrationStatus")}
          value={t(`registrationStatuses.${scooter.registrationStatus}`)}
        />
      </DetailSection>

      <DetailSection title={t("sections.purchase")}>
        <DetailField
          label={t("fields.purchasedOn")}
          value={formatDate(scooter.purchasedOn, locale)}
        />
        <DetailField
          label={t("detail.fields.createdAt")}
          value={formatDateTime(scooter.createdAt, locale)}
        />
        <DetailField
          label={t("detail.fields.updatedAt")}
          value={formatDateTime(scooter.updatedAt, locale)}
        />
        {scooter.deletedAt ? (
          <DetailField
            label={t("detail.fields.deletedAt")}
            value={formatDateTime(scooter.deletedAt, locale)}
          />
        ) : null}
      </DetailSection>

      <DetailSection title={t("sections.notes")}>
        <DetailField
          label={t("fields.notes")}
          value={scooter.notes ?? t("detail.emptyValue")}
          className="sm:col-span-2"
        />
      </DetailSection>

      <ScooterFormDialog
        key={`edit-scooter-${editDialogKey}`}
        scooter={scooter}
        busy={busyAction === "scooter:update"}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSubmit={updateScooter}
      />
      <DeleteScooterDialog
        open={deleteOpen}
        busy={busyAction === "scooter:delete"}
        onOpenChange={setDeleteOpen}
        onConfirm={deleteScooter}
      />
    </div>
  );
}

function ScooterFormDialog({
  scooter,
  busy,
  open,
  onOpenChange,
  onSubmit,
}: {
  scooter: v1.scooters.Scooter;
  busy: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: v1.scooters.UpdateScooterInput) => Promise<boolean>;
}) {
  const t = useTranslations("scooters");
  const formId = useId();
  const [form, setForm] = useState(() => scooterFormFromScooter(scooter));
  const [fieldErrors, setFieldErrors] = useState<ScooterFormErrors>({});
  const [error, setError] = useState<string | null>(null);

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    onOpenChange(nextOpen);
    if (nextOpen) {
      setForm(scooterFormFromScooter(scooter));
      setFieldErrors({});
      setError(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setError(null);

    const candidate = buildScooterInputCandidate(form, {
      required: (field) =>
        t("feedback.validation.required", { field: fieldLabel(field, t) }),
      invalidDate: (field) =>
        t("feedback.validation.invalid", {
          field: fieldLabel(field, t),
        }),
      invalidNumber: (field) =>
        t("feedback.validation.invalidNumber", {
          field: fieldLabel(field, t),
        }),
      cylinderCapacityRequired: () =>
        t("feedback.validation.cylinderCapacityRequired"),
      cylinderCapacityElectric: () =>
        t("feedback.validation.cylinderCapacityElectric"),
    });

    if (candidate.errors) {
      setFieldErrors(candidate.errors);
      setError(
        Object.values(candidate.errors)[0] ?? t("feedback.genericError"),
      );
      return;
    }

    const input = v1.scooters.updateScooterInputSchema.safeParse(
      candidate.input,
    );

    if (!input.success) {
      const nextFieldErrors = formErrorsFromIssues(
        input.error.issues,
        (issue, field) => formatValidationIssue(issue, field, t),
      );
      setFieldErrors(nextFieldErrors);
      setError(
        input.error.issues[0]
          ? formatValidationIssue(
              input.error.issues[0],
              fieldFromIssue(input.error.issues[0]),
              t,
            )
          : t("feedback.genericError"),
      );
      return;
    }

    if (await onSubmit(input.data)) {
      onOpenChange(false);
    }
  }

  function setFormValue<Key extends keyof ScooterFormState>(
    key: Key,
    value: ScooterFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) {
        return current;
      }
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (key === "powertrainType") {
      setFieldErrors((current) => {
        if (!current.cylinderCapacityCc) {
          return current;
        }
        const next = { ...current };
        delete next.cylinderCapacityCc;
        return next;
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-2xl">
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => void submit(event)}
        >
          <DialogHeader>
            <DialogTitle>{t("detail.dialogs.editScooterTitle")}</DialogTitle>
          </DialogHeader>
          {error ? (
            <FeedbackAlert
              feedback={{
                kind: "error",
                title: t("feedback.updateErrorTitle"),
                messages: [error],
              }}
            />
          ) : null}
          <ScooterFormFields
            formId={formId}
            form={form}
            errors={fieldErrors}
            disabled={busy}
            onSetValue={setFormValue}
          />
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={busy} />
              }
            >
              {t("actions.cancel")}
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy ? t("actions.saving") : t("actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteScooterDialog({
  open,
  busy,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<boolean>;
}) {
  const t = useTranslations("scooters");

  async function confirm() {
    if (await onConfirm()) {
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !busy && onOpenChange(nextOpen)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("detail.dialogs.deleteScooterTitle")}</DialogTitle>
          <DialogDescription>
            {t("detail.dialogs.deleteScooterDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={<Button type="button" variant="outline" disabled={busy} />}
          >
            {t("actions.cancel")}
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? t("actions.deleting") : t("actions.deleteScooter")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-4 rounded-lg bg-muted p-4 md:grid-cols-3 md:gap-6">
      <div className="flex items-center gap-2">
        <CarFrontIcon aria-hidden="true" className="size-4 shrink-0" />
        <h2 className="text-base font-semibold md:text-sm">{title}</h2>
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
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 gap-1", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}

function PowertrainBadge({ scooter }: { scooter: v1.scooters.Scooter }) {
  const t = useTranslations("scooters");
  const Icon =
    scooter.powertrainType === "electric" ? BatteryChargingIcon : GaugeIcon;

  return (
    <Badge variant="outline">
      <Icon aria-hidden="true" data-icon="inline-start" />
      {scooter.powertrainType === "combustion" && scooter.cylinderCapacityCc
        ? t("list.ccValue", { cc: scooter.cylinderCapacityCc })
        : t(`powertrainTypes.${scooter.powertrainType}`)}
    </Badge>
  );
}

function formatValidationIssue(
  issue: ScooterFormIssue,
  field: ScooterFormField | null,
  t: ScooterTranslations,
): string {
  if (field === "vin") {
    return t("feedback.validation.invalidVin");
  }

  if (field === "cylinderCapacityCc") {
    if (issue.message.includes("required")) {
      return t("feedback.validation.cylinderCapacityRequired");
    }
    if (issue.message.includes("only allowed")) {
      return t("feedback.validation.cylinderCapacityElectric");
    }
  }

  if (field === "purchasedOn" && issue.message.includes("today")) {
    return t("feedback.validation.purchasedOnPastOrToday");
  }

  const label = fieldLabel(field, t);
  if (issue.code === "too_small" && issue.minimum === 1) {
    return t("feedback.validation.required", { field: label });
  }

  if (
    issue.code === "too_big" &&
    (typeof issue.maximum === "number" || typeof issue.maximum === "bigint")
  ) {
    return t("feedback.validation.maxLength", {
      field: label,
      max: Number(issue.maximum),
    });
  }

  return issue.code === "invalid_format" || issue.code === "custom"
    ? t("feedback.validation.invalid", { field: label })
    : t("feedback.validation.fallback");
}

function fieldLabel(
  field: ScooterFormField | null,
  t: ScooterTranslations,
): string {
  switch (field) {
    case "vin":
      return t("fields.vin");
    case "brand":
      return t("fields.brand");
    case "model":
      return t("fields.model");
    case "color":
      return t("fields.color");
    case "manufactureYear":
      return t("fields.manufactureYear");
    case "powertrainType":
      return t("fields.powertrainType");
    case "cylinderCapacityCc":
      return t("fields.cylinderCapacityCc");
    case "purchasedOn":
      return t("fields.purchasedOn");
    case "notes":
      return t("fields.notes");
    default:
      return t("createPage.title");
  }
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
