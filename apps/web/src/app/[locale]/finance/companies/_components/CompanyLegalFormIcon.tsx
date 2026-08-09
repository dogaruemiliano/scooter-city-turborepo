import type { v1 } from "@repo/api-shared";
import {
  Building2Icon,
  HeartHandshakeIcon,
  LandmarkIcon,
  UserRoundIcon,
} from "lucide-react";

export function CompanyLegalFormIcon({
  legalForm,
}: {
  legalForm: v1.finance.CompanyLegalForm;
}) {
  if (legalForm === "ONG") {
    return <HeartHandshakeIcon aria-hidden="true" className="size-5" />;
  }
  if (["PFA", "II", "IF"].includes(legalForm)) {
    return (
      <span aria-hidden="true" className="relative block size-5">
        <UserRoundIcon className="absolute left-0 top-0 size-3.5" />
        <Building2Icon className="absolute bottom-0 right-0 size-3.5" />
      </span>
    );
  }
  if (legalForm === "OTHER") {
    return <LandmarkIcon aria-hidden="true" className="size-5" />;
  }
  return <Building2Icon aria-hidden="true" className="size-5" />;
}

export function companyDisplayName(
  company: Pick<v1.finance.Company, "legalName" | "legalForm">,
  legalFormLabel: string,
): string {
  const normalize = (value: string) =>
    value.toLocaleUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
  return normalize(company.legalName).endsWith(normalize(legalFormLabel))
    ? company.legalName
    : `${company.legalName} ${legalFormLabel}`;
}
