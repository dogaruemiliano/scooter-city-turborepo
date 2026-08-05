"use client";

import { v1 } from "@repo/api-shared";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useState } from "react";

import { PageTitleOverride } from "@/components/PageTitleOverride";
import { webApi } from "@/lib/api";

import { ActivitySection } from "./ActivitySection";
import {
  getRentalReadiness,
  removeDocumentPhoto,
  upsertDocumentPhoto,
} from "./helpers";
import { PersonAddressSection } from "./PersonAddressSection";
import { PersonContactSection } from "./PersonContactSection";
import { PersonDetailHeader } from "./PersonDetailHeader";
import { PersonDocumentsSection } from "./PersonDocumentsSection";
import { PersonNotesSection } from "./PersonNotesSection";
import { PersonProfileSection } from "./PersonProfileSection";
import { ReadinessSection } from "./ReadinessSection";
import type {
  DocumentPhotosByDocumentId,
  PersonDetailPageProps,
} from "./types";

export function PersonDetailPage({
  person,
  auditEvents,
  documentPhotos,
  personsHref,
}: PersonDetailPageProps) {
  const locale = useLocale();
  const router = useRouter();
  const readiness = getRentalReadiness(person);
  const title = `${person.firstName} ${person.lastName}`;
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [photosByDocumentId, setPhotosByDocumentId] =
    useState<DocumentPhotosByDocumentId>(() => documentPhotos);

  async function updatePerson(
    input: v1.persons.UpdatePersonInput,
  ): Promise<boolean> {
    setBusyAction("person:update");
    try {
      await webApi.fetch(
        v1.persons.ROUTES.update(person.id),
        v1.persons.personSchema,
        { method: "PATCH", json: input },
      );
      router.refresh();
      return true;
    } catch {
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function deletePerson(): Promise<boolean> {
    setBusyAction("person:delete");
    try {
      await webApi.fetch(
        v1.persons.ROUTES.delete(person.id),
        v1.common.noContentSchema,
        {
          method: "DELETE",
        },
      );
      router.replace(personsHref);
      router.refresh();
      return true;
    } catch {
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function createDocument(
    input: v1.persons.CreatePersonDocumentInput,
  ): Promise<boolean> {
    setBusyAction("document:create");
    try {
      await webApi.fetch(
        v1.persons.ROUTES.documents.create(person.id),
        v1.persons.personDocumentSchema,
        { method: "POST", json: input },
      );
      router.refresh();
      return true;
    } catch {
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function updateDocument(
    documentId: string,
    input: v1.persons.UpdatePersonDocumentInput,
  ): Promise<boolean> {
    setBusyAction(`document:update:${documentId}`);
    try {
      await webApi.fetch(
        v1.persons.ROUTES.documents.update(person.id, documentId),
        v1.persons.personDocumentSchema,
        { method: "PATCH", json: input },
      );
      router.refresh();
      return true;
    } catch {
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteDocument(documentId: string): Promise<boolean> {
    setBusyAction(`document:delete:${documentId}`);
    try {
      await webApi.fetch(
        v1.persons.ROUTES.documents.delete(person.id, documentId),
        v1.common.noContentSchema,
        { method: "DELETE" },
      );
      router.refresh();
      return true;
    } catch {
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function uploadDocumentPhoto(
    documentId: string,
    slot: v1.persons.PersonDocumentPhotoSlot,
    file: File,
  ): Promise<boolean> {
    setBusyAction(`document-photo:upload:${documentId}:${slot}`);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const photo = await webApi.fetch(
        v1.persons.ROUTES.documents.photos.upsert(person.id, documentId, slot),
        v1.persons.personDocumentPhotoSchema,
        { method: "PUT", body: formData },
      );

      setPhotosByDocumentId((current) =>
        upsertDocumentPhoto(current, documentId, photo),
      );
      return true;
    } catch {
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteDocumentPhoto(
    documentId: string,
    slot: v1.persons.PersonDocumentPhotoSlot,
  ): Promise<boolean> {
    setBusyAction(`document-photo:delete:${documentId}:${slot}`);
    try {
      await webApi.fetch(
        v1.persons.ROUTES.documents.photos.delete(person.id, documentId, slot),
        v1.common.noContentSchema,
        { method: "DELETE" },
      );

      setPhotosByDocumentId((current) =>
        removeDocumentPhoto(current, documentId, slot),
      );
      return true;
    } catch {
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <PageTitleOverride title={title} />
      <PersonDetailHeader
        person={person}
        personsHref={personsHref}
        busyAction={busyAction}
        onUpdatePerson={updatePerson}
        onDeletePerson={deletePerson}
      />

      <ReadinessSection issues={readiness.issues} />
      <PersonProfileSection person={person} locale={locale} />
      <PersonContactSection person={person} />
      <PersonAddressSection person={person} />
      <PersonNotesSection notes={person.notes} />
      <PersonDocumentsSection
        documents={person.documents}
        photosByDocumentId={photosByDocumentId}
        locale={locale}
        busyAction={busyAction}
        onCreateDocument={createDocument}
        onUpdateDocument={updateDocument}
        onDeleteDocument={deleteDocument}
        onUploadDocumentPhoto={uploadDocumentPhoto}
        onDeleteDocumentPhoto={deleteDocumentPhoto}
      />
      <ActivitySection events={auditEvents} locale={locale} />
    </div>
  );
}
