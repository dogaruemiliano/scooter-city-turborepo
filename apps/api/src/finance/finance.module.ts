/**
 * The financial module.
 *
 * Layering, outermost first:
 *
 * - `http/` parses requests and maps domain errors to status codes.
 * - `application/` orchestrates: check idempotency, validate references,
 *   build a plan, write it in one transaction.
 * - `domain/` decides what the accounting actually is. No Prisma, no NestJS
 *   request context — just money rules.
 * - `infrastructure/` talks to Postgres and implements the ports the domain
 *   declares.
 *
 * The domain depends on `LedgerAccountResolverPort`, an interface it owns.
 * `LEDGER_ACCOUNT_RESOLVER` binds the Prisma implementation to it, which is
 * what keeps the dependency arrow pointing inwards.
 */
import { Module } from "@nestjs/common";

import { ImageStorageModule } from "../image-storage/image-storage.module";
import { CreateAssociateFundingUseCase } from "./application/funding/create-associate-funding.use-case";
import { CreateFundingProofUploadUseCase } from "./application/funding/create-funding-proof-upload.use-case";
import { PreviewAssociateFundingUseCase } from "./application/funding/preview-associate-funding.use-case";

import { CreateExpenseUseCase } from "./application/expenses/create-expense.use-case";
import { CreateExpenseReceiptUploadUseCase } from "./application/expenses/create-expense-receipt-upload.use-case";
import { AnalyzeExpenseReceiptUseCase } from "./application/expenses/analyze-expense-receipt.use-case";
import { PreviewExpenseUseCase } from "./application/expenses/preview-expense.use-case";
import { FinanceQueriesService } from "./application/finance-queries.service";
import { SuppliersService } from "./application/suppliers.service";
import { CompanyIdentityService } from "./application/company-identity.service";
import { CompanyAssociatesService } from "./application/company-associates.service";
import { ExpenseExtractionDraftService } from "./application/expenses/expense-extraction-draft.service";
import { ReverseOperationUseCase } from "./application/reverse-operation.use-case";
import { PreviewSettlementUseCase } from "./application/settlements/preview-settlement.use-case";
import { LEDGER_ACCOUNT_RESOLVER } from "./domain/finance.tokens";
import { JournalValidator } from "./domain/journal-validator";
import { ExpensePostingPolicy } from "./domain/policies/expense-posting.policy";
import { AssociateFundingPostingPolicy } from "./domain/policies/associate-funding-posting.policy";
import { ReversalPostingPolicy } from "./domain/policies/reversal-posting.policy";
import { CompanyBenefitSettlementCalculator } from "./domain/settlement/company-benefit-settlement.calculator";
import { SettlementTransferMatcher } from "./domain/settlement/settlement-transfer.matcher";
import { FinanceController } from "./http/finance.controller";
import { LedgerAccountResolver } from "./infrastructure/ledger-account.resolver";
import { PrismaFinanceRepository } from "./infrastructure/prisma-finance.repository";
import { PrismaExpenseExtractionRepository } from "./infrastructure/prisma-expense-extraction.repository";

@Module({
  imports: [ImageStorageModule],
  controllers: [FinanceController],
  providers: [
    // Domain
    JournalValidator,
    ExpensePostingPolicy,
    AssociateFundingPostingPolicy,
    ReversalPostingPolicy,
    SettlementTransferMatcher,
    CompanyBenefitSettlementCalculator,

    // Infrastructure
    PrismaFinanceRepository,
    PrismaExpenseExtractionRepository,
    LedgerAccountResolver,
    { provide: LEDGER_ACCOUNT_RESOLVER, useExisting: LedgerAccountResolver },

    // Application
    FinanceQueriesService,
    SuppliersService,
    CompanyIdentityService,
    CompanyAssociatesService,
    ExpenseExtractionDraftService,
    CreateExpenseReceiptUploadUseCase,
    AnalyzeExpenseReceiptUseCase,
    PreviewExpenseUseCase,
    CreateExpenseUseCase,
    PreviewAssociateFundingUseCase,
    CreateAssociateFundingUseCase,
    CreateFundingProofUploadUseCase,
    ReverseOperationUseCase,
    PreviewSettlementUseCase,
  ],
  exports: [FinanceQueriesService],
})
export class FinanceModule {}
