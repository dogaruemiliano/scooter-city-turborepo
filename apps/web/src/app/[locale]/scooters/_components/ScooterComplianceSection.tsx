"use client";

import { useLocale, useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import { Badge, FormSection } from "@repo/ui/components";
import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";

/** Availability summaries use persisted values; edits belong to the scooter editor. */
export function ScooterComplianceSection({
  scooter,
}: {
  scooter: v1.scooters.Scooter;
}) {
  const user = useOptionalSession()?.user;
  const locale = useLocale();
  const t = useTranslations("scooters.compliance");
  const ti = useTranslations("scooters.itp");
  const insurance = useTranslations("scooters.insurance");
  if (!canAccess(user, "scooter_documents.read")) return null;

  const today = v1.common.dateOnlyToday();
  const itpStatus = scooter.itpStatus ?? "missing";
  const validUntil = scooter.itpValidUntil;
  // UTC date-only arithmetic avoids time-of-day and daylight-saving rounding.
  const days = validUntil
    ? Math.round(
        (Date.parse(`${validUntil}T00:00:00Z`) -
          Date.parse(`${today}T00:00:00Z`)) /
          86_400_000,
      )
    : null;
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00Z`));
  const policies = scooter.insurancePolicies ?? [];
  const insuranceStatus = v1.scooters.rentalInsuranceStatus(policies, today);

  return (
    <div className="grid gap-6">
      <FormSection
        panel
        title={ti("title")}
        columns={1}
        status={
          <Badge
            variant={
              itpStatus === "active"
                ? "success"
                : itpStatus === "expired" || itpStatus === "failed"
                  ? "destructive"
                  : "warning"
            }
          >
            {ti(`status.${itpStatus}`)}
          </Badge>
        }
      >
        {validUntil ? (
          <dl>
            <dt className="text-sm font-medium text-muted-foreground">
              {ti("validUntil")}
            </dt>
            <dd className="mt-1 flex flex-wrap items-baseline gap-2">
              <time dateTime={validUntil} className="text-base font-semibold">
                {date(validUntil)}
              </time>
              {days !== null &&
              (itpStatus === "active" ||
                itpStatus === "expiring" ||
                itpStatus === "expired") ? (
                <span className="text-sm text-muted-foreground">
                  (
                  {days < 0
                    ? t("expiredDaysAgo", { count: -days })
                    : days === 0
                      ? t("expiresToday")
                      : t("daysRemaining", { count: days })}
                  )
                </span>
              ) : null}
            </dd>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noItpValidity")}</p>
        )}
      </FormSection>
      <FormSection
        panel
        title={insurance("title")}
        columns={1}
        status={
          insuranceStatus !== "missing" ? (
            <Badge
              variant={
                insuranceStatus === "active"
                  ? "success"
                  : insuranceStatus === "expired"
                    ? "destructive"
                    : "warning"
              }
            >
              {insurance(`status.${insuranceStatus}`)}
            </Badge>
          ) : undefined
        }
      >
        {policies.length ? (
          <ul className="grid gap-4">
            {policies.map((policy) => {
              const status = v1.scooters.insuranceStatus(policy, today);
              return (
                <li key={policy.id} className="grid gap-3">
                  {policies.length > 1 ? (
                    <Badge
                      variant={
                        status === "active"
                          ? "success"
                          : status === "expired"
                            ? "destructive"
                            : "warning"
                      }
                    >
                      {insurance(`status.${status}`)}
                    </Badge>
                  ) : null}
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">
                        {insurance("fields.validUntil")}
                      </dt>
                      <dd className="mt-1 text-base font-semibold">
                        {policy.validUntil ? (
                          <time dateTime={policy.validUntil}>
                            {date(policy.validUntil)}
                          </time>
                        ) : (
                          t("validityUnknown")
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">
                        {insurance("fields.insuredName")}
                      </dt>
                      <dd className="mt-1 text-base font-semibold wrap-anywhere">
                        {policy.insuredName || insurance("unknownInsured")}
                      </dd>
                    </div>
                    {status === "upcoming" && policy.validFrom ? (
                      <div>
                        <dt className="text-sm font-medium text-muted-foreground">
                          {insurance("fields.validFrom")}
                        </dt>
                        <dd className="mt-1">
                          <time dateTime={policy.validFrom}>
                            {date(policy.validFrom)}
                          </time>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noInsurance")}</p>
        )}
      </FormSection>
    </div>
  );
}
