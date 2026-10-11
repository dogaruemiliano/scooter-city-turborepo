import {
  RequireAllScope,
  RequireSuperAdmin,
} from "../../access/access.decorators";
/**
 * Finance HTTP surface.
 *
 * Controllers stay thin on purpose: parse, delegate, map. Not one accounting
 * decision is made in this file — every posting rule lives in a domain policy
 * where it can be tested without an HTTP request.
 *
 * Finance routes are ADMIN-only by default. Company identity and associate
 * management are further restricted to SUPER_ADMIN users.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { v1 } from "@repo/api-shared";
import { ZodResponse } from "nestjs-zod";

import type { AuthPrincipal } from "../../auth/auth.types";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { CreateExpenseUseCase } from "../application/expenses/create-expense.use-case";
import { CreateExpenseReceiptUploadUseCase } from "../application/expenses/create-expense-receipt-upload.use-case";
import { AnalyzeExpenseReceiptUseCase } from "../application/expenses/analyze-expense-receipt.use-case";
import { ExpenseExtractionDraftService } from "../application/expenses/expense-extraction-draft.service";
import { CompanyIdentityService } from "../application/company-identity.service";
import { FinanceBooksService } from "../application/finance-books.service";
import { CompanyAssociatesService } from "../application/company-associates.service";
import { SuppliersService } from "../application/suppliers.service";
import { CreateAssociateFundingUseCase } from "../application/funding/create-associate-funding.use-case";
import { CreateFundingProofUploadUseCase } from "../application/funding/create-funding-proof-upload.use-case";
import { PreviewAssociateFundingUseCase } from "../application/funding/preview-associate-funding.use-case";
import { PreviewExpenseUseCase } from "../application/expenses/preview-expense.use-case";
import { FinanceQueriesService } from "../application/finance-queries.service";
import { ReverseOperationUseCase } from "../application/reverse-operation.use-case";
import { PreviewSettlementUseCase } from "../application/settlements/preview-settlement.use-case";
import {
  CostObjectList,
  CompanyAssociates,
  AnalyzeExpenseReceiptInput,
  CreateAssociateFundingInput,
  CreateExpenseReceiptDraftUploadInput,
  CreateFundingProofDraftUploadInput,
  CreateExpenseInput,
  CreateSupplierInput,
  ExpenseCategoryList,
  FinanceBookList,
  FinanceBook,
  CreateFinanceBookInput,
  UpdateFinanceBookInput,
  FinanceLegalIdentity,
  FinanceLegalIdentityResponse,
  UpsertFinanceLegalIdentityInput,
  UpdateCompanyAssociatesInput,
  ExpenseExtractionDraft,
  ExpenseReceiptDraftUpload,
  FundingProofDraftUpload,
  FinancialOperation,
  FinancialOperationList,
  LedgerAccount,
  LedgerAccountBalance,
  LedgerAccountBalanceList,
  LedgerAccountList,
  ListCostObjectsQuery,
  ListExpenseCategoriesQuery,
  ListFinancialOperationsQuery,
  ListLedgerAccountsQuery,
  ListSuppliersQuery,
  PostingPlan,
  PreviewExpenseInput,
  PreviewAssociateFundingInput,
  PreviewSettlementInput,
  ReverseOperationInput,
  SettlementPreview,
  Supplier,
  SupplierList,
  UpdateSupplierInput,
} from "./dto/finance.dto";
import { FinanceErrorInterceptor } from "./finance-error.interceptor";
import { IdempotencyKey } from "./idempotency-key.decorator";

const IDEMPOTENCY_HEADER_DOC = {
  name: v1.finance.IDEMPOTENCY_KEY_HEADER,
  description:
    "Unique client-generated value (a UUID) identifying this command. Retrying with the same key returns the original operation instead of creating a second one.",
  required: true,
} as const;

@ApiTags("finance")
@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)
@ApiBearerAuth("bearer")
@UseInterceptors(FinanceErrorInterceptor)
@Controller({ path: "finance", version: "1" })
export class FinanceController {
  constructor(
    private readonly queries: FinanceQueriesService,
    private readonly books: FinanceBooksService,
    private readonly companyIdentity: CompanyIdentityService,
    private readonly companyAssociates: CompanyAssociatesService,
    private readonly suppliers: SuppliersService,
    private readonly expenseExtractionDrafts: ExpenseExtractionDraftService,
    private readonly createExpenseReceiptUpload: CreateExpenseReceiptUploadUseCase,
    private readonly analyzeExpenseReceipt: AnalyzeExpenseReceiptUseCase,
    private readonly previewExpense: PreviewExpenseUseCase,
    private readonly createExpense: CreateExpenseUseCase,
    private readonly previewAssociateFunding: PreviewAssociateFundingUseCase,
    private readonly createAssociateFunding: CreateAssociateFundingUseCase,
    private readonly createFundingProofUpload: CreateFundingProofUploadUseCase,
    private readonly reverseOperation: ReverseOperationUseCase,
    private readonly previewSettlement: PreviewSettlementUseCase,
  ) {}

  // ---------------------------------------------------------------------
  // Reference data
  // ---------------------------------------------------------------------

  @RequireAllScope("finance.books.read")
  @Get("books")
  @ApiOperation({
    operationId: "FinanceController_listBooks_v1",
    summary: "List the company and associate-pool finance books",
  })
  @ZodResponse({ type: FinanceBookList })
  listBooks(): Promise<v1.finance.FinanceBookList> {
    return this.queries.listBooks();
  }

  @RequireSuperAdmin()
  @Post("books")
  @ApiOperation({
    operationId: "FinanceController_createBook_v1",
    summary: "Create and initialize a finance book",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: FinanceBook })
  createBook(
    @Body() input: CreateFinanceBookInput,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<v1.finance.FinanceBook> {
    return this.books.create(input, user.id);
  }

  @RequireSuperAdmin()
  @Put("books/:bookId")
  @ApiOperation({
    operationId: "FinanceController_updateBook_v1",
    summary: "Update a finance book's localized names",
  })
  @ZodResponse({ type: FinanceBook })
  updateBook(
    @Param("bookId") bookId: string,
    @Body() input: UpdateFinanceBookInput,
  ): Promise<v1.finance.FinanceBook> {
    return this.books.update(bookId, input);
  }

  @RequireSuperAdmin()
  @Get("company-identity")
  @ApiOperation({
    operationId: "FinanceController_getCompanyIdentity_v1",
    summary: "Get the legal identity used to match company receipts",
  })
  @ZodResponse({ type: FinanceLegalIdentityResponse })
  getCompanyIdentity(): Promise<v1.finance.FinanceLegalIdentityResponse> {
    return this.companyIdentity.get();
  }

  @RequireSuperAdmin()
  @Put("company-identity")
  @ApiOperation({
    operationId: "FinanceController_upsertCompanyIdentity_v1",
    summary: "Configure the legal identity used to match company receipts",
  })
  @ZodResponse({ type: FinanceLegalIdentity })
  upsertCompanyIdentity(
    @Body() input: UpsertFinanceLegalIdentityInput,
  ): Promise<v1.finance.FinanceLegalIdentity> {
    return this.companyIdentity.upsert(input);
  }

  @RequireSuperAdmin()
  @Get("company-associates")
  @ApiOperation({
    operationId: "FinanceController_getCompanyAssociates_v1",
    summary: "List active company associates and ownership shares",
  })
  @ZodResponse({ type: CompanyAssociates })
  getCompanyAssociates(): Promise<v1.finance.CompanyAssociates> {
    return this.companyAssociates.get();
  }

  @RequireSuperAdmin()
  @Put("company-associates")
  @ApiOperation({
    operationId: "FinanceController_updateCompanyAssociates_v1",
    summary: "Replace active company associates and ownership shares",
  })
  @ZodResponse({ type: CompanyAssociates })
  updateCompanyAssociates(
    @Body() input: UpdateCompanyAssociatesInput,
  ): Promise<v1.finance.CompanyAssociates> {
    return this.companyAssociates.update(input);
  }

  @RequireAllScope("finance.suppliers.read")
  @Get("suppliers")
  @ApiOperation({
    operationId: "FinanceController_listSuppliers_v1",
    summary: "List expense suppliers",
  })
  @ZodResponse({ type: SupplierList })
  listSuppliers(
    @Query() query: ListSuppliersQuery,
  ): Promise<v1.finance.SupplierList> {
    return this.suppliers.list(query);
  }

  @RequireAllScope("finance.suppliers.manage")
  @Post("suppliers")
  @ApiOperation({
    operationId: "FinanceController_createSupplier_v1",
    summary: "Create an expense supplier",
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: Supplier })
  createSupplier(
    @Body() input: CreateSupplierInput,
  ): Promise<v1.finance.Supplier> {
    return this.suppliers.create(input);
  }

  @RequireAllScope("finance.suppliers.manage")
  @Patch("suppliers/:supplierId")
  @ApiOperation({
    operationId: "FinanceController_updateSupplier_v1",
    summary: "Update an expense supplier",
  })
  @ZodResponse({ type: Supplier })
  updateSupplier(
    @Param("supplierId") supplierId: string,
    @Body() input: UpdateSupplierInput,
  ): Promise<v1.finance.Supplier> {
    return this.suppliers.update(supplierId, input);
  }

  @RequireAllScope("finance.accounts.read")
  @Get("accounts")
  @ApiOperation({
    operationId: "FinanceController_listAccounts_v1",
    summary: "List ledger accounts",
  })
  @ZodResponse({ type: LedgerAccountList })
  listAccounts(
    @Query() query: ListLedgerAccountsQuery,
  ): Promise<v1.finance.LedgerAccountList> {
    return this.queries.listAccounts(query);
  }

  @RequireAllScope("finance.accounts.read")
  @Get("account-balances")
  @ApiOperation({
    operationId: "FinanceController_listAccountBalances_v1",
    summary: "List ledger accounts with balances calculated from postings",
  })
  @ZodResponse({ type: LedgerAccountBalanceList })
  listAccountBalances(
    @Query() query: ListLedgerAccountsQuery,
  ): Promise<v1.finance.LedgerAccountBalanceList> {
    return this.queries.listAccountBalances(query);
  }

  @RequireAllScope("finance.accounts.read")
  @Get("accounts/:accountId")
  @ApiOperation({
    operationId: "FinanceController_getAccount_v1",
    summary: "Get one ledger account",
  })
  @ZodResponse({ type: LedgerAccount })
  getAccount(
    @Param("accountId") accountId: string,
  ): Promise<v1.finance.LedgerAccount> {
    return this.queries.getAccount(accountId);
  }

  @RequireAllScope("finance.accounts.read")
  @Get("accounts/:accountId/balance")
  @ApiOperation({
    operationId: "FinanceController_getAccountBalance_v1",
    summary: "Get one account's balance, calculated from its journal postings",
  })
  @ZodResponse({ type: LedgerAccountBalance })
  getAccountBalance(
    @Param("accountId") accountId: string,
  ): Promise<v1.finance.LedgerAccountBalance> {
    return this.queries.getAccountBalance(accountId);
  }

  @RequireAllScope("finance.reference.read")
  @Get("expense-categories")
  @ApiOperation({
    operationId: "FinanceController_listExpenseCategories_v1",
    summary: "List expense categories",
  })
  @ZodResponse({ type: ExpenseCategoryList })
  listExpenseCategories(
    @Query() query: ListExpenseCategoriesQuery,
  ): Promise<v1.finance.ExpenseCategoryList> {
    return this.queries.listExpenseCategories(query);
  }

  @RequireAllScope("finance.reference.read")
  @Get("cost-objects")
  @ApiOperation({
    operationId: "FinanceController_listCostObjects_v1",
    summary: "List cost objects",
  })
  @ZodResponse({ type: CostObjectList })
  listCostObjects(
    @Query() query: ListCostObjectsQuery,
  ): Promise<v1.finance.CostObjectList> {
    return this.queries.listCostObjects(query);
  }

  // ---------------------------------------------------------------------
  // Operations
  // ---------------------------------------------------------------------

  @RequireAllScope("finance.operations.read")
  @Get("operations")
  @ApiOperation({
    operationId: "FinanceController_listOperations_v1",
    summary: "List financial operations",
  })
  @ZodResponse({ type: FinancialOperationList })
  listOperations(
    @Query() query: ListFinancialOperationsQuery,
  ): Promise<v1.finance.FinancialOperationList> {
    return this.queries.listOperations(query);
  }

  @RequireAllScope("finance.operations.read")
  @Get("operations/:operationId")
  @ApiOperation({
    operationId: "FinanceController_getOperation_v1",
    summary: "Get one operation with its journal postings and impact",
  })
  @ZodResponse({ type: FinancialOperation })
  getOperation(
    @Param("operationId") operationId: string,
  ): Promise<v1.finance.FinancialOperation> {
    return this.queries.getOperation(operationId);
  }

  @RequireAllScope("finance.operations.reverse")
  @Post("operations/:operationId/reverse")
  @ApiOperation({
    operationId: "FinanceController_reverseOperation_v1",
    summary: "Reverse a posted operation by posting its exact inverse",
    description:
      "The original operation is never edited or deleted. A new REVERSAL operation posts the opposite of every line, and the original is marked REVERSED.",
  })
  @ApiHeader(IDEMPOTENCY_HEADER_DOC)
  @ZodResponse({ status: HttpStatus.CREATED, type: FinancialOperation })
  reverse(
    @Param("operationId") operationId: string,
    @Body() input: ReverseOperationInput,
    @IdempotencyKey() idempotencyKey: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<v1.finance.FinancialOperation> {
    return this.reverseOperation.execute({
      operationId,
      input,
      idempotencyKey,
      createdById: user.id,
    });
  }

  // ---------------------------------------------------------------------
  // Expenses
  // ---------------------------------------------------------------------

  @RequireAllScope("finance.expenses.create")
  @Post("expenses/receipt-draft-upload-url")
  @ApiOperation({
    operationId: "FinanceController_createExpenseReceiptDraftUpload_v1",
    summary: "Create a signed upload URL for a receipt image",
  })
  @ZodResponse({ type: ExpenseReceiptDraftUpload })
  createExpenseReceiptDraftUpload(
    @Body() input: CreateExpenseReceiptDraftUploadInput,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<v1.finance.ExpenseReceiptDraftUpload> {
    return this.createExpenseReceiptUpload.execute(input, user.id);
  }

  @RequireAllScope("finance.expenses.create")
  @Post("expenses/extractions")
  @ApiOperation({
    operationId: "FinanceController_analyzeExpenseReceipt_v1",
    summary: "Analyze an uploaded receipt and create an extraction draft",
  })
  @ZodResponse({ type: ExpenseExtractionDraft })
  analyzeExpenseReceiptDraft(
    @Body() input: AnalyzeExpenseReceiptInput,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<v1.finance.ExpenseExtractionDraft> {
    return this.analyzeExpenseReceipt.execute(input, user.id);
  }

  @RequireAllScope("finance.expenses.create")
  @Get("expenses/extractions/:draftId")
  @ApiOperation({
    operationId: "FinanceController_getExpenseExtractionDraft_v1",
    summary: "Resume one receipt extraction draft",
  })
  @ZodResponse({ type: ExpenseExtractionDraft })
  getExpenseExtractionDraft(
    @Param("draftId") draftId: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<v1.finance.ExpenseExtractionDraft> {
    return this.expenseExtractionDrafts.get(draftId, user.id);
  }

  @RequireAllScope("finance.expenses.create")
  @Post("expenses/preview")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "FinanceController_previewExpense_v1",
    summary: "Preview the ledger impact of an expense without saving it",
    description:
      "Runs the same posting policy the create endpoint runs, then stops. Nothing is written.",
  })
  @ZodResponse({ type: PostingPlan })
  preview(@Body() input: PreviewExpenseInput): Promise<v1.finance.PostingPlan> {
    return this.previewExpense.execute(input);
  }

  @RequireAllScope("finance.expenses.create")
  @Post("expenses")
  @ApiOperation({
    operationId: "FinanceController_createExpense_v1",
    summary: "Record an expense and post it to the ledger",
  })
  @ApiHeader(IDEMPOTENCY_HEADER_DOC)
  @ZodResponse({ status: HttpStatus.CREATED, type: FinancialOperation })
  create(
    @Body() input: CreateExpenseInput,
    @IdempotencyKey() idempotencyKey: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<v1.finance.FinancialOperation> {
    return this.createExpense.execute({
      input,
      idempotencyKey,
      createdById: user.id,
    });
  }

  // ---------------------------------------------------------------------
  // Company funding
  // ---------------------------------------------------------------------

  @RequireAllScope("finance.funding.create")
  @Post("funding/preview")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "FinanceController_previewAssociateFunding_v1",
    summary: "Preview an associate loan or capital contribution",
  })
  @ZodResponse({ type: PostingPlan })
  fundingPreview(
    @Body() input: PreviewAssociateFundingInput,
  ): Promise<v1.finance.PostingPlan> {
    return this.previewAssociateFunding.execute(input);
  }

  @RequireAllScope("finance.funding.create")
  @Post("funding/proof-draft-upload-url")
  @ApiOperation({
    operationId: "FinanceController_createFundingProofDraftUpload_v1",
    summary: "Create a signed upload URL for funding proof",
  })
  @ZodResponse({ type: FundingProofDraftUpload })
  fundingProofDraftUpload(
    @Body() input: CreateFundingProofDraftUploadInput,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<v1.finance.FundingProofDraftUpload> {
    return this.createFundingProofUpload.execute(input, user.id);
  }

  @RequireAllScope("finance.funding.create")
  @Post("funding")
  @ApiOperation({
    operationId: "FinanceController_createAssociateFunding_v1",
    summary: "Record money provided to the company by an associate",
  })
  @ApiHeader(IDEMPOTENCY_HEADER_DOC)
  @ZodResponse({ status: HttpStatus.CREATED, type: FinancialOperation })
  fundingCreate(
    @Body() input: CreateAssociateFundingInput,
    @IdempotencyKey() idempotencyKey: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<v1.finance.FinancialOperation> {
    return this.createAssociateFunding.execute({
      input,
      idempotencyKey,
      createdById: user.id,
    });
  }

  // ---------------------------------------------------------------------
  // Settlement
  // ---------------------------------------------------------------------

  @RequireAllScope("finance.settlements.preview")
  @Post("settlements/preview")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "FinanceController_previewSettlement_v1",
    summary: "Calculate the company specific-benefit settlement for a period",
    description:
      "Private balancing payments between associates. These are deliberately not netted against what the company separately owes an associate for money they advanced.",
  })
  @ZodResponse({ type: SettlementPreview })
  settlementPreview(
    @Body() input: PreviewSettlementInput,
  ): Promise<v1.finance.SettlementPreview> {
    return this.previewSettlement.execute(input);
  }
}
