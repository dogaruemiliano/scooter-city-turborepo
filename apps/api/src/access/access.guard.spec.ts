import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AccessGuard } from "./access.guard";
import {
  ACCESS_POLICY,
  RequireAllScope,
  RequireAnyAllScope,
  RequirePermissions,
  RequireSuperAdmin,
  SelfService,
} from "./access.decorators";
import { Public } from "../auth/decorators/public.decorator";
import { type AccessSnapshot } from "./access.resolver";
import { type AccessService } from "./access.service";
import { projectDomainResponse } from "./access-projection.interceptor";
class TestController {
  missing() {}
  @Public() public() {}
  @SelfService() self() {}
  @RequireSuperAdmin() admin() {}
  @RequirePermissions("problems.read") problems() {}
  @RequireAllScope("scooters.read") scooters(this: void) {}
  @RequireAllScope("scooters.update") update() {}
  @RequireAnyAllScope(
    "scooters.create",
    "scooters.update",
    "scooter_documents.write",
    "scooter_documents.extract",
  )
  editorSession() {}
}
const snapshot: AccessSnapshot = {
  userId: "u",
  isSuperAdmin: false,
  effectiveScopes: {},
  accessRevision: 1,
  portalEligible: false,
  roleVersions: [],
};
const context = (
  method: keyof TestController,
  user?: { id: string; access?: AccessSnapshot },
  body = {},
) =>
  ({
    getHandler: () => TestController.prototype[method],
    getClass: () => TestController,
    switchToHttp: () => ({ getRequest: () => ({ user, body }) }),
  }) as unknown as ExecutionContext;
describe("default-deny authorization", () => {
  const access = { getSnapshot: jest.fn().mockResolvedValue(snapshot) };
  const guard = new AccessGuard(
    new Reflector(),
    access as unknown as AccessService,
  );
  it("denies unannotated endpoints even for super admins", async () =>
    expect(
      guard.canActivate(
        context("missing", {
          id: "u",
          access: { ...snapshot, isSuperAdmin: true },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException));
  it("allows only explicit public or admitted self-service routes without grants", async () => {
    await expect(guard.canActivate(context("public"))).resolves.toBe(true);
    await expect(guard.canActivate(context("self", { id: "u" }))).resolves.toBe(
      true,
    );
    await expect(
      guard.canActivate(context("problems", { id: "u" })),
    ).rejects.toThrow();
  });
  it("roleless grants work but cannot reach super admin policy", async () => {
    const user = {
      id: "u",
      access: {
        ...snapshot,
        effectiveScopes: { "problems.read": ["ASSIGNED"] as const },
      },
    };
    await expect(
      guard.canActivate(context("problems", user as never)),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(context("admin", user as never)),
    ).rejects.toThrow();
  });
  it("assigned scooter permission cannot read full operational DTO", async () => {
    await expect(
      guard.canActivate(
        context("scooters", {
          id: "u",
          access: {
            ...snapshot,
            effectiveScopes: { "scooters.read": ["ASSIGNED"] },
          },
        }),
      ),
    ).rejects.toThrow();
  });
  it("nested document mutations require independent document authority", async () => {
    await expect(
      guard.canActivate(
        context(
          "update",
          {
            id: "u",
            access: {
              ...snapshot,
              effectiveScopes: { "scooters.update": ["ALL"] },
            },
          },
          { removedDocumentIds: ["private"] },
        ),
      ),
    ).rejects.toThrow();
  });
  it.each([
    "scooters.create",
    "scooters.update",
    "scooter_documents.write",
    "scooter_documents.extract",
  ])(
    "allows editor infrastructure with %s while retaining scope and nested checks",
    async (key) => {
      const user = {
        id: "u",
        access: { ...snapshot, effectiveScopes: { [key]: ["ALL"] } },
      };
      await expect(
        guard.canActivate(context("editorSession", user as never)),
      ).resolves.toBe(true);
      await expect(
        guard.canActivate(
          context("editorSession", { id: "u", access: snapshot }),
        ),
      ).rejects.toThrow();
      if (key !== "scooter_documents.write")
        await expect(
          guard.canActivate(
            context("editorSession", user as never, {
              removedDocumentIds: ["private"],
            }),
          ),
        ).rejects.toThrow();
    },
  );
  it("does not admit assigned-only grants through an alternative ALL policy", async () => {
    await expect(
      guard.canActivate(
        context("editorSession", {
          id: "u",
          access: {
            ...snapshot,
            effectiveScopes: { "scooters.update": ["ASSIGNED"] },
          },
        }),
      ),
    ).rejects.toThrow();
  });
  it("embedded documents and raw extraction fields are stripped without grants", () => {
    expect(
      projectDomainResponse(
        {
          items: [
            {
              id: "a",
              fleetNumber: 1,
              documents: [{ assetId: "private" }],
              insurancePolicies: [{}],
              insuranceAttention: "expired",
              civRawFields: { secret: 1 },
              civVersion: "2024",
              civIssuedAt: "2025-01-01",
              civIssuingAuthority: "private",
            },
          ],
        },
        snapshot,
      ),
    ).toEqual({ items: [{ id: "a", fleetNumber: 1 }] });
    expect(
      projectDomainResponse({ firstName: "A", documents: [{}] }, snapshot),
    ).toEqual({ firstName: "A", documents: [] });
  });
  it("declares stable policy metadata", () =>
    expect(
      Reflect.getMetadata(ACCESS_POLICY, TestController.prototype.scooters),
    ).toEqual({ kind: "permissions", keys: ["scooters.read"], scope: "ALL" }));
});
