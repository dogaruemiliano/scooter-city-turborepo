"use client";

import { v1 } from "@repo/api-shared";
import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import {
  CalendarDaysIcon,
  PencilIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { ConfirmationDialog } from "./ConfirmationDialog";
import {
  documentStatusClasses,
  documentStatusIcons,
  documentTypeIcons,
  inlineIconClassName,
} from "./constants";
import { DetailField } from "./DetailField";
import { DocumentFormDialog } from "./DocumentFormDialog";
import { DocumentPhotosPanel } from "./DocumentPhotosPanel";
import { DocumentStatusSelect } from "./DocumentStatusSelect";
import { formatOptionalDate, maskSensitiveValue } from "./helpers";

export function DocumentDetailCard({
  document,
  photos,
  locale,
  busyAction,
  onUpdate,
  onReplace,
  onDelete,
  onUploadPhoto,
  onDeletePhoto,
}: {
  document: v1.persons.PersonDocument;
  photos: v1.persons.PersonDocumentPhoto[];
  locale: string;
  busyAction: string | null;
  onUpdate: (input: v1.persons.UpdatePersonDocumentInput) => Promise<boolean>;
  onReplace: (input: v1.persons.CreatePersonDocumentInput) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onUploadPhoto: (
    slot: v1.persons.PersonDocumentPhotoSlot,
    file: File,
  ) => Promise<boolean>;
  onDeletePhoto: (slot: v1.persons.PersonDocumentPhotoSlot) => Promise<boolean>;
}) {
  const t = useTranslations("persons");
  const TypeIcon = documentTypeIcons[document.type];
  const StatusIcon = documentStatusIcons[document.status];
  const shouldShowReplace =
    document.status === "expired" || document.status === "rejected";

  return (
    <Card size="sm">
      <CardHeader className="gap-3 has-data-[slot=card-action]:grid-cols-1 sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
        <CardTitle className="flex min-w-0 items-center gap-2">
          <TypeIcon
            aria-label={t(`documentTypes.${document.type}`)}
            className={inlineIconClassName}
          />
          <span className="min-w-0 truncate">
            {t(`documentTypes.${document.type}`)}
          </span>
        </CardTitle>
        <CardAction className="col-start-1 row-start-2 justify-self-start sm:col-start-2 sm:row-start-1 sm:justify-self-end">
          <div className="flex flex-wrap gap-2">
            {shouldShowReplace ? (
              <DocumentFormDialog
                title={t("detail.dialogs.replaceDocumentTitle")}
                triggerLabel={t("actions.replaceDocument")}
                triggerIcon={<RefreshCwIcon data-icon="inline-start" />}
                document={document}
                busy={busyAction === `document:replace:${document.id}`}
                submitMode="create"
                onSubmit={(input) =>
                  onReplace(input as v1.persons.CreatePersonDocumentInput)
                }
              />
            ) : null}
            <DocumentFormDialog
              title={t("detail.dialogs.editDocumentTitle")}
              triggerLabel={t("actions.editDocument")}
              triggerIcon={<PencilIcon data-icon="inline-start" />}
              document={document}
              busy={busyAction === `document:update:${document.id}`}
              submitMode="update"
              onSubmit={(input) =>
                onUpdate(input as v1.persons.UpdatePersonDocumentInput)
              }
            />
            <ConfirmationDialog
              triggerLabel={t("actions.deleteDocument")}
              triggerIcon={<Trash2Icon data-icon="inline-start" />}
              title={t("detail.dialogs.deleteDocumentTitle")}
              description={t("detail.dialogs.deleteDocumentDescription")}
              confirmLabel={t("actions.deleteDocument")}
              busy={busyAction === `document:delete:${document.id}`}
              onConfirm={onDelete}
            />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge
            variant="outline"
            className={cn("w-fit", documentStatusClasses[document.status])}
          >
            <StatusIcon
              aria-label={t(`documentStatuses.${document.status}`)}
              data-icon="inline-start"
            />
            {t(`documentStatuses.${document.status}`)}
          </Badge>
          <DocumentStatusSelect
            value={document.status}
            disabled={busyAction !== null}
            onChange={(status) => onUpdate({ status })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("detail.documents.masked")}
        </p>

        <DocumentPhotosPanel
          documentId={document.id}
          photos={photos}
          busyAction={busyAction}
          onUploadPhoto={onUploadPhoto}
          onDeletePhoto={onDeletePhoto}
        />

        <dl className="grid gap-3 sm:grid-cols-2">
          <DetailField
            label={t("fields.documentSeries")}
            value={document.series ?? t("detail.emptyValue")}
          />
          <DetailField
            label={t("fields.documentNumber")}
            value={maskSensitiveValue(document.number, t("detail.emptyValue"))}
          />
          <DetailField
            label={t("fields.documentCnp")}
            value={maskSensitiveValue(document.cnp, t("detail.emptyValue"))}
          />
          <DetailField
            label={t("fields.documentIssuingCountryCode")}
            value={document.issuingCountryCode ?? t("detail.emptyValue")}
          />
          <DetailField
            label={t("fields.documentIssuedBy")}
            value={document.issuedBy ?? t("detail.emptyValue")}
          />
          <DetailField
            label={t("fields.documentIssuedOn")}
            value={formatOptionalDate(
              document.issuedOn,
              locale,
              t("detail.emptyValue"),
            )}
          />
          <DetailField
            label={t("fields.documentExpiresOn")}
            value={formatOptionalDate(
              document.expiresOn,
              locale,
              t("detail.emptyValue"),
            )}
            icon={
              <CalendarDaysIcon
                aria-hidden="true"
                className={inlineIconClassName}
              />
            }
          />
          <DetailField
            label={t("detail.fields.documentId")}
            value={document.id}
          />
          <DetailField
            label={t("fields.notes")}
            value={document.notes ?? t("detail.emptyValue")}
            className="sm:col-span-2"
          />
        </dl>
      </CardContent>
    </Card>
  );
}
