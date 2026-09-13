"use client";

import type { v1 } from "@repo/api-shared";
import {
  CarFrontIcon,
  CheckIcon,
  FileTextIcon,
  IdCardIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

const icons = {
  nationalId: IdCardIcon,
  passport: IdCardIcon,
  driverLicense: CarFrontIcon,
  residencePermit: IdCardIcon,
  visa: FileTextIcon,
  proofOfAddress: FileTextIcon,
  other: FileTextIcon,
};

export function DocumentSummary({
  type,
  number,
  expiresOn,
  hasExpiryDate,
  uploaded,
  locale,
  invalidExpiry = false,
}: {
  type: v1.persons.PersonDocumentType;
  number: string;
  expiresOn: string | null;
  hasExpiryDate: boolean;
  uploaded: boolean;
  locale: string;
  invalidExpiry?: boolean;
}) {
  const t = useTranslations("persons");
  const Icon = icons[type];
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days =
    hasExpiryDate && expiresOn
      ? (Date.parse(`${expiresOn}T00:00:00Z`) - today) / 86_400_000
      : null;
  const status =
    days === null
      ? null
      : days < 0
        ? "expired"
        : days <= 30
          ? "expiresSoon"
          : "valid";
  const color =
    days === null
      ? "text-muted-foreground"
      : days < 7
        ? "text-destructive"
        : days <= 30
          ? "text-warning"
          : "text-success";
  const date = expiresOn
    ? new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${expiresOn}T00:00:00Z`))
    : invalidExpiry
      ? t("documentForm.checkDate")
      : t("documentForm.missingValue");

  return (
    <span className="flex min-w-0 items-center gap-3">
      <Icon
        aria-hidden="true"
        className="size-5 shrink-0 text-muted-foreground"
      />
      <span className="grid min-w-0 gap-1">
        <span className="font-medium text-foreground">
          {t(`documentTypes.${type}`)}
        </span>
        {type === "proofOfAddress" ? (
          <span className="flex items-center gap-1.5 text-sm font-normal text-muted-foreground">
            {uploaded ? (
              <CheckIcon aria-hidden="true" className="size-4 text-success" />
            ) : null}
            {t(
              uploaded
                ? "documentForm.uploadedSuccessfully"
                : "documentForm.notAdded",
            )}
          </span>
        ) : (
          <>
            <span className="break-words text-sm font-normal text-foreground">
              {number || t("documentForm.missingValue")}
            </span>
            <span className={`text-sm font-normal ${color}`}>
              {hasExpiryDate ? (
                <>
                  {t("documentForm.expiresShort")}{" "}
                  {expiresOn ? <time dateTime={expiresOn}>{date}</time> : date}
                  {status ? (
                    <span> · {t(`documentExpiries.${status}`)}</span>
                  ) : null}
                </>
              ) : (
                t("documentForm.noExpiryDate")
              )}
            </span>
          </>
        )}
      </span>
    </span>
  );
}
