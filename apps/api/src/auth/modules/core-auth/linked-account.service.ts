import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { ENV } from "../../../config/config.module";
import type { Env } from "../../../config/env";
import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class LinkedAccountService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async unlink(
    userId: string,
    providerParam: string,
  ): Promise<v1.auth.OAuthProvider> {
    const provider = this.parseProvider(providerParam);

    await this.prisma.$transaction(async (tx) => {
      const lockedUsers = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "User"
        WHERE "id" = ${userId}
        FOR UPDATE
      `;
      if (lockedUsers.length === 0) {
        throw new UnauthorizedException();
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          emailVerified: true,
          authAccounts: {
            select: { provider: true },
          },
        },
      });
      if (!user) {
        throw new UnauthorizedException();
      }

      const linkedProviderCount = user.authAccounts.filter(
        (account) => account.provider === provider,
      ).length;
      if (linkedProviderCount === 0) {
        throw new NotFoundException(
          `No ${provider} account linked to this user`,
        );
      }

      const remainingFallbacks =
        (this.env.AUTH_EMAIL_OTP_ENABLED && user.emailVerified !== null
          ? 1
          : 0) +
        user.authAccounts
          .filter((account) => account.provider !== provider)
          .filter((account) => this.isProviderEnabled(account.provider)).length;
      if (remainingFallbacks === 0) {
        throw new ConflictException(
          "Cannot unlink the only auth method — link another enabled provider or verify your email first.",
        );
      }

      await tx.authAccount.deleteMany({
        where: { userId, provider },
      });
    });

    return provider;
  }

  private parseProvider(provider: string): v1.auth.OAuthProvider {
    if (!v1.auth.OAUTH_PROVIDERS.includes(provider as v1.auth.OAuthProvider)) {
      throw new BadRequestException(`Unknown OAuth provider "${provider}"`);
    }

    return provider as v1.auth.OAuthProvider;
  }

  private isProviderEnabled(provider: string): boolean {
    if (provider === "google") return this.env.AUTH_GOOGLE_ENABLED;
    if (provider === "apple") return this.env.AUTH_APPLE_ENABLED;
    return false;
  }
}
