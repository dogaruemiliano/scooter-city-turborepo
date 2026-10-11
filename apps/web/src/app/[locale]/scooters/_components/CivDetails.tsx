"use client";
import { v1 } from "@repo/api-shared";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components";
import { useLocale, useTranslations } from "next-intl";
import { isRetiredCivRawLabel } from "./scooter-document-sources";

// These values already appear in the page's identity/technical sections.
const alreadyDisplayed = new Set([
  "brandId",
  "vin",
  "manufactureYear",
  "engineCode",
  "engineDisplacementCc",
  "powerKw",
  "color",
]);

export function CivDetails({ scooter }: { scooter: v1.scooters.Scooter }) {
  const t = useTranslations("scooters");
  const locale = useLocale();
  const version = scooter.civVersion ?? "unknown";
  const fields = (
    Object.keys(v1.vehicleCiv.CIV_FIELD_MAPPING) as v1.vehicleCiv.CivField[]
  ).filter((field) => !alreadyDisplayed.has(field) && scooter[field] != null);
  const hasMetadata =
    scooter.civNumber ||
    scooter.civIssuedAt ||
    scooter.civIssuingAuthority ||
    version !== "unknown";
  const originalFields = Object.entries(scooter.civRawFields ?? {}).filter(
    ([code]) => !isRetiredCivRawLabel(code),
  );
  if (!fields.length && !hasMetadata && !originalFields.length) return null;
  const format = (field: v1.vehicleCiv.CivField) => {
    const value = scooter[field];
    if ((v1.scooters.SCOOTER_CIV_FIELDS as readonly string[]).includes(field)) {
      const name = field as (typeof v1.scooters.SCOOTER_CIV_FIELDS)[number];
      return value === "other"
        ? (scooter[`${name}Other`] ?? t("detail.emptyValue"))
        : t(`civOptions.${name}.${value}`);
    }
    return typeof value === "number"
      ? new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(
          value,
        )
      : String(value);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sections.civAdditional")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">
              {t("fields.civVersion")}
            </dt>
            <dd>{version === "unknown" ? t("civ.unknownVersion") : version}</dd>
          </div>
          {(["civNumber", "civIssuedAt", "civIssuingAuthority"] as const).map(
            (field) =>
              scooter[field] ? (
                <div key={field}>
                  <dt className="text-sm text-muted-foreground">
                    {t(`fields.${field}`)}
                  </dt>
                  <dd>{scooter[field]}</dd>
                </div>
              ) : null,
          )}
          {fields.map((field) => (
            <div key={field}>
              <dt className="text-sm text-muted-foreground">
                {t(`fields.${field}`)}{" "}
                {v1.vehicleCiv.civFieldHint(version, field)}
              </dt>
              <dd className="whitespace-pre-wrap break-words">
                {format(field)}
              </dd>
            </div>
          ))}
        </dl>
        {originalFields.length ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              {t("civ.originalValues")}
            </summary>
            <dl className="mt-4 grid gap-3">
              {originalFields.map(([code, value]) => (
                <div key={code}>
                  <dt className="text-sm text-muted-foreground">{code}</dt>
                  <dd className="whitespace-pre-wrap break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
