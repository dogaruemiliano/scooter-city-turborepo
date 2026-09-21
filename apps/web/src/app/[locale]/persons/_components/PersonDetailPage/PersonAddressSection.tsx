"use client";

import { v1 } from "@repo/api-shared";
import { MapPinIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { inlineIconClassName } from "./constants";
import { DetailField } from "./DetailField";
import { DetailSectionCard } from "./DetailSection";
import { formatCountryName } from "./helpers";

export function PersonAddressSection({
  person,
}: {
  person: v1.persons.Person;
}) {
  const t = useTranslations("persons");
  const locale = useLocale();
  const emptyValue = t("detail.emptyValue");

  return (
    <DetailSectionCard
      title={t("sections.address")}
      icon={<MapPinIcon aria-hidden="true" className={inlineIconClassName} />}
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <dl className="grid min-w-0 content-start gap-4">
          <DetailField
            label={t("fields.country")}
            value={formatCountryName(person.countryCode, locale, emptyValue)}
          />
          <DetailField
            label={t("fields.region")}
            value={person.region ?? emptyValue}
          />
          <DetailField
            label={t("fields.city")}
            value={person.city ?? emptyValue}
          />
        </dl>
        <dl className="grid min-w-0 content-start gap-4">
          <DetailField
            label={t("fields.addressLine1")}
            value={person.addressLine1 ?? emptyValue}
          />
          <DetailField
            label={t("fields.addressLine2")}
            value={person.addressLine2 ?? emptyValue}
          />
        </dl>
      </div>
    </DetailSectionCard>
  );
}
