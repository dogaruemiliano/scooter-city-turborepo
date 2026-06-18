import { Module } from "@nestjs/common";

import { OtpDeliveryQuotaService } from "./otp-delivery-quota.service";
import { OtpChallengeController } from "./otp-challenge.controller";
import { OtpChallengeService } from "./otp-challenge.service";

@Module({
  controllers: [OtpChallengeController],
  providers: [OtpChallengeService, OtpDeliveryQuotaService],
  exports: [OtpChallengeService],
})
export class OtpChallengeModule {}
