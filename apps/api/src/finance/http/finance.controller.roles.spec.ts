import { Reflector } from "@nestjs/core";

import {
  ACCESS_POLICY,
  type AccessPolicy,
} from "../../access/access.decorators";
import { FinanceController } from "./finance.controller";

describe("FinanceController permission requirements", () => {
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
        reflector.getAllAndOverride<AccessPolicy>(ACCESS_POLICY, [
          handler,
          FinanceController,
        ]),
      ).toEqual({ kind: "super" });
    },
  );

  it("requires the corresponding permission on ordinary finance handlers", () => {
    expect(
      reflector.getAllAndOverride<AccessPolicy>(ACCESS_POLICY, [
        // eslint-disable-next-line @typescript-eslint/unbound-method -- Inspect the original method's metadata without invoking it.
        FinanceController.prototype.listBooks,
        FinanceController,
      ]),
    ).toEqual({
      kind: "permissions",
      keys: ["finance.books.read"],
      scope: "ALL",
    });
  });
});
