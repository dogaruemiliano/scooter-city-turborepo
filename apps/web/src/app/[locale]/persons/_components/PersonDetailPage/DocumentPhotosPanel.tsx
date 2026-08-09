"use client";

import { v1 } from "@repo/api-shared";
import { useTranslations } from "next-intl";

import { webApi } from "@/lib/api";

import { DocumentPhotoCard } from "./DocumentPhotoCard";

export function DocumentPhotosPanel({
  documentId,
  photos,
  busyAction,
  onUploadPhoto,
  onDeletePhoto,
}: {
  documentId: string;
  photos: v1.persons.PersonDocumentPhoto[];
  busyAction: string | null;
  onUploadPhoto: (
    slot: v1.persons.PersonDocumentPhotoSlot,
    file: File,
  ) => Promise<boolean>;
  onDeletePhoto: (slot: v1.persons.PersonDocumentPhotoSlot) => Promise<boolean>;
}) {
  const t = useTranslations("persons");
  const photosBySlot = new Map(photos.map((photo) => [photo.slot, photo]));

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {v1.persons.PERSON_DOCUMENT_PHOTO_SLOTS.filter(
          (slot) => slot !== "other" || photosBySlot.has(slot),
        ).map((slot) => {
          const photo = photosBySlot.get(slot);
          const inputId = `document-${documentId}-${slot}-photo`;
          const deleteBusy =
            busyAction === `document-photo:delete:${documentId}:${slot}`;
          const disabled = busyAction !== null;
          const slotLabel = t(`documentPhotoSlots.${slot}`);
          const imageUrl = photo ? webApi.url(photo.contentUrl) : null;

          return (
            <DocumentPhotoCard
              key={slot}
              inputId={inputId}
              slot={slot}
              slotLabel={slotLabel}
              photo={photo}
              imageUrl={imageUrl}
              deleteBusy={deleteBusy}
              disabled={disabled}
              onUploadPhoto={onUploadPhoto}
              onDeletePhoto={onDeletePhoto}
            />
          );
        })}
      </div>
    </div>
  );
}
