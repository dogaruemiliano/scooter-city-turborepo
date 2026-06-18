import { Module } from "@nestjs/common";

import { CoreAuthModule } from "../core-auth/core-auth.module";
import { OtpChallengeModule } from "../otp-challenge/otp-challenge.module";

import { OAuthEmailVerificationController } from "./oauth-email-verification.controller";
import { OAuthEmailVerificationService } from "./oauth-email-verification.service";

@Module({
  imports: [CoreAuthModule, OtpChallengeModule],
  controllers: [OAuthEmailVerificationController],
  providers: [OAuthEmailVerificationService],
  exports: [OAuthEmailVerificationService],
})
export class OAuthEmailVerificationModule {}
