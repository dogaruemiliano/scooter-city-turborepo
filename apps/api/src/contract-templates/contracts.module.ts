import { Module } from "@nestjs/common";
import { ImageStorageModule } from "../image-storage/image-storage.module";
import { OtpDeliveryQuotaService } from "../auth/modules/otp-challenge/otp-delivery-quota.service";
import { ContractSupport } from "./contract-support";
import { TemplatesService } from "./templates.service";
import { PackagesService } from "./packages.service";
import { SigningService } from "./signing.service";
import { SigningController } from "./signing.controller";
import { ContractsController } from "./contracts.controller";
import { ContractDeliveryService } from "./delivery.service";
import { ContractRetentionService } from "./retention.service";
import { ContractRetentionController } from "./retention.controller";

@Module({
  imports: [ImageStorageModule],
  controllers: [
    ContractsController,
    SigningController,
    ContractRetentionController,
  ],
  providers: [
    ContractSupport,
    TemplatesService,
    PackagesService,
    SigningService,
    OtpDeliveryQuotaService,
    ContractDeliveryService,
    ContractRetentionService,
  ],
  exports: [PackagesService],
})
export class ContractsModule {}
