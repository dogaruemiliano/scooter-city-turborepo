import { v1 } from "@repo/api-shared";

import { webApi } from "@/lib/api";

export function saveCompanyAssociates(
  input: v1.finance.UpdateCompanyAssociatesInput,
) {
  return webApi.fetch(
    v1.finance.ROUTES.companyAssociates,
    v1.finance.companyAssociatesSchema,
    { method: "PUT", json: input },
  );
}
