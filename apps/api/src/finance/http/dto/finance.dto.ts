import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class FinanceBookList extends createZodDto(
  v1.finance.financeBookListSchema,
) {}

export class Supplier extends createZodDto(v1.finance.supplierSchema) {}

export class SupplierList extends createZodDto(v1.finance.supplierListSchema) {}

export class ListSuppliersQuery extends createZodDto(
  v1.finance.listSuppliersQuerySchema,
) {}

export class CreateSupplierInput extends createZodDto(
  v1.finance.createSupplierInputSchema,
) {}

export class UpdateSupplierInput extends createZodDto(
  v1.finance.updateSupplierInputSchema,
) {}

export class CompanyAssociates extends createZodDto(
  v1.finance.companyAssociatesSchema,
) {}

export class UpdateCompanyAssociatesInput extends createZodDto(
  v1.finance.updateCompanyAssociatesInputSchema,
) {}

export class FinanceLegalIdentity extends createZodDto(
  v1.finance.financeLegalIdentitySchema,
) {}

export class FinanceLegalIdentityResponse extends createZodDto(
  v1.finance.financeLegalIdentityResponseSchema,
) {}

export class UpsertFinanceLegalIdentityInput extends createZodDto(
  v1.finance.upsertFinanceLegalIdentityInputSchema,
) {}

export class ExpenseExtractionDraft extends createZodDto(
  v1.finance.expenseExtractionDraftSchema,
) {}

export class CreateExpenseReceiptDraftUploadInput extends createZodDto(
  v1.finance.createExpenseReceiptDraftUploadInputSchema,
) {}

export class ExpenseReceiptDraftUpload extends createZodDto(
  v1.finance.expenseReceiptDraftUploadSchema,
) {}

export class AnalyzeExpenseReceiptInput extends createZodDto(
  v1.finance.analyzeExpenseReceiptInputSchema,
) {}

export class ListLedgerAccountsQuery extends createZodDto(
  v1.finance.listLedgerAccountsQuerySchema,
) {}

export class LedgerAccount extends createZodDto(
  v1.finance.ledgerAccountSchema,
) {}

export class LedgerAccountList extends createZodDto(
  v1.finance.ledgerAccountListSchema,
) {}

export class LedgerAccountBalance extends createZodDto(
  v1.finance.ledgerAccountBalanceSchema,
) {}

export class LedgerAccountBalanceList extends createZodDto(
  v1.finance.ledgerAccountBalanceListSchema,
) {}

export class ListExpenseCategoriesQuery extends createZodDto(
  v1.finance.listExpenseCategoriesQuerySchema,
) {}

export class ExpenseCategoryList extends createZodDto(
  v1.finance.expenseCategoryListSchema,
) {}

export class ListCostObjectsQuery extends createZodDto(
  v1.finance.listCostObjectsQuerySchema,
) {}

export class CostObjectList extends createZodDto(
  v1.finance.costObjectListSchema,
) {}

export class CreateExpenseInput extends createZodDto(
  v1.finance.createExpenseInputSchema,
) {}

export class PreviewExpenseInput extends createZodDto(
  v1.finance.previewExpenseInputSchema,
) {}

export class CreateAssociateFundingInput extends createZodDto(
  v1.finance.createAssociateFundingInputSchema,
) {}

export class PreviewAssociateFundingInput extends createZodDto(
  v1.finance.previewAssociateFundingInputSchema,
) {}

export class CreateFundingProofDraftUploadInput extends createZodDto(
  v1.finance.createFundingProofDraftUploadInputSchema,
) {}

export class FundingProofDraftUpload extends createZodDto(
  v1.finance.fundingProofDraftUploadSchema,
) {}

export class PostingPlan extends createZodDto(v1.finance.postingPlanSchema) {}

export class FinancialOperation extends createZodDto(
  v1.finance.financialOperationSchema,
) {}

export class FinancialOperationList extends createZodDto(
  v1.finance.financialOperationListSchema,
) {}

export class ListFinancialOperationsQuery extends createZodDto(
  v1.finance.listFinancialOperationsQuerySchema,
) {}

export class ReverseOperationInput extends createZodDto(
  v1.finance.reverseOperationInputSchema,
) {}

export class PreviewSettlementInput extends createZodDto(
  v1.finance.previewSettlementInputSchema,
) {}

export class SettlementPreview extends createZodDto(
  v1.finance.settlementPreviewSchema,
) {}
