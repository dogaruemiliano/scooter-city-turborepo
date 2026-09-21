import { Reflector } from "@nestjs/core";
import { v1 } from "@repo/api-shared";

import { REQUIRED_ROLES_KEY } from "../../common/authz/roles.constants";
import { FinanceController } from "./finance.controller";

describe("FinanceController role requirements", () => {
  const reflector = new Reflector();

  it.each([
    // Metadata belongs to the original methods; these references are never invoked.
    /* eslint-disable @typescript-eslint/unbound-method */
    FinanceController.prototype.createBook,
    FinanceController.prototype.updateBook,
    FinanceController.prototype.getCompanyIdentity,
    FinanceController.prototype.upsertCompanyIdentity,
    FinanceController.prototype.getCompanyAssociates,
    FinanceController.prototype.updateCompanyAssociates,
    /* eslint-enable @typescript-eslint/unbound-method */
  ])(
    "restricts finance and company management handlers to SUPER_ADMIN",
    (handler) => {
      expect(
        reflector.getAllAndOverride<string[]>(REQUIRED_ROLES_KEY, [
          handler,
          FinanceController,
        ]),
      ).toEqual([v1.auth.AUTH_ROLES.SUPER_ADMIN]);
    },
  );

  it("keeps the remaining finance handlers available to ADMIN users", () => {
    expect(
      reflector.getAllAndOverride<string[]>(REQUIRED_ROLES_KEY, [
        // eslint-disable-next-line @typescript-eslint/unbound-method -- Inspect the original method's metadata without invoking it.
        FinanceController.prototype.listBooks,
        FinanceController,
      ]),
    ).toEqual([v1.auth.AUTH_ROLES.ADMIN]);
  });
});
