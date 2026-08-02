import { Module } from "@nestjs/common";

import { BusinessLegalEntitiesController } from "./business-legal-entities.controller";
import { BusinessLegalEntitiesService } from "./business-legal-entities.service";
import { ExpenseReimbursementsController } from "./expense-reimbursements.controller";
import { ExpensesController } from "./expenses.controller";
import { ExpensesService } from "./expenses.service";

@Module({
  controllers: [
    ExpensesController,
    BusinessLegalEntitiesController,
    ExpenseReimbursementsController,
  ],
  providers: [ExpensesService, BusinessLegalEntitiesService],
  exports: [ExpensesService, BusinessLegalEntitiesService],
})
export class ExpensesModule {}
