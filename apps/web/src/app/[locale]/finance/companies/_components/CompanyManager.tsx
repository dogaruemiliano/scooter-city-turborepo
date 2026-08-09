"use client";

import { v1 } from "@repo/api-shared";
import {
  Badge,
  buttonVariants,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components";
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { FinanceEmptyState } from "../../_components/FinanceEmptyState";
import {
  CompanyLegalFormIcon,
  companyDisplayName,
} from "./CompanyLegalFormIcon";

function CompanyIdentity({
  company,
  href,
}: {
  company: v1.finance.Company;
  href: string;
}) {
  const t = useTranslations("finance");
  const displayName = companyDisplayName(
    company,
    t(`enums.companyLegalForms.${company.legalForm}`),
  );
  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
        <CompanyLegalFormIcon legalForm={company.legalForm} />
      </span>
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">
          {displayName}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {t("companies.fields.taxIdentifier")}:{" "}
          {company.taxIdentifier ?? t("common.notProvided")}
        </div>
      </div>
      <ArrowRightIcon className="ml-auto size-4 shrink-0 text-muted-foreground opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100" />
    </Link>
  );
}

export function CompanyManager({
  companies,
  companiesHref,
}: {
  companies: v1.finance.Company[];
  companiesHref: string;
}) {
  const t = useTranslations("finance");

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <Link
          href={`${companiesHref}/new`}
          className={buttonVariants({ variant: "default" })}
        >
          <PlusIcon data-icon="inline-start" />
          {t("companies.create")}
        </Link>
      </div>
      {companies.length === 0 ? (
        <FinanceEmptyState>{t("companies.empty")}</FinanceEmptyState>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("companies.columns.company")}</TableHead>
                  <TableHead>{t("companies.columns.identifier")}</TableHead>
                  <TableHead>{t("companies.columns.contact")}</TableHead>
                  <TableHead>{t("companies.columns.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell>
                      <CompanyIdentity
                        company={company}
                        href={`${companiesHref}/${encodeURIComponent(company.id)}`}
                      />
                    </TableCell>
                    <TableCell>
                      {company.taxIdentifier ??
                        company.registrationNumber ??
                        t("common.notProvided")}
                    </TableCell>
                    <TableCell>
                      <div>
                        {company.email ??
                          company.phone ??
                          t("common.notProvided")}
                      </div>
                      {company.email && company.phone ? (
                        <div className="text-xs text-muted-foreground">
                          {company.phone}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={company.isActive ? "default" : "secondary"}
                      >
                        {t(
                          company.isActive
                            ? "common.active"
                            : "common.inactive",
                        )}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="grid gap-2 md:hidden">
            {companies.map((company) => (
              <li
                key={company.id}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <article className="p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <CompanyIdentity
                      company={company}
                      href={`${companiesHref}/${encodeURIComponent(company.id)}`}
                    />
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
