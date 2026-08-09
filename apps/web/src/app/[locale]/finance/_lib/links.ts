import type { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";

import { localizePath } from "@/i18n/paths";

export function claimSettlementHref(
  claim: v1.finance.OutstandingPersonalClaim,
  locale: SupportedLocale,
): string {
  const params = new URLSearchParams({
    type: "PERSONAL_FUNDS_SPLIT",
    debtorUserId: claim.debtorUserId,
    creditorUserId: claim.creditorUserId,
    amount: claim.amount,
    currency: claim.currency,
  });

  return localizePath(`/finance/transactions/new?${params}`, locale);
}
