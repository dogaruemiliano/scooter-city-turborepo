import { Module } from "@nestjs/common";

import { FinanceController, MyFinanceController } from "./finance.controller";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";
import { CounterpartySearchService } from "./counterparty-search.service";
import { FinanceReportingService } from "./finance-reporting.service";
import { FinanceService } from "./finance.service";

@Module({
  controllers: [FinanceController, MyFinanceController, CompaniesController],
  providers: [
    FinanceService,
    FinanceReportingService,
    CounterpartySearchService,
    CompaniesService,
  ],
  exports: [FinanceService],
})
export class FinanceModule {}
