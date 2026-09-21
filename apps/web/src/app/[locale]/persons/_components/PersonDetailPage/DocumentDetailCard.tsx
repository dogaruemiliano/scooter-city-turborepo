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
import { DocumentSummary } from "../DocumentSummary";
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
        <span className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 group-hover/document-card:bg-muted group-focus-visible/document-card:bg-muted">
          <DocumentSummary
            type={document.type}
            number={[
              document.type === "passport"
                ? ""
                : document.series,
              document.number,
            ]
              .filter(Boolean)
              .join(" ")}
            expiresOn={document.expiresOn}
            hasExpiryDate={Boolean(document.expiresOn)}
            uploaded={photos.some((photo) => photo.slot === "front")}
            locale={locale}
          />
          <ChevronRightIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        </span>
      </BottomSheetTrigger>

      <BottomSheetContent className="lg:w-document-editor lg:max-w-document-editor">
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
            documentType={document.type}
            nationalIdFormat={document.nationalIdFormat}
            photos={photos}
            busyAction={busyAction}
            onUploadPhoto={onUploadPhoto}
            onDeletePhoto={onDeletePhoto}
          />

          <dl className="grid gap-3 sm:grid-cols-2">
            {document.type !== "proofOfAddress" ? (
              <>
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

                <DetailField
                  label={t("fields.documentIssuingCountryCode")}
                  value={formatCountryName(
                    document.issuingCountryCode,
                    locale,
                    emptyValue,
                  )}
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
              </>
            ) : null}
            <DetailField
              label={t("fields.notes")}
              value={document.notes ?? emptyValue}
              className="sm:col-span-2"
            />
          </dl>
          {isDriverLicense ? (
            <section className="grid gap-3" aria-label={t("license.title")}>
              <h3 className="text-sm font-medium">{t("license.title")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("license.reviewHelp")}
              </p>
              {(document.licenseCategories ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("license.empty")}
                </p>
              ) : null}
              {(document.licenseCategories ?? []).map((entry) => (
                <dl
                  key={entry.category}
                  className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2"
                >
                  <DetailField
                    label={t("license.category")}
                    value={entry.category}
                  />
                  <DetailField
                    label={t("license.issuedOn")}
                    value={formatOptionalDate(
                      entry.issuedOn,
                      locale,
                      emptyValue,
                    )}
                  />
                  <DetailField
                    label={t("license.expiresOn")}
                    value={formatOptionalDate(
                      entry.expiresOn,
                      locale,
                      emptyValue,
                    )}
                  />
                  <DetailField
                    label={t("license.restrictions")}
                    value={entry.restrictions ?? emptyValue}
                  />
                </dl>
              ))}
            </section>
          ) : null}
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
