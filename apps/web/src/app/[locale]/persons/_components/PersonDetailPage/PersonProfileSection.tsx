"use client";

import { v1 } from "@repo/api-shared";
import { UserRoundIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { inlineIconClassName } from "./constants";
import { DetailField } from "./DetailField";
import { DetailSection } from "./DetailSection";
import { formatDateTime, formatOptionalDate } from "./helpers";

export function PersonProfileSection({
  person,
  locale,
}: {
  person: v1.persons.Person;
  locale: string;
}) {
  const t = useTranslations("persons");

  return (
    <DetailSection
      title={t("detail.sections.profile")}
      icon={
        <UserRoundIcon aria-hidden="true" className={inlineIconClassName} />
      }
    >
      <DetailField label={t("fields.firstName")} value={person.firstName} />
      <DetailField label={t("fields.lastName")} value={person.lastName} />
      <DetailField
        label={t("fields.dateOfBirth")}
        value={formatOptionalDate(
          person.dateOfBirth,
          locale,
          t("detail.emptyValue"),
        )}
      />
      <DetailField label={t("detail.fields.personId")} value={person.id} />
      <DetailField
        label={t("detail.fields.createdAt")}
        value={formatDateTime(person.createdAt, locale)}
      />
      <DetailField
        label={t("detail.fields.updatedAt")}
        value={formatDateTime(person.updatedAt, locale)}
      />
      {person.deletedAt ? (
        <DetailField
          label={t("detail.fields.deletedAt")}
          value={formatDateTime(person.deletedAt, locale)}
        />
      ) : null}
    </DetailSection>
  );
}
