import { Module } from "@nestjs/common";

import { ExpenseDocumentsModule } from "../expense-documents/expense-documents.module";
import { ExpenseReportingModule } from "../expense-reporting/expense-reporting.module";
import { FinanceController, MyFinanceController } from "./finance.controller";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";
import { CounterpartySearchService } from "./counterparty-search.service";
import { ExpensesModule } from "./expenses/expenses.module";
import { FinanceReportingService } from "./finance-reporting.service";
import { FinanceService } from "./finance.service";
import { ScooterSalesModule } from "./scooter-sales/scooter-sales.module";

@Module({
  imports: [
    ExpenseDocumentsModule,
    ExpenseReportingModule,
    ExpensesModule,
    ScooterSalesModule,
  ],
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
