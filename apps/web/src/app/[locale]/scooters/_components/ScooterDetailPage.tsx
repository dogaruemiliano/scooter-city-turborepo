"use client";

import { v1 } from "@repo/api-shared";
import {
  Badge,
  BottomSheet,
  BottomSheetBody,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import {
  BatteryChargingIcon,
  CarFrontIcon,
  GaugeIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, type FormEvent, type ReactNode } from "react";

import { MoreActionsMenu } from "@/components/MoreActionsMenu";
import { PageTitleOverride } from "@/components/PageTitleOverride";
import { webApi } from "@/lib/api";
import { FeedbackAlert, formErrorsFromIssues } from "./ScooterCreateForm";
import { ScooterRegistrationFormFields } from "./ScooterFormFields";
import {
  buildScooterRegistrationInputCandidate,
  fieldFromIssue,
  fieldLabel,
  formatValidationIssue,
  scooterFormFromScooter,
  type ScooterFormErrors,
  type ScooterFormState,
} from "./scooter-form";
import { ScooterMaintenanceSection } from "./ScooterMaintenanceSection";
import { ScooterSalesSection, ScooterSoldBadge } from "./ScooterSalesSection";

interface ScooterDetailPageProps {
  scooter: v1.scooters.Scooter;
  scootersHref: string;
  maintenanceOverview: v1.maintenance.ScooterMaintenanceOverview;
  maintenanceTypes: v1.maintenance.MaintenanceTypeList;
  financials: v1.finance.ScooterFinancials;
  companyWallets: v1.finance.WalletOption[];
}

interface Feedback {
  kind: "success" | "error";
  title: string;
  messages: string[];
}

export function ScooterDetailPage({
  scooter,
  scootersHref,
  maintenanceOverview,
  maintenanceTypes,
  financials,
  companyWallets,
}: ScooterDetailPageProps) {
  const t = useTranslations("scooters");
  const locale = useLocale();
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationDialogKey, setRegistrationDialogKey] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const title = `${scooter.brand} ${scooter.model}`;
  const scooterEditHref = `${scootersHref}/${encodeURIComponent(scooter.id)}/edit`;
  const registrationActionLabel =
    scooter.registrationType === "unregistered"
      ? t("actions.addRegistration")
      : t("actions.editRegistration");

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
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold">{title}</h1>
            <p className="break-words text-sm text-muted-foreground">
              {scooter.vin}
            </p>
          </div>
          <MoreActionsMenu
            ariaLabel={t("actions.moreActions")}
            groups={[
              [
                {
                  key: "registration",
                  label: registrationActionLabel,
                  icon: <PencilIcon data-icon="inline-start" />,
                  disabled: busyAction !== null,
                  onClick: () => {
                    setRegistrationDialogKey((current) => current + 1);
                    setRegistrationOpen(true);
                  },
                },
                {
                  key: "edit",
                  label: t("actions.editScooter"),
                  icon: <PencilIcon data-icon="inline-start" />,
                  disabled: busyAction !== null,
                  onClick: () => router.push(scooterEditHref),
                },
              ],
              [
                {
                  key: "delete",
                  label: t("actions.deleteScooter"),
                  icon: <Trash2Icon data-icon="inline-start" />,
                  variant: "destructive",
                  disabled: busyAction !== null,
                  onClick: () => setDeleteOpen(true),
                },
              ],
            ]}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {scooter.deletedAt ? (
            <Badge variant="outline">{t("recordStatus.deleted")}</Badge>
          ) : null}
          {financials.sale && financials.sale.status !== "CANCELLED" ? (
            <ScooterSoldBadge />
          ) : null}
          <PowertrainBadge scooter={scooter} />
          <Badge variant="outline">
            {t(`registrationTypes.${scooter.registrationType}`)}
          </Badge>
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
          label={t("fields.engineType")}
          value={scooter.engineType ?? t("detail.emptyValue")}
        />
        <DetailField
          label={t("fields.engineCc")}
          value={
            scooter.engineCc
              ? t("list.ccValue", { cc: scooter.engineCc })
              : t("detail.emptyValue")
          }
        />
        <DetailField
          label={t("fields.powerKw")}
          value={
            scooter.powerKw
              ? t("list.kwValue", { kw: scooter.powerKw })
              : t("detail.emptyValue")
          }
        />
      </DetailSection>

      <DetailSection title={t("sections.registration")}>
        <DetailField
          label={t("fields.registrationType")}
          value={t(`registrationTypes.${scooter.registrationType}`)}
        />
        <DetailField
          label={t("fields.plateNumber")}
          value={scooter.plateNumber ?? t("detail.emptyValue")}
        />
        <DetailField
          label={t("fields.registeredOn")}
          value={
            scooter.registeredOn
              ? formatDate(scooter.registeredOn, locale)
              : t("detail.emptyValue")
          }
        />
        {scooter.registrationType === "temporary" ? (
          <DetailField
            label={t("fields.registrationExpiresOn")}
            value={
              scooter.registrationExpiresOn
                ? formatDate(scooter.registrationExpiresOn, locale)
                : t("detail.emptyValue")
            }
          />
        ) : null}
        <DetailField
          label={t("fields.requiredDriverLicenseType")}
          value={t(
            `requiredDriverLicenseTypes.${scooter.requiredDriverLicenseType}`,
          )}
        />
      </DetailSection>

      <DetailSection title={t("sections.purchase")}>
        <DetailField
          label={t("fields.purchasedOn")}
          value={
            scooter.purchasedOn
              ? formatDate(scooter.purchasedOn, locale)
              : t("detail.purchaseNotRecorded")
          }
        />
        <DetailField
          label={t("detail.fields.purchasePrice")}
          value={
            scooter.purchasePrice && scooter.purchaseCurrency
              ? formatMoney(
                  scooter.purchasePrice,
                  scooter.purchaseCurrency,
                  locale,
                )
              : t("detail.purchaseNotRecorded")
          }
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

      <ScooterSalesSection
        scooter={scooter}
        financials={financials}
        companyWallets={companyWallets}
      />

      <ScooterMaintenanceSection
        scooter={scooter}
        overview={maintenanceOverview}
        maintenanceTypes={maintenanceTypes}
      />

      <ScooterRegistrationDialog
        key={`edit-scooter-registration-${registrationDialogKey}`}
        scooter={scooter}
        busy={busyAction === "scooter:update"}
        open={registrationOpen}
        onOpenChange={setRegistrationOpen}
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

function ScooterRegistrationDialog({
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

    const candidate = buildScooterRegistrationInputCandidate(form, {
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
      invalidPlateNumber: () => t("feedback.validation.invalidPlateNumber"),
      engineCcRequired: () => t("feedback.validation.engineCcRequired"),
      engineCcElectric: () => t("feedback.validation.engineCcElectric"),
      invalidMileage: () => t("feedback.validation.invalidMileage"),
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
  }

  const title =
    scooter.registrationType === "unregistered"
      ? t("actions.addRegistration")
      : t("actions.editRegistration");

  return (
    <BottomSheet open={open} onOpenChange={changeOpen}>
      <BottomSheetContent className="lg:w-xl">
        <form
          className="contents"
          noValidate
          onSubmit={(event) => void submit(event)}
        >
          <BottomSheetHeader>
            <BottomSheetTitle>{title}</BottomSheetTitle>
          </BottomSheetHeader>
          <BottomSheetBody>
            {error ? (
              <FeedbackAlert
                feedback={{
                  kind: "error",
                  title: t("feedback.updateErrorTitle"),
                  messages: [error],
                }}
              />
            ) : null}
            <ScooterRegistrationFormFields
              formId={formId}
              form={form}
              errors={fieldErrors}
              disabled={busy}
              onSetValue={setFormValue}
            />
          </BottomSheetBody>
          <BottomSheetFooter className="sm:flex-row-reverse sm:justify-start">
            <Button type="submit" disabled={busy}>
              {busy ? t("actions.saving") : t("actions.save")}
            </Button>
            <BottomSheetClose
              render={
                <Button type="button" variant="outline" disabled={busy} />
              }
            >
              {t("actions.cancel")}
            </BottomSheetClose>
          </BottomSheetFooter>
        </form>
      </BottomSheetContent>
    </BottomSheet>
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CarFrontIcon aria-hidden="true" className="size-4 shrink-0" />
          <h2 className="text-base font-semibold md:text-sm">{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid min-w-0 gap-4 sm:grid-cols-2">{children}</dl>
      </CardContent>
    </Card>
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

function formatDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatMoney(value: string, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(Number(value));
}
