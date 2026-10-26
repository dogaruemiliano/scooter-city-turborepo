"use client";

import { PageLayout } from "@repo/ui/components/page-layout";
import { useFormAction } from "@/lib/form/use-form-action";
import { SaveButton } from "@repo/ui/components/save-button";
import { ScooterProblems } from "./ScooterProblems";
import { ScooterInsuranceList } from "./ScooterInsuranceFields";
import { ScooterItpPanel } from "./ScooterItpPanel";

import { v1 } from "@repo/api-shared";
import {
  Alert,
  AlertTitle,
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
  CarFrontIcon,
  PencilIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { MoreActionsMenu } from "@/components/MoreActionsMenu";
import { PageTitleOverride } from "@/components/PageTitleOverride";
import { webApi } from "@/lib/api";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import {
  FeedbackAlert,
  formErrorsFromIssues,
  scooterFieldConflict,
} from "./scooter-feedback";
import { CivDetails } from "./CivDetails";
import { ScooterDocumentList } from "./ScooterDocumentUpload";
import { ScooterPhotos } from "./ScooterPhotos";
import { ScooterDetailHero } from "./ScooterDetailHero";
import { ScooterRegistrationFormFields } from "./ScooterRegistrationFormFields";
import {
  buildScooterRegistrationInputCandidate,
  fieldFromIssue,
  fieldLabel,
  formatValidationIssue,
  scooterFormFromScooter,
  type ScooterFormErrors,
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

export function ScooterDetailPage({
  scooter,
  scootersHref,
}: ScooterDetailPageProps) {
  const t = useTranslations("scooters");
  const session = useOptionalSession();
  const locale = useLocale();
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [photosBusy, setPhotosBusy] = useState(false);
  const readiness = v1.scooters.scooterReadinessIssues(scooter);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationDialogKey, setRegistrationDialogKey] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const title = v1.scooters.scooterDisplayCode(scooter);
  const scooterEditHref = `${scootersHref}/${encodeURIComponent(scooter.id)}/edit`;

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
    <PageLayout>
      <PageTitleOverride title={title} />
      <div className="hidden justify-end md:flex">
        <MoreActionsMenu
          ariaLabel={t("actions.moreActions")}
          groups={[
            [
              {
                key: "report-problem",
                permission: "problems.create",
                label: t("actions.reportProblem"),
                icon: <TriangleAlertIcon data-icon="inline-start" />,
                disabled:
                  Boolean(scooter.deletedAt) ||
                  busyAction !== null ||
                  photosBusy,
                onClick: () =>
                  router.push(
                    `${localizePath("/problems/new", resolveRouteLocale(locale))}?scooterId=${encodeURIComponent(scooter.id)}`,
                  ),
              },
              ...(scooter.registrationType === "unregistered"
                ? [
                    {
                      key: "registration",
                      permission: "scooters.update",
                      label: t("actions.addRegistration"),
                      icon: <PencilIcon data-icon="inline-start" />,
                      disabled: busyAction !== null || photosBusy,
                      onClick: () => {
                        setRegistrationDialogKey((current) => current + 1);
                        setRegistrationOpen(true);
                      },
                    },
                  ]
                : []),
              {
                key: "edit",
                permission: "scooters.update",
                label: t("actions.editScooter"),
                icon: <PencilIcon data-icon="inline-start" />,
                disabled: busyAction !== null || photosBusy,
                onClick: () => router.push(scooterEditHref),
              },
            ],
            [
              {
                key: "delete",
                permission: "scooters.archive",
                label: t("actions.deleteScooter"),
                icon: <Trash2Icon data-icon="inline-start" />,
                variant: "destructive",
                disabled: busyAction !== null || photosBusy,
                onClick: () => setDeleteOpen(true),
              },
            ],
          ]}
        />
      </div>
      <ScooterDetailHero scooter={scooter} />

      {readiness.length ? (
        <div className="grid gap-3">
          {readiness.map((issue) => (
            <Alert
              key={issue}
              variant={
                issue === "needsCiv" || issue === "needsRegistration"
                  ? "warning"
                  : "destructive"
              }
            >
              <AlertTitle>{t(`readiness.${issue}`)}</AlertTitle>
            </Alert>
          ))}
        </div>
      ) : null}
      {feedback ? <FeedbackAlert feedback={feedback} /> : null}
      {canAccess(session?.user, "problems.read") ? (
        <ScooterProblems scooterId={scooter.id} />
      ) : null}
      <ScooterPhotos
        scooterId={scooter.id}
        panel
        disabled={Boolean(scooter.deletedAt) || busyAction !== null}
        onBusyChange={setPhotosBusy}
      />

      <DetailSection title={t("sections.identity")}>
        <DetailField label={t("fields.vin")} value={scooter.vin} />
        <DetailField label={t("fields.brand")} value={scooter.brand} />
        <DetailField
          label={t("fields.model")}
          value={scooter.model ?? t("detail.emptyValue")}
        />
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
          value={
            scooter.manufactureYear == null
              ? t("detail.emptyValue")
              : String(scooter.manufactureYear)
          }
        />
        <DetailField
          label={t("fields.powertrainType")}
          value={t(`powertrainTypes.${scooter.powertrainType}`)}
        />
        {scooter.powertrainType === "combustion" ||
        scooter.powertrainType === "hybrid" ? (
          <DetailField
            label={t("fields.fuelSystem")}
            value={t(`fuelSystems.${scooter.fuelSystem ?? "unknown"}`)}
          />
        ) : null}
        <DetailField
          label={t("fields.engineCode")}
          value={scooter.engineCode ?? t("detail.emptyValue")}
        />
        <DetailField
          label={t("fields.engineDisplacementCc")}
          value={
            scooter.engineDisplacementCc
              ? t("list.ccValue", { cc: scooter.engineDisplacementCc })
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
          label={t("fields.registrationNumber")}
          value={scooter.registrationNumber ?? t("detail.emptyValue")}
        />
        <DetailField
          label={t("fields.registrationDate")}
          value={
            scooter.registrationDate
              ? formatDate(scooter.registrationDate, locale)
              : t("detail.emptyValue")
          }
        />
        {scooter.registrationType === "temporary" ? (
          <DetailField
            label={t("fields.temporaryRegistrationExpiresAt")}
            value={
              scooter.temporaryRegistrationExpiresAt
                ? formatDate(scooter.temporaryRegistrationExpiresAt, locale)
                : t("detail.emptyValue")
            }
          />
        ) : null}
        <DetailField
          label={t("fields.requiredLicenseCategory")}
          value={t(
            `requiredDriverLicenseTypes.${scooter.requiredLicenseCategory}`,
          )}
        />
      </DetailSection>

      <DetailSection title={t("sections.record")}>
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

      <DetailSection title={t("sections.operational")}>
        {(["hasGps", "odometerWorking", "speedometerWorking"] as const).map(
          (field) => (
            <DetailField
              key={field}
              label={t(`fields.${field}`)}
              value={
                scooter[field] == null
                  ? t("operational.unknown")
                  : t(scooter[field] ? "operational.yes" : "operational.no")
              }
            />
          ),
        )}
        {(["currentMileageKm", "actualMaxSpeedKmh"] as const).map((field) => (
          <DetailField
            key={field}
            label={t(`fields.${field}`)}
            value={
              scooter[field] == null
                ? t("detail.emptyValue")
                : new Intl.NumberFormat(locale).format(scooter[field])
            }
          />
        ))}
        <DetailField
          label={t("fields.notes")}
          value={scooter.notes ?? t("detail.emptyValue")}
          className="sm:col-span-2"
        />
      </DetailSection>

      <CivDetails scooter={scooter} />
      {canAccess(session?.user, "scooter_documents.read") ? (
        <ScooterDocumentList documents={scooter.documents ?? []} />
      ) : null}
      <ScooterInsuranceList scooter={scooter} />
      <ScooterItpPanel scooter={scooter} />
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
    </PageLayout>
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
  const formAction = useFormAction();

  const t = useTranslations("scooters");
  const formId = useId();
  const [form, setForm] = useState(() => scooterFormFromScooter(scooter));
  const [fieldErrors, setFieldErrors] = useState<ScooterFormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const plateError = fieldErrors.registrationNumber;
  useEffect(() => {
    if (open && !busy && plateError)
      document.getElementById(`${formId}-plate-number`)?.focus();
  }, [open, busy, plateError, formId]);

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
    if (busy) return;
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

    try {
      if (await onSubmit(input.data)) onOpenChange(false);
    } catch (error) {
      const conflict = scooterFieldConflict(error);
      const message = conflict
        ? t(
            conflict.field === "registrationNumber"
              ? "feedback.plateConflict"
              : "feedback.vinConflict",
          )
        : error instanceof Error
          ? error.message
          : t("feedback.genericError");
      setError(message);
      if (conflict) {
        setFieldErrors({ [conflict.field]: message });
      }
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
            <SaveButton
              type="submit"
              disabled={busy}
              {...formAction("save", { pending: busy }, t("actions.save"))}
            />
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
  const formAction = useFormAction();

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
          <SaveButton
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void confirm()}
            {...formAction(
              "delete",
              { pending: busy },
              t("actions.deleteScooter"),
            )}
          />
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
