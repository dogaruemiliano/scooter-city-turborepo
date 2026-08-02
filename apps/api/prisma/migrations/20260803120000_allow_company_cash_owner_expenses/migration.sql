-- Company cash held by the business can fund an expense attributed to an owner.
-- Keep every other cross-table expense invariant aligned with the original
-- validate_expense_consistency() definition.
CREATE OR REPLACE FUNCTION validate_expense_consistency() RETURNS trigger AS $$
DECLARE
  expense_id TEXT;
  state RECORD;
  owner_state RECORD;
  tax_state RECORD;
  tax_sums RECORD;
  claim_state RECORD;
  effective_vat_period_id TEXT;
  effective_vat_country_code TEXT;
  effective_vat_number TEXT;
  company_wallet_type "WalletType";
  claim_count INTEGER;
  payment_posting_count INTEGER;
  reversal_posting_count INTEGER;
  invalid_payment_posting_count INTEGER;
  invalid_reversal_posting_count INTEGER;
  settlement_count INTEGER;
  settlement_posting_count INTEGER;
  invalid_settlement_wallet_count INTEGER;
  invalid_settlement_posting_count INTEGER;
  settlement_total DECIMAL(19,2);
  qualifying_document_count INTEGER;
  qualifying_pos_document_count INTEGER;
  matched_buyer_assertion_count INTEGER;
  invalid_document_count INTEGER;
  invalid_tax_recovery_count INTEGER;
  should_reimburse BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    CASE TG_TABLE_NAME
      WHEN 'ExpensePayment' THEN expense_id := OLD."expenseId";
      WHEN 'ExpenseCostPool' THEN expense_id := OLD."expenseId";
      WHEN 'ExpenseCostAttribution' THEN
        SELECT pool."expenseId" INTO expense_id
        FROM "ExpenseCostPool" AS pool
        WHERE pool."id" = OLD."costPoolId";
      WHEN 'ExpenseTaxSnapshot' THEN expense_id := OLD."expenseId";
      WHEN 'ExpenseTaxLine' THEN
        SELECT snapshot."expenseId" INTO expense_id
        FROM "ExpenseTaxSnapshot" AS snapshot
        WHERE snapshot."id" = OLD."taxSnapshotId";
      WHEN 'ExpenseDocument' THEN expense_id := OLD."expenseId";
      WHEN 'ExpenseReimbursementClaim' THEN expense_id := OLD."expenseId";
      WHEN 'ExpenseReimbursementSettlement' THEN
        SELECT claim."expenseId" INTO expense_id
        FROM "ExpenseReimbursementClaim" AS claim
        WHERE claim."id" = OLD."claimId";
      WHEN 'ExpensePosting' THEN expense_id := OLD."expenseId";
      WHEN 'MoneyTransaction' THEN
        SELECT posting."expenseId" INTO expense_id
        FROM "ExpensePosting" AS posting
        WHERE posting."moneyTransactionId" = OLD."id";
      WHEN 'WalletBalanceChange' THEN
        SELECT posting."expenseId" INTO expense_id
        FROM "ExpensePosting" AS posting
        WHERE posting."moneyTransactionId" = OLD."moneyTransactionId";
      ELSE RETURN NULL;
    END CASE;
  ELSE
    CASE TG_TABLE_NAME
      WHEN 'Expense' THEN expense_id := NEW."id";
      WHEN 'ExpensePayment' THEN expense_id := NEW."expenseId";
      WHEN 'ExpenseCostPool' THEN expense_id := NEW."expenseId";
      WHEN 'ExpenseCostAttribution' THEN
        SELECT pool."expenseId" INTO expense_id
        FROM "ExpenseCostPool" AS pool
        WHERE pool."id" = NEW."costPoolId";
      WHEN 'ExpenseTaxSnapshot' THEN expense_id := NEW."expenseId";
      WHEN 'ExpenseTaxLine' THEN
        SELECT snapshot."expenseId" INTO expense_id
        FROM "ExpenseTaxSnapshot" AS snapshot
        WHERE snapshot."id" = NEW."taxSnapshotId";
      WHEN 'ExpenseDocument' THEN expense_id := NEW."expenseId";
      WHEN 'ExpenseReimbursementClaim' THEN expense_id := NEW."expenseId";
      WHEN 'ExpenseReimbursementSettlement' THEN
        SELECT claim."expenseId" INTO expense_id
        FROM "ExpenseReimbursementClaim" AS claim
        WHERE claim."id" = NEW."claimId";
      WHEN 'ExpensePosting' THEN expense_id := NEW."expenseId";
      WHEN 'MoneyTransaction' THEN
        SELECT posting."expenseId" INTO expense_id
        FROM "ExpensePosting" AS posting
        WHERE posting."moneyTransactionId" = NEW."id";
      WHEN 'WalletBalanceChange' THEN
        SELECT posting."expenseId" INTO expense_id
        FROM "ExpensePosting" AS posting
        WHERE posting."moneyTransactionId" = NEW."moneyTransactionId";
      ELSE RETURN NULL;
    END CASE;
  END IF;

  IF expense_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    expense."id" AS expense_id,
    expense."legalEntityId" AS legal_entity_id,
    expense."status" AS expense_status,
    expense."occurredOn" AS occurred_on,
    expense."taxPointOn" AS tax_point_on,
    expense."currency" AS expense_currency,
    expense."grossAmount" AS expense_gross,
    expense."recognizedCostAmount" AS expense_recognized,
    expense."fiscalDeductibleAmount" AS fiscal_deductible,
    normalize_ro_tax_identifier(company."taxIdentifier") AS current_legal_entity_tax_identifier,
    payment."id" AS payment_id,
    payment."source" AS payment_source,
    payment."companyWalletId" AS company_wallet_id,
    payment."fundedByUserId" AS funded_by_user_id,
    payment."amount" AS payment_amount,
    payment."fundingTreatment" AS funding_treatment,
    pool."id" AS pool_id,
    pool."grossAmount" AS pool_gross,
    pool."recognizedCostAmount" AS pool_recognized,
    attribution."target" AS attribution_target,
    attribution."businessOwnerId" AS business_owner_id,
    attribution."allocatedGrossAmount" AS allocated_gross,
    attribution."allocatedRecognizedCostAmount" AS allocated_recognized
  INTO state
  FROM "Expense" AS expense
  JOIN "BusinessLegalEntity" AS entity ON entity."id" = expense."legalEntityId"
  JOIN "Company" AS company ON company."id" = entity."companyId"
  LEFT JOIN "ExpensePayment" AS payment ON payment."expenseId" = expense."id"
  LEFT JOIN "ExpenseCostPool" AS pool ON pool."expenseId" = expense."id"
  LEFT JOIN "ExpenseCostAttribution" AS attribution ON attribution."costPoolId" = pool."id"
  WHERE expense."id" = expense_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF state.payment_id IS NULL OR state.pool_id IS NULL OR state.attribution_target IS NULL THEN
    RAISE EXCEPTION 'expense % must have one payment, pool and attribution', expense_id
      USING ERRCODE = '23514';
  END IF;

  IF state.payment_amount <> state.expense_gross
    OR state.pool_gross <> state.expense_gross
    OR state.pool_recognized <> state.expense_recognized
    OR state.allocated_gross <> state.pool_gross
    OR state.allocated_recognized <> state.pool_recognized
  THEN
    RAISE EXCEPTION 'expense % payment and allocations must reconcile exactly', expense_id
      USING ERRCODE = '23514';
  END IF;

  should_reimburse :=
    state.payment_source = 'PERSONAL_FUNDS'
    AND state.attribution_target = 'BUSINESS';

  IF (should_reimburse AND state.funding_treatment <> 'REIMBURSABLE')
    OR (NOT should_reimburse AND state.funding_treatment <> 'NON_REIMBURSABLE')
  THEN
    RAISE EXCEPTION 'expense % has an invalid locked funding treatment', expense_id
      USING ERRCODE = '23514';
  END IF;

  IF state.attribution_target = 'OWNER' THEN
    SELECT
      owner."legalEntityId" AS legal_entity_id,
      owner."effectiveFrom" AS effective_from,
      owner."effectiveTo" AS effective_to
    INTO owner_state
    FROM "BusinessOwner" AS owner
    WHERE owner."id" = state.business_owner_id;

    IF NOT FOUND
      OR owner_state.legal_entity_id <> state.legal_entity_id
      OR owner_state.effective_from > state.occurred_on
      OR (owner_state.effective_to IS NOT NULL AND owner_state.effective_to <= state.occurred_on)
    THEN
      RAISE EXCEPTION 'expense % owner attribution is not effective for the entity', expense_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF state.payment_source <> 'PERSONAL_FUNDS' THEN
    SELECT wallet."type" INTO company_wallet_type
    FROM "BusinessLegalEntityWallet" AS assignment
    JOIN "Wallet" AS wallet ON wallet."id" = assignment."walletId"
    WHERE assignment."legalEntityId" = state.legal_entity_id
      AND assignment."walletId" = state.company_wallet_id;

    IF NOT FOUND
      OR (state.payment_source = 'COMPANY_CASH_DESK' AND company_wallet_type <> 'COMPANY_CASH')
      OR (
        state.payment_source = 'COMPANY_CARD'
        AND company_wallet_type NOT IN ('COMPANY_BANK', 'PAYMENT_PROCESSOR')
      )
    THEN
      RAISE EXCEPTION 'expense % company wallet does not match its payment source', expense_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT period."id", period."countryCode", period."vatNumber"
  INTO effective_vat_period_id, effective_vat_country_code, effective_vat_number
  FROM "VatRegistrationPeriod" AS period
  WHERE period."legalEntityId" = state.legal_entity_id
    AND period."effectiveFrom" <= state.tax_point_on
    AND (period."effectiveTo" IS NULL OR period."effectiveTo" > state.tax_point_on);

  SELECT
    snapshot."vatRegistrationPeriodId" AS vat_period_id,
    snapshot."vatRegistrationCountryCode" AS vat_country_code,
    snapshot."vatRegistrationNumber" AS vat_number,
    snapshot."legalEntityTaxIdentifier" AS legal_entity_tax_identifier,
    snapshot."isVatRegistered" AS is_registered,
    snapshot."taxPointOn" AS tax_point_on,
    snapshot."grossAmount" AS gross_amount,
    snapshot."netAmount" AS net_amount,
    snapshot."vatAmount" AS vat_amount,
    snapshot."recoverableVatAmount" AS recoverable_amount,
    snapshot."nonRecoverableVatAmount" AS nonrecoverable_amount,
    snapshot."recognizedCostAmount" AS recognized_amount,
    snapshot."id" AS snapshot_id
  INTO tax_state
  FROM "ExpenseTaxSnapshot" AS snapshot
  WHERE snapshot."expenseId" = expense_id;

  IF NOT FOUND
    OR tax_state.tax_point_on <> state.tax_point_on
    OR tax_state.gross_amount <> state.expense_gross
    OR tax_state.recognized_amount <> state.expense_recognized
  THEN
    RAISE EXCEPTION 'expense % tax snapshot does not reconcile to the expense', expense_id
      USING ERRCODE = '23514';
  END IF;

  IF state.expense_status <> 'DRAFT' AND (
    tax_state.vat_period_id IS DISTINCT FROM effective_vat_period_id
    OR tax_state.vat_country_code IS DISTINCT FROM effective_vat_country_code
    OR tax_state.vat_number IS DISTINCT FROM effective_vat_number
    OR tax_state.legal_entity_tax_identifier IS DISTINCT FROM state.current_legal_entity_tax_identifier
    OR tax_state.is_registered <> (effective_vat_period_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'expense % tax snapshot does not match its effective facts', expense_id
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*) AS line_count,
    COALESCE(sum(line."netAmount"), 0) AS net_amount,
    COALESCE(sum(line."vatAmount"), 0) AS vat_amount,
    COALESCE(sum(line."grossAmount"), 0) AS gross_amount,
    COALESCE(sum(line."recoverableVatAmount"), 0) AS recoverable_amount,
    COALESCE(sum(line."nonRecoverableVatAmount"), 0) AS nonrecoverable_amount
  INTO tax_sums
  FROM "ExpenseTaxLine" AS line
  WHERE line."taxSnapshotId" = tax_state.snapshot_id;

  IF (tax_sums.line_count = 0 AND (
      tax_state.net_amount <> state.expense_gross
      OR tax_state.vat_amount <> 0
      OR tax_state.recoverable_amount <> 0
      OR tax_state.nonrecoverable_amount <> 0
    )) OR (tax_sums.line_count > 0 AND (
      tax_sums.net_amount <> tax_state.net_amount
      OR tax_sums.vat_amount <> tax_state.vat_amount
      OR tax_sums.gross_amount <> tax_state.gross_amount
      OR tax_sums.recoverable_amount <> tax_state.recoverable_amount
      OR tax_sums.nonrecoverable_amount <> tax_state.nonrecoverable_amount
    ))
  THEN
    RAISE EXCEPTION 'expense % tax lines do not reconcile to the snapshot', expense_id
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO invalid_document_count
  FROM "ExpenseDocument" AS document
  WHERE document."expenseId" = expense_id
    AND (
      (
        document."type" = 'POS_RECEIPT'
        AND (
          document."buyerCuiStatus" <> 'NOT_APPLICABLE'
          OR document."buyerTaxIdentifier" IS NOT NULL
        )
      ) OR (
        document."type" IN ('FISCAL_RECEIPT', 'INVOICE', 'CREDIT_NOTE')
        AND (
          document."buyerCuiStatus" = 'NOT_APPLICABLE'
          OR (
            document."buyerCuiStatus" = 'MATCHED'
            AND (
              document."buyerTaxIdentifier" IS NULL
              OR normalize_ro_tax_identifier(document."buyerTaxIdentifier")
                <> tax_state.legal_entity_tax_identifier
            )
          )
          OR (
            document."buyerCuiStatus" = 'MISSING'
            AND document."buyerTaxIdentifier" IS NOT NULL
          )
          OR (
            document."buyerCuiStatus" = 'MISMATCH'
            AND (
              document."buyerTaxIdentifier" IS NULL
              OR normalize_ro_tax_identifier(document."buyerTaxIdentifier")
                = tax_state.legal_entity_tax_identifier
            )
          )
        )
      )
    );

  IF invalid_document_count <> 0 THEN
    RAISE EXCEPTION 'expense % has invalid buyer tax evidence metadata', expense_id
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO qualifying_document_count
  FROM "ExpenseDocument" AS document
  WHERE document."expenseId" = expense_id
    AND document."type" IN ('FISCAL_RECEIPT', 'INVOICE')
    AND document."reviewStatus" = 'CONFIRMED'
    AND document."buyerCuiStatus" = 'MATCHED'
    AND document."buyerTaxIdentifier" IS NOT NULL
    AND normalize_ro_tax_identifier(document."buyerTaxIdentifier")
      = tax_state.legal_entity_tax_identifier
    AND EXISTS (
      SELECT 1
      FROM "ExpenseDocumentAsset" AS document_asset
      JOIN "MediaAsset" AS media_asset
        ON media_asset."id" = document_asset."assetId"
      WHERE document_asset."documentId" = document."id"
        AND document_asset."role" = 'ORIGINAL'
        AND media_asset."deletedAt" IS NULL
    );

  SELECT count(*) INTO qualifying_pos_document_count
  FROM "ExpenseDocument" AS document
  WHERE document."expenseId" = expense_id
    AND document."type" = 'POS_RECEIPT'
    AND document."reviewStatus" = 'CONFIRMED'
    AND EXISTS (
      SELECT 1
      FROM "ExpenseDocumentAsset" AS document_asset
      JOIN "MediaAsset" AS media_asset
        ON media_asset."id" = document_asset."assetId"
      WHERE document_asset."documentId" = document."id"
        AND document_asset."role" = 'ORIGINAL'
        AND media_asset."deletedAt" IS NULL
    );

  SELECT count(*) INTO matched_buyer_assertion_count
  FROM "ExpenseDocument" AS document
  WHERE document."expenseId" = expense_id
    AND document."buyerCuiStatus" = 'MATCHED';

  IF state.expense_status <> 'DRAFT'
    AND state.payment_source = 'PERSONAL_FUNDS'
    AND matched_buyer_assertion_count <> 0
  THEN
    RAISE EXCEPTION 'personal-funded expense % cannot claim matched company-buyer evidence', expense_id
      USING ERRCODE = '23514';
  ELSIF state.expense_status <> 'DRAFT'
    AND state.payment_source <> 'PERSONAL_FUNDS'
    AND qualifying_document_count = 0
  THEN
    RAISE EXCEPTION 'company-funded expense % requires confirmed matched fiscal evidence with a live original file', expense_id
      USING ERRCODE = '23514';
  ELSIF state.expense_status <> 'DRAFT'
    AND state.payment_source = 'COMPANY_CARD'
    AND qualifying_pos_document_count = 0
  THEN
    RAISE EXCEPTION 'company-card expense % requires a confirmed POS receipt with a live original file', expense_id
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO invalid_tax_recovery_count
  FROM "ExpenseTaxLine" AS line
  WHERE line."taxSnapshotId" = tax_state.snapshot_id
    AND line."recoverableVatAmount" <> CASE
      WHEN effective_vat_period_id IS NOT NULL AND qualifying_document_count > 0
        THEN round(line."vatAmount" * line."deductiblePercent" / 100, 2)
      ELSE 0
    END;

  IF state.expense_status <> 'DRAFT' AND invalid_tax_recovery_count <> 0 THEN
    RAISE EXCEPTION 'expense % tax-line VAT recovery does not match deductibility', expense_id
      USING ERRCODE = '23514';
  END IF;

  IF state.expense_status <> 'DRAFT'
    AND qualifying_document_count = 0 AND (
      tax_state.recoverable_amount <> 0
      OR state.expense_recognized <> state.expense_gross
      OR state.fiscal_deductible <> 0
    )
  THEN
    RAISE EXCEPTION 'expense % lacks confirmed fiscal evidence for recovery or deductibility', expense_id
      USING ERRCODE = '23514';
  ELSIF state.expense_status <> 'DRAFT'
    AND qualifying_document_count > 0
    AND state.fiscal_deductible <> state.expense_recognized
  THEN
    RAISE EXCEPTION 'expense % fiscal deductible amount must equal recognized cost', expense_id
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO claim_count
  FROM "ExpenseReimbursementClaim" AS claim
  WHERE claim."expenseId" = expense_id;

  IF state.expense_status = 'DRAFT' AND claim_count <> 0 THEN
    RAISE EXCEPTION 'draft expense % cannot have a reimbursement claim', expense_id
      USING ERRCODE = '23514';
  ELSIF state.expense_status <> 'DRAFT' AND should_reimburse THEN
    IF claim_count <> 1 THEN
      RAISE EXCEPTION 'reimbursable expense % must have exactly one claim', expense_id
        USING ERRCODE = '23514';
    END IF;

    SELECT
      claim."id" AS claim_id,
      claim."expensePaymentId" AS payment_id,
      claim."legalEntityId" AS legal_entity_id,
      claim."claimantUserId" AS claimant_user_id,
      claim."status" AS claim_status,
      claim."originalAmount" AS original_amount,
      claim."settledAmount" AS settled_amount,
      claim."currency" AS claim_currency
    INTO claim_state
    FROM "ExpenseReimbursementClaim" AS claim
    WHERE claim."expenseId" = expense_id;

    IF claim_state.payment_id <> state.payment_id
      OR claim_state.legal_entity_id <> state.legal_entity_id
      OR claim_state.claimant_user_id <> state.funded_by_user_id
      OR claim_state.original_amount <> state.expense_gross
      OR claim_state.claim_currency <> state.expense_currency
      OR (state.expense_status = 'REVERSED' AND claim_state.claim_status <> 'CANCELLED')
      OR (state.expense_status = 'POSTED' AND claim_state.claim_status = 'CANCELLED')
    THEN
      RAISE EXCEPTION 'expense % reimbursement claim does not match its funder', expense_id
        USING ERRCODE = '23514';
    END IF;

    SELECT
      COALESCE(sum(settlement."amount"), 0),
      count(settlement."id"),
      count(posting."id"),
      count(settlement."id") FILTER (
        WHERE assignment."id" IS NULL
          OR wallet."id" IS NULL
          OR wallet."type" = 'USER'
      ),
      count(settlement."id") FILTER (
        WHERE posting."id" IS NULL
          OR settlement_transaction."type" <> 'REIMBURSEMENT'
          OR settlement_transaction."status" <> 'POSTED'
          OR settlement_transaction."financialScope" <> 'COMPANY'
          OR settlement_transaction."amount" <> settlement."amount"
          OR settlement_transaction."currency" <> claim_state.claim_currency
          OR settlement_transaction."recipientUserId" IS DISTINCT FROM claim_state.claimant_user_id
          OR (
            SELECT count(*)
            FROM "WalletBalanceChange" AS change
            WHERE change."moneyTransactionId" = settlement_transaction."id"
          ) <> 1
          OR NOT EXISTS (
            SELECT 1
            FROM "WalletBalanceChange" AS change
            WHERE change."moneyTransactionId" = settlement_transaction."id"
              AND change."walletId" = settlement."companyWalletId"
              AND change."bucket" = 'BUSINESS_FUNDS'
              AND change."currency" = claim_state.claim_currency
              AND change."amountDelta" = -settlement."amount"
          )
      )
    INTO
      settlement_total,
      settlement_count,
      settlement_posting_count,
      invalid_settlement_wallet_count,
      invalid_settlement_posting_count
    FROM "ExpenseReimbursementSettlement" AS settlement
    LEFT JOIN "BusinessLegalEntityWallet" AS assignment
      ON assignment."legalEntityId" = claim_state.legal_entity_id
      AND assignment."walletId" = settlement."companyWalletId"
    LEFT JOIN "Wallet" AS wallet
      ON wallet."id" = settlement."companyWalletId"
    LEFT JOIN "ExpensePosting" AS posting
      ON posting."reimbursementSettlementId" = settlement."id"
      AND posting."expenseId" = expense_id
      AND posting."role" = 'REIMBURSEMENT_SETTLEMENT'
    LEFT JOIN "MoneyTransaction" AS settlement_transaction
      ON settlement_transaction."id" = posting."moneyTransactionId"
    WHERE settlement."claimId" = claim_state.claim_id;

    IF settlement_total <> claim_state.settled_amount
      OR settlement_posting_count <> settlement_count
      OR invalid_settlement_wallet_count <> 0
      OR invalid_settlement_posting_count <> 0
      OR (
        claim_state.claim_status = 'CANCELLED'
        AND (claim_state.settled_amount <> 0 OR settlement_count <> 0)
      )
    THEN
      RAISE EXCEPTION 'expense % reimbursement settlements are inconsistent', expense_id
        USING ERRCODE = '23514';
    END IF;
  ELSIF claim_count <> 0 THEN
    RAISE EXCEPTION 'non-reimbursable expense % cannot have a claim', expense_id
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*) FILTER (WHERE posting."role" = 'EXPENSE_PAYMENT'),
    count(*) FILTER (WHERE posting."role" = 'EXPENSE_REVERSAL'),
    count(*) FILTER (
      WHERE posting."role" = 'EXPENSE_PAYMENT'
        AND (
          posting."paymentId" IS DISTINCT FROM state.payment_id
          OR ledger."type" <> 'EXPENSE'
          OR ledger."status" <> CASE
            WHEN state.expense_status = 'REVERSED' THEN 'REVERSED'::"MoneyTransactionStatus"
            ELSE 'POSTED'::"MoneyTransactionStatus"
          END
          OR ledger."financialScope" <> 'COMPANY'
          OR ledger."amount" <> state.expense_gross
          OR ledger."currency" <> state.expense_currency
          OR ledger."categoryId" IS DISTINCT FROM (
            SELECT expense."categoryId" FROM "Expense" AS expense WHERE expense."id" = expense_id
          )
          OR ledger."counterpartyId" IS DISTINCT FROM (
            SELECT expense."payeeId" FROM "Expense" AS expense WHERE expense."id" = expense_id
          )
          OR (
            SELECT count(*)
            FROM "WalletBalanceChange" AS change
            WHERE change."moneyTransactionId" = ledger."id"
          ) <> 1
          OR NOT EXISTS (
            SELECT 1
            FROM "WalletBalanceChange" AS change
            WHERE change."moneyTransactionId" = ledger."id"
              AND change."walletId" = state.company_wallet_id
              AND change."bucket" = 'BUSINESS_FUNDS'
              AND change."currency" = state.expense_currency
              AND change."amountDelta" = -state.expense_gross
          )
        )
    ),
    count(*) FILTER (
      WHERE posting."role" = 'EXPENSE_REVERSAL'
        AND (
          ledger."type" <> 'REVERSAL'
          OR ledger."status" <> 'POSTED'
          OR ledger."financialScope" <> 'COMPANY'
          OR ledger."amount" <> state.expense_gross
          OR ledger."currency" <> state.expense_currency
          OR ledger."reversalOfTransactionId" IS DISTINCT FROM (
            SELECT payment_posting."moneyTransactionId"
            FROM "ExpensePosting" AS payment_posting
            WHERE payment_posting."expenseId" = expense_id
              AND payment_posting."role" = 'EXPENSE_PAYMENT'
          )
          OR (
            SELECT count(*)
            FROM "WalletBalanceChange" AS change
            WHERE change."moneyTransactionId" = ledger."id"
          ) <> 1
          OR NOT EXISTS (
            SELECT 1
            FROM "WalletBalanceChange" AS change
            WHERE change."moneyTransactionId" = ledger."id"
              AND change."walletId" = state.company_wallet_id
              AND change."bucket" = 'BUSINESS_FUNDS'
              AND change."currency" = state.expense_currency
              AND change."amountDelta" = state.expense_gross
          )
        )
    )
  INTO
    payment_posting_count,
    reversal_posting_count,
    invalid_payment_posting_count,
    invalid_reversal_posting_count
  FROM "ExpensePosting" AS posting
  JOIN "MoneyTransaction" AS ledger ON ledger."id" = posting."moneyTransactionId"
  WHERE posting."expenseId" = expense_id;

  IF invalid_payment_posting_count <> 0 OR invalid_reversal_posting_count <> 0 THEN
    RAISE EXCEPTION 'expense % has an invalid ledger posting', expense_id
      USING ERRCODE = '23514';
  ELSIF state.expense_status = 'DRAFT'
    AND (payment_posting_count <> 0 OR reversal_posting_count <> 0)
  THEN
    RAISE EXCEPTION 'draft expense % cannot have ledger postings', expense_id
      USING ERRCODE = '23514';
  ELSIF state.payment_source = 'PERSONAL_FUNDS'
    AND (payment_posting_count <> 0 OR reversal_posting_count <> 0)
  THEN
    RAISE EXCEPTION 'personal-funded expense % cannot move a company wallet', expense_id
      USING ERRCODE = '23514';
  ELSIF state.payment_source <> 'PERSONAL_FUNDS' AND state.expense_status = 'POSTED'
    AND (payment_posting_count <> 1 OR reversal_posting_count <> 0)
  THEN
    RAISE EXCEPTION 'posted company-funded expense % requires one cash posting', expense_id
      USING ERRCODE = '23514';
  ELSIF state.payment_source <> 'PERSONAL_FUNDS' AND state.expense_status = 'REVERSED'
    AND (payment_posting_count <> 1 OR reversal_posting_count <> 1)
  THEN
    RAISE EXCEPTION 'reversed company-funded expense % requires payment and reversal postings', expense_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
