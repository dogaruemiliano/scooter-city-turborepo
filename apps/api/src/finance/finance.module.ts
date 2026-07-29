import { Module } from "@nestjs/common";

import { FinanceController, MyFinanceController } from "./finance.controller";
import { FinanceReportingService } from "./finance-reporting.service";
import { FinanceService } from "./finance.service";

@Module({
  controllers: [FinanceController, MyFinanceController],
  providers: [FinanceService, FinanceReportingService],
  exports: [FinanceService],
})
export class FinanceModule {}
