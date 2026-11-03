"use client";

import { PageLayout } from "@repo/ui/components/page-layout";
import { useFormAction } from "@/lib/form/use-form-action";
import { SaveButton } from "@repo/ui/components/save-button";
import { ScooterProblems } from "./ScooterProblems";
import { ScooterComplianceSection } from "./ScooterComplianceSection";

import { v1 } from "@repo/api-shared";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Alert,
  AlertDescription,
  AlertTitle,
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
  Share2Icon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { MoreActionsMenu } from "@/components/MoreActionsMenu";
import { PageTitleOverride } from "@/components/PageTitleOverride";
import { PageHeaderNavigation } from "@/components/PageHeaderNavigation";
import { webApi } from "@/lib/api";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { FeedbackAlert } from "./scooter-feedback";
import { CivDetails } from "./CivDetails";
import { useShareClientDocuments } from "./useShareClientDocuments";
import { ScooterDetailDocuments } from "./ScooterDetailDocuments";
import { ScooterDetailPhotos } from "./ScooterDetailPhotos";
import { ScooterDetailHero } from "./ScooterDetailHero";
import { usePreviousScooterPathname } from "./ScooterNavigation";

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
  const previousPathname = usePreviousScooterPathname();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const clientDocumentShare = useShareClientDocuments(
    scooter,
    canAccess(session?.user, "scooter_documents.read"),
  );
  const readiness = v1.scooters.scooterReadinessIssues(scooter);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const title = v1.scooters.scooterDisplayCode(scooter);
  const scooterEditHref = `${scootersHref}/${encodeURIComponent(scooter.id)}/edit`;

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
      <PageHeaderNavigation
        onBack={() => {
          if (previousPathname === "/scooters") router.back();
          else router.push(scootersHref);
        }}
      />
      <div className="hidden justify-end md:flex">
        <MoreActionsMenu
          ariaLabel={t("actions.moreActions")}
          onOpenChange={clientDocumentShare.onMenuOpenChange}
          groups={[
            [
              {
                key: "share-client-documents",
                permission: "scooter_documents.read",
                label: t("sharing.action"),
                description: clientDocumentShare.description,
                icon: <Share2Icon data-icon="inline-start" />,
                disabled: clientDocumentShare.disabled || busyAction !== null,
                onClick: clientDocumentShare.share,
              },
              {
                key: "report-problem",
                permission: "problems.create",
                label: t("actions.reportProblem"),
                icon: <TriangleAlertIcon data-icon="inline-start" />,
                disabled: Boolean(scooter.deletedAt) || busyAction !== null,
                onClick: () =>
                  router.push(
                    `${localizePath("/problems/new", resolveRouteLocale(locale))}?scooterId=${encodeURIComponent(scooter.id)}`,
                  ),
              },
              {
                key: "edit",
                permission: "scooters.update",
                label: t("actions.editScooter"),
                icon: <PencilIcon data-icon="inline-start" />,
                disabled: busyAction !== null,
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
                disabled: busyAction !== null,
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
              {issue === "needsClientDocuments" ? (
                <AlertDescription>
                  <div>{t("readiness.clientDocumentsHint")}</div>
                  <ul className="list-disc pl-4">
                    {scooter.missingClientDocuments?.map((type) => (
                      <li key={type}>
                        {v1.scooters.scooterDocumentTypeSchema.safeParse(type)
                          .success
                          ? t(`documents.${type}`)
                          : t("documents.other")}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              ) : null}
            </Alert>
          ))}
        </div>
      ) : null}
      {feedback ? <FeedbackAlert feedback={feedback} /> : null}
      {clientDocumentShare.shareError ? (
        <Alert variant="destructive">
          <AlertTitle>{clientDocumentShare.shareError}</AlertTitle>
        </Alert>
      ) : null}
      {canAccess(session?.user, "problems.read") ? (
        <ScooterProblems scooterId={scooter.id} />
      ) : null}
      <ScooterDetailPhotos scooterId={scooter.id} />

      <ScooterDetailDocuments documents={scooter.documents ?? []}>
        <ScooterComplianceSection scooter={scooter} />
      </ScooterDetailDocuments>
      <Accordion>
        <AccordionItem value="details">
          <AccordionTrigger>{t("detail.moreDetails")}</AccordionTrigger>
          <AccordionContent className="grid gap-6">
            <CivDetails scooter={scooter} />
            <DetailSection title={t("sections.operational")}>
              {(
                [
                  "hasGps",
                  "hasPhoneStand",
                  "hasChargingOutlet",
                  "odometerWorking",
                  "speedometerWorking",
                ] as const
              ).map((field) => (
                <DetailField
                  key={field}
                  label={t(`fields.${field}`)}
                  value={
                    scooter[field] == null
                      ? t("operational.unknown")
                      : t(scooter[field] ? "operational.yes" : "operational.no")
                  }
                />
              ))}
              {(["currentMileageKm", "actualMaxSpeedKmh"] as const).map(
                (field) => (
                  <DetailField
                    key={field}
                    label={t(`fields.${field}`)}
                    value={
                      scooter[field] == null
                        ? t("detail.emptyValue")
                        : new Intl.NumberFormat(locale).format(scooter[field])
                    }
                  />
                ),
              )}
              <DetailField
                label={t("fields.notes")}
                value={scooter.notes ?? t("detail.emptyValue")}
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
                      ? formatDate(
                          scooter.temporaryRegistrationExpiresAt,
                          locale,
                        )
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
                label={t("detail.fields.scooterId")}
                value={scooter.id}
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
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <DeleteScooterDialog
        open={deleteOpen}
        busy={busyAction === "scooter:delete"}
        onOpenChange={setDeleteOpen}
        onConfirm={deleteScooter}
      />
    </PageLayout>
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
