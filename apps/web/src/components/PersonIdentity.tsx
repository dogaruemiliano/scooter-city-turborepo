"use client";

import { userAvatarSrc } from "@/lib/user-avatar";
import type { ComponentProps } from "react";
import { v1 } from "@repo/api-shared";
import {
  PersonCard,
  PersonDocuments,
  type PersonDocumentState,
} from "@repo/ui/components/person-card";
import { PersonRow } from "@repo/ui/components/person-row";
import { useTranslations } from "next-intl";
import { isPersonDocumentExpired } from "@/lib/person-documents";

export type PersonSummary = Pick<
  v1.persons.Person,
  "id" | "firstName" | "lastName"
> &
  Partial<Pick<v1.persons.Person, "phone" | "email" | "documents">> & {
    avatarUrl?: string;
    avatarAssetId?: string | null;
  };

function usePersonPresentation(person: PersonSummary) {
  const t = useTranslations("persons");
  const stateText: Record<PersonDocumentState, string> = {
    missing: t("list.documentNotPresent"),
    valid: t("documentExpiries.valid"),
    unverified: t("documentStatuses.unverified"),
    expired: t("documentStatuses.expired"),
    rejected: t("documentStatuses.rejected"),
  };
  const documents = person.documents?.filter((d) => !d.deletedAt);
  const indicators = documents
    ? [
        {
          type: "identity" as const,
          label: t("list.identityDocument"),
          document: documents.find((d) =>
            v1.persons.isPersonIdentityDocumentType(d.type),
          ),
        },
        {
          type: "driverLicense" as const,
          label: t("documentTypes.driverLicense"),
          document: documents.find((d) => d.type === "driverLicense"),
        },
      ].map(({ type, label, document }) => {
        const state: PersonDocumentState = !document
          ? "missing"
          : document.status === "rejected"
            ? "rejected"
            : isPersonDocumentExpired(document)
              ? "expired"
              : document.status === "verified"
                ? "valid"
                : "unverified";
        return {
          type,
          state,
          label: t("list.documentIndicatorLabel", {
            document: label,
            status: stateText[state],
          }),
        };
      })
    : undefined;
  return {
    name: `${person.firstName} ${person.lastName}`,
    description: person.phone,
    email: person.email,
    avatarUrl: userAvatarSrc(person.avatarAssetId) ?? person.avatarUrl,
    details: indicators ? (
      <PersonDocuments documents={indicators} />
    ) : undefined,
  };
}
export function PersonIdentityRow({
  person,
  action,
}: {
  person: PersonSummary;
  action?: ComponentProps<typeof PersonRow>["action"];
}) {
  return <PersonRow {...usePersonPresentation(person)} action={action} />;
}
export function PersonIdentityCard({
  person,
  ...props
}: { person: PersonSummary } & Pick<
  ComponentProps<typeof PersonCard>,
  "metadata" | "className"
>) {
  return <PersonCard {...usePersonPresentation(person)} {...props} />;
}
