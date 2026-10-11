import { UnauthorizedException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";

import type { Env } from "../../../config/env";
import type { Prisma, User } from "../../../generated/prisma/client";
import type { PrismaService } from "../../../prisma/prisma.service";
import type { KeyRing } from "../../utils/keys";
import { CoreAuthService } from "./core-auth.service";
import { OAuthAccountResolver } from "./oauth-account-resolver.service";

const user = {
  id: "invited-user",
  email: "member@example.com",
  roles: [],
  deletedAt: null,
  loginStatus: "ACTIVE",
} as unknown as User;

function setup(current: User | null = user) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: {
      findFirst: jest.fn().mockResolvedValue(current),
      findUnique: jest.fn().mockResolvedValue(current),
      update: jest.fn().mockResolvedValue({ ...user, loginStatus: "ACTIVE" }),
      create: jest.fn(),
    },
    userInvitation: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    authAccount: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "provider-link" }),
      update: jest.fn(),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    session: { create: jest.fn().mockResolvedValue({ id: "new-session" }) },
    refreshToken: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn(
      (action: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        action(tx as unknown as Prisma.TransactionClient),
    ),
  } as unknown as PrismaService;
  const jwt = {
    sign: jest.fn().mockReturnValue("signed-token"),
    decode: jest.fn().mockReturnValue({}),
  } as unknown as JwtService;
  const core = new CoreAuthService(
    prisma,
    jwt,
    {
      JWT_ACCESS_TTL: "15m",
      JWT_REFRESH_TTL: "30d",
      REFRESH_TOKEN_HMAC_SECRET: "test-key",
    } as Env,
    {} as KeyRing,
  );
  return { tx, core, resolver: new OAuthAccountResolver(prisma, core) };
}

const oauthInput = {
  provider: "google",
  providerId: "google-subject",
  email: user.email,
  emailVerified: true,
  firstName: null,
  lastName: null,
  existingEmailPolicy: "sync",
} as const;

describe("Closed authentication admission", () => {
  it.each(["DISABLED", "SUSPENDED"] as const)(
    "does not issue a session for a %s identity",
    async (loginStatus) => {
      const { core, tx } = setup({ ...user, loginStatus });
      await expect(core.issueSession({ user })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(tx.session.create).not.toHaveBeenCalled();
      expect(tx.refreshToken.create).not.toHaveBeenCalled();
    },
  );

  it("rejects an invited account whose invitation expired or was cancelled", async () => {
    const { core, tx } = setup({ ...user, loginStatus: "INVITED" });
    await expect(core.issueSession({ user })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.session.create).not.toHaveBeenCalled();
  });

  it("activates the current invitation and issues the session together", async () => {
    const { core, tx } = setup({ ...user, loginStatus: "INVITED" });
    tx.userInvitation.findFirst.mockResolvedValue({
      id: "invitation",
      generation: 2,
    });
    const proofIssuedAt = new Date();
    await expect(
      core.issueSession({ user, proofIssuedAt }),
    ).resolves.toMatchObject({ sessionId: "new-session" });
    expect(tx.userInvitation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { lte: proofIssuedAt },
          email: user.email,
        }) as unknown,
      }),
    );
    expect(tx.userInvitation.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.session.create).toHaveBeenCalledTimes(1);
  });

  it("does not issue a session if the invitation claim loses a concurrent cancellation", async () => {
    const { core, tx } = setup({ ...user, loginStatus: "INVITED" });
    tx.userInvitation.findFirst.mockResolvedValue({
      id: "invitation",
      generation: 2,
    });
    tx.userInvitation.updateMany.mockResolvedValue({ count: 0 });
    await expect(core.issueSession({ user })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.session.create).not.toHaveBeenCalled();
  });

  it("does not create a user, provider link, or session for an unknown verified OAuth identity", async () => {
    const { resolver, tx } = setup(null);
    await expect(resolver.resolve(oauthInput)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.authAccount.create).not.toHaveBeenCalled();
    expect(tx.session.create).not.toHaveBeenCalled();
  });

  it("does not link an OAuth identity to a disabled existing user", async () => {
    const { resolver, tx } = setup({ ...user, loginStatus: "DISABLED" });
    await expect(resolver.resolve(oauthInput)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tx.authAccount.create).not.toHaveBeenCalled();
    expect(tx.session.create).not.toHaveBeenCalled();
  });

  it("rejects a disabled account even when the provider was previously linked", async () => {
    const { resolver, tx } = setup();
    tx.authAccount.findUnique.mockResolvedValue({
      user: { ...user, loginStatus: "SUSPENDED" },
    });
    await expect(resolver.resolve(oauthInput)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tx.authAccount.update).not.toHaveBeenCalled();
    expect(tx.session.create).not.toHaveBeenCalled();
  });

  it("links an approved OAuth account and issues its session through the same transaction", async () => {
    const { resolver, tx } = setup();
    await expect(resolver.resolve(oauthInput)).resolves.toMatchObject({
      kind: "linked-to-existing",
      issued: { sessionId: "new-session" },
    });
    expect(tx.authAccount.create).toHaveBeenCalledTimes(1);
    expect(tx.session.create).toHaveBeenCalledTimes(1);
  });
});
