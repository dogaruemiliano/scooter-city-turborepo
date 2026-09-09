import { Reflector } from "@nestjs/core";
import { v1 } from "@repo/api-shared";

import { REQUIRED_ROLES_KEY } from "../../common/authz/roles.constants";
import { FinanceController } from "./finance.controller";

describe("FinanceController role requirements", () => {
  const reflector = new Reflector();

  it.each([
    FinanceController.prototype.getCompanyIdentity,
    FinanceController.prototype.upsertCompanyIdentity,
    FinanceController.prototype.getCompanyAssociates,
    FinanceController.prototype.updateCompanyAssociates,
  ])("restricts company management handlers to SUPER_ADMIN", (handler) => {
    expect(
      reflector.getAllAndOverride<string[]>(REQUIRED_ROLES_KEY, [
        handler,
        FinanceController,
      ]),
    ).toEqual([v1.auth.AUTH_ROLES.SUPER_ADMIN]);
  });

  it("keeps the remaining finance handlers available to ADMIN users", () => {
    expect(
      reflector.getAllAndOverride<string[]>(REQUIRED_ROLES_KEY, [
        FinanceController.prototype.listBooks,
        FinanceController,
      ]),
    ).toEqual([v1.auth.AUTH_ROLES.ADMIN]);
  });
});
