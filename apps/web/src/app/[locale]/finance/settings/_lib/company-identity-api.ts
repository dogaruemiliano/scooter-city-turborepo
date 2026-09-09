import { v1 } from "@repo/api-shared";

import { webApi } from "@/lib/api";

export function saveCompanyIdentity(
  input: v1.finance.UpsertFinanceLegalIdentityInput,
) {
  return webApi.fetch(
    v1.finance.ROUTES.companyIdentity,
    v1.finance.financeLegalIdentitySchema,
    { method: "PUT", json: input },
  );
}
