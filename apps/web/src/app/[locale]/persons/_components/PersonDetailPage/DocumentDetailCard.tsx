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
  BottomSheetTrigger,
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import { CalendarDaysIcon, ChevronRightIcon, PencilIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  documentStatusClasses,
  documentStatusIcons,
  documentTypeIcons,
  inlineIconClassName,
} from "./constants";
import { DetailField } from "./DetailField";
import { DocumentFormDialog } from "./DocumentFormDialog";
import { DocumentPhotosPanel } from "./DocumentPhotosPanel";
import {
  formatCountryName,
  formatOptionalDate,
  maskSensitiveValue,
} from "./helpers";

const DRIVER_LICENSE_DOCUMENT_TYPES = [
  v1.persons.PERSON_DRIVER_LICENSE_DOCUMENT_TYPE,
] as const;

export function DocumentDetailCard({
  document,
  photos,
  locale,
  busyAction,
  onUpdate,
  onDelete,
  onUploadPhoto,
  onDeletePhoto,
}: {
  document: v1.persons.PersonDocument;
  photos: v1.persons.PersonDocumentPhoto[];
  locale: string;
  busyAction: string | null;
  onUpdate: (input: v1.persons.UpdatePersonDocumentInput) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onUploadPhoto: (
    slot: v1.persons.PersonDocumentPhotoSlot,
    file: File,
  ) => Promise<boolean>;
  onDeletePhoto: (slot: v1.persons.PersonDocumentPhotoSlot) => Promise<boolean>;
}) {
  const t = useTranslations("persons");
  const typeLabel = t(`documentTypes.${document.type}`);
  const statusLabel = t(`documentStatuses.${document.status}`);
  const emptyValue = t("detail.emptyValue");
  const TypeIcon = documentTypeIcons[document.type];
  const StatusIcon = documentStatusIcons[document.status];
  const isDriverLicense =
    document.type === v1.persons.PERSON_DRIVER_LICENSE_DOCUMENT_TYPE;
  const expiresOn = formatOptionalDate(
    document.expiresOn,
    locale,
    t("documentForm.noExpiryDate"),
  );

  return (
    <BottomSheet>
      <BottomSheetTrigger
        render={
          <button
            type="button"
            aria-label={t("actions.viewDetails", { name: typeLabel })}
            className="group/document-card w-full rounded-xl text-left outline-none"
          />
        }
      >
        <Card
          size="sm"
          className="pointer-events-none relative transition-colors group-hover/document-card:bg-muted group-focus-visible/document-card:bg-muted/60 group-active/document-card:bg-muted/60"
        >
          <CardHeader className="pr-10">
            <CardTitle className="flex min-w-0 items-center gap-2">
              <TypeIcon aria-hidden="true" className={inlineIconClassName} />
              <span className="min-w-0 truncate">{typeLabel}</span>
              <Badge
                variant="outline"
                className={cn(
                  "w-fit shrink-0",
                  documentStatusClasses[document.status],
                )}
              >
                <StatusIcon aria-hidden="true" data-icon="inline-start" />
                {statusLabel}
              </Badge>
            </CardTitle>
            <CardAction className="absolute right-(--card-spacing) top-1/2 -translate-y-1/2 self-center">
              <ChevronRightIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
            </CardAction>
          </CardHeader>
          <CardContent className="pr-10">
            <span
              className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
              aria-label={
                document.expiresOn
                  ? t("documentForm.expirySummary", { date: expiresOn })
                  : expiresOn
              }
            >
              <CalendarDaysIcon
                aria-hidden="true"
                className={inlineIconClassName}
              />
              {document.expiresOn ? (
                <span aria-hidden="true" className="font-medium">
                  {t("documentForm.expiresShort")}
                </span>
              ) : null}
              <span aria-hidden="true" className="truncate">
                {expiresOn}
              </span>
            </span>
          </CardContent>
        </Card>
      </BottomSheetTrigger>

      <BottomSheetContent className="lg:w-xl">
        <BottomSheetHeader>
          <BottomSheetTitle
            aria-label={`${typeLabel}, ${statusLabel}`}
            className="flex min-w-0 items-center gap-2"
          >
            <TypeIcon aria-hidden="true" className={inlineIconClassName} />
            <span className="min-w-0 truncate">{typeLabel}</span>
            <Badge
              variant="outline"
              className={cn(
                "w-fit shrink-0",
                documentStatusClasses[document.status],
              )}
            >
              <StatusIcon aria-hidden="true" data-icon="inline-start" />
              {statusLabel}
            </Badge>
          </BottomSheetTitle>
        </BottomSheetHeader>
        <BottomSheetBody>
          <DocumentPhotosPanel
            documentId={document.id}
            photos={photos}
            busyAction={busyAction}
            onUploadPhoto={onUploadPhoto}
            onDeletePhoto={onDeletePhoto}
          />

          <dl className="grid gap-3 sm:grid-cols-2">
            {!isDriverLicense ? (
              <DetailField
                label={t("fields.documentSeries")}
                value={document.series ?? emptyValue}
              />
            ) : null}
            <DetailField
              label={t("fields.documentNumber")}
              value={maskSensitiveValue(document.number, emptyValue)}
            />
            {!isDriverLicense ? (
              <DetailField
                label={t("fields.documentCnp")}
                value={maskSensitiveValue(document.cnp, emptyValue)}
              />
            ) : null}
            <DetailField
              label={t("fields.documentIssuingCountryCode")}
              value={formatCountryName(
                document.issuingCountryCode,
                locale,
                emptyValue,
              )}
            />
            <DetailField
              label={t("fields.documentIssuedBy")}
              value={document.issuedBy ?? emptyValue}
            />
            <DetailField
              label={t("fields.documentIssuedOn")}
              value={formatOptionalDate(document.issuedOn, locale, emptyValue)}
            />
            <DetailField
              label={t("fields.documentExpiresOn")}
              value={expiresOn}
              icon={
                <CalendarDaysIcon
                  aria-hidden="true"
                  className={inlineIconClassName}
                />
              }
            />
            <DetailField
              label={t("fields.notes")}
              value={document.notes ?? emptyValue}
              className="sm:col-span-2"
            />
          </dl>
        </BottomSheetBody>
        <BottomSheetFooter className="sm:flex-row-reverse sm:justify-start">
          <DocumentFormDialog
            title={t("detail.dialogs.editDocumentTitle")}
            triggerLabel={t("actions.editDocument")}
            triggerIcon={<PencilIcon data-icon="inline-start" />}
            triggerVariant="default"
            triggerDisabled={busyAction !== null}
            document={document}
            allowedTypes={
              isDriverLicense ? DRIVER_LICENSE_DOCUMENT_TYPES : undefined
            }
            busy={busyAction === `document:update:${document.id}`}
            deleteBusy={busyAction === `document:delete:${document.id}`}
            submitMode="update"
            onSubmit={(input) =>
              onUpdate(input as v1.persons.UpdatePersonDocumentInput)
            }
            onDelete={onDelete}
          />
          <BottomSheetClose render={<Button type="button" variant="text" />}>
            {t("actions.close")}
          </BottomSheetClose>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  );
}
