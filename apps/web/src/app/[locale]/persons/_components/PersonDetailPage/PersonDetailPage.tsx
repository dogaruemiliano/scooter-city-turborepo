"use client";

import { PageLayout } from "@repo/ui/components/page-layout";

import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";

import { v1 } from "@repo/api-shared";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useState } from "react";

import { PageTitleOverride } from "@/components/PageTitleOverride";
import { webApi } from "@/lib/api";

import { PersonAppAccess } from "./PersonAppAccess";
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
  const session = useOptionalSession();
  const locale = useLocale();
  const router = useRouter();
  const readiness = getRentalReadiness(person);
  const title = `${person.firstName} ${person.lastName}`;
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [photosByDocumentId, setPhotosByDocumentId] =
    useState<DocumentPhotosByDocumentId>(() => documentPhotos);

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
    <PageLayout>
      <PageTitleOverride title={title} />
      <PersonDetailHeader
        person={person}
        busyAction={busyAction}
        personsHref={personsHref}
        onDeletePerson={deletePerson}
      />

      {session?.user?.isSuperAdmin ? (
        <PersonAppAccess personId={person.id} />
      ) : null}
      <ReadinessSection issues={readiness.issues} />
      <div className="grid min-w-0 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <PersonProfileSection person={person} locale={locale} />
        </div>
        <PersonContactSection person={person} />
        <div className="min-w-0 lg:col-span-2">
          <PersonAddressSection person={person} />
        </div>
        <PersonNotesSection notes={person.notes} />
      </div>
      {canAccess(session?.user, "person_documents.read") ? (
        <PersonDocumentsSection
          documents={person.documents}
          photosByDocumentId={{ ...documentPhotos, ...photosByDocumentId }}
          locale={locale}
          busyAction={busyAction}
          onCreateDocument={createDocument}
          onUpdateDocument={updateDocument}
          onDeleteDocument={deleteDocument}
          onUploadDocumentPhoto={uploadDocumentPhoto}
          onDeleteDocumentPhoto={deleteDocumentPhoto}
        />
      ) : null}
      {canAccess(session?.user, "persons.audit.read") ? (
        <ActivitySection events={auditEvents} locale={locale} />
      ) : null}
    </PageLayout>
  );
}
