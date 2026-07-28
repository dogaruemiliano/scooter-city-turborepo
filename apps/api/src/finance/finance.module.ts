import { Module } from "@nestjs/common";

import { FinanceController, MyFinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";

@Module({
  controllers: [FinanceController, MyFinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
