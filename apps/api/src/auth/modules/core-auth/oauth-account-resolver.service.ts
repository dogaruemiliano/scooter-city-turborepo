import { Injectable } from "@nestjs/common";
import type { v1 } from "@repo/api-shared";

import { Prisma, type User } from "../../../generated/prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

const MAX_TRANSACTION_ATTEMPTS = 3;

export interface ResolveOAuthAccountInput {
  provider: v1.auth.OAuthProvider;
  providerId: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  existingEmailPolicy: "sync" | "preserve";
}

export interface ResolveVerifiedOAuthAccountInput {
  provider: v1.auth.OAuthProvider;
  providerId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  existingEmailPolicy: "sync" | "preserve";
}

export type ResolvedOAuthAccount =
  | { kind: "existing-link"; user: User }
  | { kind: "linked-to-existing"; user: User }
  | { kind: "new-user"; user: User };

export type OAuthAccountResolution =
  | ResolvedOAuthAccount
  | { kind: "unverified-email" }
  | { kind: "missing-email" };

@Injectable()
export class OAuthAccountResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    input: ResolveOAuthAccountInput,
  ): Promise<OAuthAccountResolution> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.resolveInTransaction(input);
      } catch (error) {
        const shouldRetry =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < MAX_TRANSACTION_ATTEMPTS;

        if (!shouldRetry) {
          throw error;
        }
      }
    }

    throw new Error("OAuth account resolution exhausted its retry budget");
  }

  /**
   * Resolve a provider identity after this application has independently
   * proved ownership of `input.email`. The caller owns the transaction so
   * challenge claiming and account creation/linking commit atomically.
   */
  async resolveVerifiedInTransaction(
    tx: Prisma.TransactionClient,
    input: ResolveVerifiedOAuthAccountInput,
  ): Promise<ResolvedOAuthAccount> {
    const existingLink = await this.findExistingLink(tx, input);
    if (existingLink) return existingLink;

    return this.resolveVerifiedEmailWithoutExistingLink(tx, input);
  }

  private resolveInTransaction(
    input: ResolveOAuthAccountInput,
  ): Promise<OAuthAccountResolution> {
    return this.prisma.$transaction(
      async (tx) => {
        const existingLink = await this.findExistingLink(tx, input);
        if (existingLink) return existingLink;

        if (input.email === null) {
          return { kind: "missing-email" };
        }

        // Do not query User by an unverified provider email. Returning
        // before that lookup makes existing and non-existing local
        // addresses follow the same response path.
        if (!input.emailVerified) {
          return { kind: "unverified-email" };
        }

        return this.resolveVerifiedEmailWithoutExistingLink(tx, {
          ...input,
          email: input.email,
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  private async findExistingLink(
    tx: Prisma.TransactionClient,
    input: Pick<
      ResolveOAuthAccountInput,
      "provider" | "providerId" | "email" | "existingEmailPolicy"
    >,
  ): Promise<Extract<ResolvedOAuthAccount, { kind: "existing-link" }> | null> {
    const existingAccount = await tx.authAccount.findUnique({
      where: {
        provider_providerId: {
          provider: input.provider,
          providerId: input.providerId,
        },
      },
      include: { user: true },
    });

    if (!existingAccount) return null;

    if (
      input.existingEmailPolicy === "sync" &&
      input.email !== null &&
      existingAccount.email !== input.email
    ) {
      await tx.authAccount.update({
        where: { id: existingAccount.id },
        data: { email: input.email },
      });
    }

    return {
      kind: "existing-link",
      user: existingAccount.user,
    };
  }

  private async resolveVerifiedEmailWithoutExistingLink(
    tx: Prisma.TransactionClient,
    input: ResolveVerifiedOAuthAccountInput,
  ): Promise<Exclude<ResolvedOAuthAccount, { kind: "existing-link" }>> {
    const normalizedEmail = input.email.toLowerCase();
    const existingUser = await tx.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      await tx.authAccount.create({
        data: {
          provider: input.provider,
          providerId: input.providerId,
          userId: existingUser.id,
          email: input.email,
        },
      });

      return {
        kind: "linked-to-existing",
        user: existingUser,
      };
    }

    const user = await tx.user.create({
      data: {
        email: normalizedEmail,
        emailVerified: new Date(),
        firstName: input.firstName,
        lastName: input.lastName,
        authAccounts: {
          create: {
            provider: input.provider,
            providerId: input.providerId,
            email: input.email,
          },
        },
      },
    });

    return { kind: "new-user", user };
  }
}
