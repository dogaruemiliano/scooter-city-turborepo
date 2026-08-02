import { Module } from "@nestjs/common";

import { ExpenseReportingController } from "./expense-reporting.controller";
import { ExpenseReportingService } from "./expense-reporting.service";

@Module({
  controllers: [ExpenseReportingController],
  providers: [ExpenseReportingService],
  exports: [ExpenseReportingService],
})
export class ExpenseReportingModule {}
