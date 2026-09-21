"use client";

import { v1 } from "@repo/api-shared";
import { MailIcon, PhoneIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { inlineIconClassName } from "./constants";
import { DetailField } from "./DetailField";
import { DetailSectionCard } from "./DetailSection";

export function PersonContactSection({
  person,
}: {
  person: v1.persons.Person;
}) {
  const t = useTranslations("persons");

  return (
    <DetailSectionCard
      title={t("sections.contact")}
      icon={<MailIcon aria-hidden="true" className={inlineIconClassName} />}
    >
      <dl className="grid min-w-0 gap-4">
        <DetailField label={t("fields.email")} value={person.email} />
        <DetailField
          label={t("fields.phone")}
          value={person.phone}
          icon={
            <PhoneIcon aria-hidden="true" className={inlineIconClassName} />
          }
        />
      </dl>
    </DetailSectionCard>
  );
}
