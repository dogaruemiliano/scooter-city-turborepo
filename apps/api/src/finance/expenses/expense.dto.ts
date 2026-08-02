import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class CreateExpenseInput extends createZodDto(
  v1.finance.createExpenseInputSchema,
) {}

export class UpdateExpenseInput extends createZodDto(
  v1.finance.updateExpenseInputSchema,
) {}

export class ExpenseActionInput extends createZodDto(
  v1.finance.expenseActionInputSchema,
) {}

export class ListExpensesQuery extends createZodDto(
  v1.finance.listExpensesQuerySchema,
) {}

export class Expense extends createZodDto(v1.finance.expenseSchema) {}
export class ExpenseList extends createZodDto(v1.finance.expenseListSchema) {}

export class CreateBusinessLegalEntityInput extends createZodDto(
  v1.finance.createBusinessLegalEntityInputSchema,
) {}

export class UpdateBusinessLegalEntityInput extends createZodDto(
  v1.finance.updateBusinessLegalEntityInputSchema,
) {}

export class BusinessLegalEntity extends createZodDto(
  v1.finance.businessLegalEntitySchema,
) {}

export class BusinessLegalEntityList extends createZodDto(
  v1.finance.businessLegalEntityListSchema,
) {}

export class CreateBusinessOwnerInput extends createZodDto(
  v1.finance.createBusinessOwnerInputSchema,
) {}

export class UpdateBusinessOwnerInput extends createZodDto(
  v1.finance.updateBusinessOwnerInputSchema,
) {}

export class BusinessOwner extends createZodDto(
  v1.finance.businessOwnerSchema,
) {}

export class BusinessOwnerList extends createZodDto(
  v1.finance.businessOwnerListSchema,
) {}

export class CreateVatRegistrationPeriodInput extends createZodDto(
  v1.finance.createVatRegistrationPeriodInputSchema,
) {}

export class UpdateVatRegistrationPeriodInput extends createZodDto(
  v1.finance.updateVatRegistrationPeriodInputSchema,
) {}

export class VatRegistrationPeriod extends createZodDto(
  v1.finance.vatRegistrationPeriodSchema,
) {}

export class VatRegistrationPeriodList extends createZodDto(
  v1.finance.vatRegistrationPeriodListSchema,
) {}

export class ListExpenseOptionsQuery extends createZodDto(
  v1.finance.listExpenseOptionsQuerySchema,
) {}

export class ListExpenseUserOptionsQuery extends createZodDto(
  v1.finance.listExpenseUserOptionsQuerySchema,
) {}

export class ExpenseUserOptionList extends createZodDto(
  v1.finance.expenseUserOptionListSchema,
) {}

export class ListExpenseReimbursementsQuery extends createZodDto(
  v1.finance.listExpenseReimbursementsQuerySchema,
) {}

export class ExpenseReimbursementList extends createZodDto(
  v1.finance.expenseReimbursementListSchema,
) {}

export class SettleExpenseReimbursementInput extends createZodDto(
  v1.finance.settleExpenseReimbursementInputSchema,
) {}

export class ExpenseReimbursementClaim extends createZodDto(
  v1.finance.expenseReimbursementClaimSchema,
) {}
