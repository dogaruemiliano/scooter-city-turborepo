"use client";

import { v1 } from "@repo/api-shared";
import { MapPinIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { inlineIconClassName } from "./constants";
import { DetailField } from "./DetailField";
import { DetailSection } from "./DetailSection";

export function PersonAddressSection({
  person,
}: {
  person: v1.persons.Person;
}) {
  const t = useTranslations("persons");
  const emptyValue = t("detail.emptyValue");

  return (
    <DetailSection
      title={t("sections.address")}
      icon={<MapPinIcon aria-hidden="true" className={inlineIconClassName} />}
    >
      <DetailField
        label={t("fields.countryCode")}
        value={person.countryCode ?? emptyValue}
      />
      <DetailField
        label={t("fields.region")}
        value={person.region ?? emptyValue}
      />
      <DetailField label={t("fields.city")} value={person.city ?? emptyValue} />
      <DetailField
        label={t("fields.postalCode")}
        value={person.postalCode ?? emptyValue}
      />
      <DetailField
        label={t("fields.addressLine1")}
        value={person.addressLine1 ?? emptyValue}
        className="sm:col-span-2"
      />
      <DetailField
        label={t("fields.addressLine2")}
        value={person.addressLine2 ?? emptyValue}
        className="sm:col-span-2"
      />
    </DetailSection>
  );
}
