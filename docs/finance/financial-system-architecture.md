# ScooterCity Financial Module — Master Implementation Prompt

You are implementing the financial module for **ScooterCity**.

The application stack is:

- **NestJS** REST API
- **Prisma**
- **PostgreSQL**
- **Next.js**
- **TypeScript**
- Existing ScooterCity domain models such as users, associates, rentals, scooters, and vehicles

Inspect the existing repository before changing anything. Follow the existing naming, module, authentication, authorization, validation, API-client, and UI conventions where they are already established.

Do not stop after producing a plan. Implement the requested phase, run the relevant tests, and provide a concise summary of the changes.

---

# 1. Objective

Build a financial system that can answer all of the following questions independently:

1. What business operation occurred?
2. Did it affect company revenue, company expenses, assets, or liabilities?
3. Where is the money currently located?
4. Who paid the money?
5. Did an associate pay using personal funds?
6. Does the company owe money to an associate?
7. Does an associate owe money to the company?
8. What object, vehicle, scooter, property, or activity did the cost belong to?
9. Which associate received the economic benefit?
10. What internal settlement is necessary between associates?
11. Is the transaction part of the company’s finances or the associates’ private shared pool?
12. How can the operation be reversed without destroying its audit history?

The system must not collapse all of these concepts into one generic `Transaction` table.

---

# 2. Non-negotiable domain rules

## 2.1 All registered company expenses are legitimate company expenses

For this application, assume that every operation registered as a company `Expense` is a legitimate company expense.

Do not implement:

- automatic legal validation;
- automatic tax deductibility validation;
- rejection based on the economic beneficiary;
- rejection because the cost object belongs to an associate;
- assumptions based only on whether the company CUI appears on a receipt.

A strictly personal purchase that is not a company expense must not be saved as `Expense`. It must be saved separately as `PERSONAL_USE`.

## 2.2 Payment source and economic beneficiary are independent

Never infer the beneficiary from the payer.

Example:

```text
Iusti pays 400 lei from personal funds.
Emiliano is the sole economic beneficiary.
```

The result is:

```text
Company owes Iusti: 400 lei
Emiliano received a specific economic benefit: 400 lei
```

At 50%–50%, the internal settlement is:

```text
Emiliano → Iusti: 200 lei
```

The 400 lei reimbursement and the 200 lei settlement are separate obligations.

## 2.3 Personal funds are not personal ledger accounts

Do not create separate ledger accounts for:

```text
Personal cash Emiliano
Personal card Emiliano
Personal cash Iusti
Personal card Iusti
```

The system does not track the associates’ personal wealth.

Instead, an expense payment may have:

```text
sourceType = ASSOCIATE_PERSONAL_FUNDS
payerAssociateId = ...
paymentMethod = CASH | CARD | BANK_TRANSFER | ONLINE
```

The payment method is metadata. It is not a personal money account.

## 2.4 Company cash held by an associate is company money

This:

```text
Company Cash Held by Emiliano
```

is a company asset.

It is completely different from:

```text
Emiliano Personal Funds
```

The first is represented by a ledger account with the role:

```text
COMPANY_CASH_CUSTODY
```

The second is represented only as an external payment source.

## 2.5 All money uses integer minor units

Use:

```text
amountMinor
```

For RON:

```text
1 leu = 100 bani
300 lei = 30_000 amountMinor
```

Never use `Float` for money.

Use TypeScript utilities to convert display values to and from minor units at the API/UI boundary.

## 2.6 Posted operations are immutable

Once an operation has status `POSTED`:

- do not edit its financial fields;
- do not delete it;
- do not rewrite its journal postings.

Corrections must be made through a new `REVERSAL` operation whose postings are the exact inverse of the original postings.

## 2.7 The backend is the financial source of truth

Next.js must not calculate authoritative:

- journal postings;
- account balances;
- company liabilities;
- associate receivables;
- settlement values;
- profit impact.

The frontend may format values and display backend previews, but all financial calculations must live in NestJS domain/application services.

## 2.8 Document extraction may suggest, but never decide, the finance book

The finance book remains an explicit, user-editable value that is validated
before posting. Receipt extraction may prefill it to reduce repetitive work:

- the configured company's buyer CUI/CIF or legal name matches: suggest the
  company book;
- company identity is configured but the buyer differs or is absent: suggest
  the associate-pool book;
- company identity is not configured: leave the book unset.

These are review-screen defaults, not authoritative accounting decisions. A
document is supporting metadata and the user confirms or changes the suggested
book before the operation is recorded.

---

# 3. Finance books

The module has two conceptual financial books.

```prisma
enum FinanceBookType {
  COMPANY
  ASSOCIATE_POOL
}
```

## `COMPANY`

Contains ScooterCity company operations:

- rental revenue;
- scooter-sale revenue;
- company expenses;
- company assets;
- bank and cash-register money;
- company cash held by associates;
- associate-funded company expenses;
- associate loans to the company;
- company liabilities to associates;
- company receivables from associates.

## `ASSOCIATE_POOL`

Contains private shared money managed between associates:

- rental or sale income explicitly assigned to the private pool;
- pool cash held by each associate;
- pool expenses;
- private pool settlement.

`FinanceBook` is not a multi-tenancy or `Company` model. ScooterCity is not currently multi-tenant.

---

# 4. Accounting conventions

Use a double-entry ledger.

For `JournalPosting.signedAmountMinor`:

```text
Positive = debit
Negative = credit
```

Every journal entry must satisfy:

```text
sum(postings.signedAmountMinor) = 0
```

Natural behavior:

```text
ASSET increase       = positive
ASSET decrease       = negative

EXPENSE increase     = positive
EXPENSE decrease     = negative

LIABILITY increase   = negative
LIABILITY decrease   = positive

REVENUE increase     = negative
REVENUE decrease     = positive

EQUITY increase      = negative
EQUITY decrease      = positive
```

When displaying balances:

```text
ASSET / EXPENSE:
display raw signed balance

LIABILITY / REVENUE / EQUITY:
display the negated signed balance
```

Do not store account balances in v1. Calculate them from journal postings.

---

# 5. Target Prisma schema

Merge the following schema into the existing Prisma schema.

Relation names may be adapted to avoid conflicts with the existing `User`, `Rental`, `Scooter`, or vehicle models, but the domain semantics must not be changed.

```prisma
enum FinanceBookType {
  COMPANY
  ASSOCIATE_POOL
}

enum FinancialOperationKind {
  EXPENSE
  INCOME
  TRANSFER
  ASSOCIATE_FUNDING
  REIMBURSEMENT
  PERSONAL_USE
  REVERSAL
}

enum FinancialOperationStatus {
  DRAFT
  POSTED
  REVERSED
}

enum LedgerAccountCategory {
  ASSET
  LIABILITY
  EQUITY
  REVENUE
  EXPENSE
}

enum LedgerAccountRole {
  BANK
  CASH_REGISTER

  COMPANY_CASH_CUSTODY
  ASSOCIATE_POOL_CASH_CUSTODY

  PAYABLE_TO_ASSOCIATE
  RECEIVABLE_FROM_ASSOCIATE
  ASSOCIATE_LOAN_PAYABLE

  OPERATING_EXPENSE
  NON_OPERATIONAL_COMPANY_EXPENSE
  ASSOCIATE_POOL_EXPENSE

  FIXED_ASSET

  RENTAL_REVENUE
  SCOOTER_SALE_REVENUE
  ASSOCIATE_POOL_REVENUE
}

enum ExpenseTreatment {
  OPERATING_EXPENSE
  NON_OPERATIONAL_COMPANY_EXPENSE
  CAPITAL_ASSET
  ASSOCIATE_POOL_EXPENSE
}

enum ExpensePaymentSourceType {
  BOOK_ACCOUNT
  ASSOCIATE_PERSONAL_FUNDS
}

enum PaymentMethod {
  CASH
  CARD
  BANK_TRANSFER
  ONLINE
  OTHER
}

enum EconomicAllocationType {
  COMMON
  ASSOCIATE_SPECIFIC
}

enum IncomeType {
  RENTAL
  SCOOTER_SALE
}

enum AssociateFundingType {
  LOAN
}

enum ReimbursementType {
  EXPENSE_ADVANCE_REPAYMENT
  ASSOCIATE_LOAN_REPAYMENT
  ASSOCIATE_RECEIVABLE_REPAYMENT
}

enum CostObjectType {
  SCOOTER
  VEHICLE
  PROPERTY
  OFFICE
  FLEET
  EQUIPMENT
  OTHER
}

enum CostObjectOwnershipType {
  COMPANY
  ASSOCIATE
  SHARED
  EXTERNAL
}

enum FinancialDocumentType {
  RECEIPT
  INVOICE
  CONTRACT
  OTHER
}

enum SettlementRunKind {
  COMPANY_SPECIFIC_BENEFIT
  ASSOCIATE_POOL_CASH
}

enum SettlementRunStatus {
  DRAFT
  CONFIRMED
  PARTIALLY_SETTLED
  SETTLED
  CANCELLED
}

enum SettlementTransferStatus {
  PENDING
  COMPLETED
  CANCELLED
}

model FinanceBook {
  id                 String            @id @default(uuid())
  name               String
  type               FinanceBookType
  functionalCurrency String            @default("RON")

  members            FinanceBookMember[]
  accounts           LedgerAccount[]
  operations         FinancialOperation[]
  expenseCategories  ExpenseCategory[]
  costObjects        CostObject[]
  settlementRuns     SettlementRun[]

  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt

  @@unique([type])
}

model FinanceBookMember {
  id               String      @id @default(uuid())
  bookId           String
  associateId      String

  /// 5000 means 50.00%.
  shareBasisPoints Int

  validFrom        DateTime    @default(now())
  validUntil       DateTime?

  book             FinanceBook @relation(
    fields: [bookId],
    references: [id],
    onDelete: Restrict
  )

  associate        User        @relation(
    "FinanceBookMemberAssociate",
    fields: [associateId],
    references: [id],
    onDelete: Restrict
  )

  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt

  @@index([bookId, validFrom, validUntil])
  @@index([associateId])
}

model LedgerAccount {
  id                         String                @id @default(uuid())
  bookId                     String
  code                       String
  name                       String

  category                   LedgerAccountCategory
  role                       LedgerAccountRole

  /// Used by accounts connected to a particular associate:
  /// - company cash held by associate
  /// - pool cash held by associate
  /// - payable to associate
  /// - receivable from associate
  /// - associate loan payable
  associateId                String?

  isDefault                  Boolean               @default(false)
  isActive                   Boolean               @default(true)
  isSystem                   Boolean               @default(false)

  book                       FinanceBook           @relation(
    fields: [bookId],
    references: [id],
    onDelete: Restrict
  )

  associate                  User?                 @relation(
    "LedgerAccountAssociate",
    fields: [associateId],
    references: [id],
    onDelete: Restrict
  )

  postings                   JournalPosting[]

  expensePaymentSources      ExpensePayment[]      @relation(
    "ExpensePaymentSourceAccount"
  )

  incomeDestinations         Income[]              @relation(
    "IncomeDestinationAccount"
  )

  transfersFrom              MoneyTransfer[]       @relation(
    "TransferFromAccount"
  )

  transfersTo                MoneyTransfer[]       @relation(
    "TransferToAccount"
  )

  fundingDestinations        AssociateFunding[]    @relation(
    "FundingDestinationAccount"
  )

  reimbursementCashAccounts  Reimbursement[]       @relation(
    "ReimbursementCashAccount"
  )

  reimbursementObligations   Reimbursement[]       @relation(
    "ReimbursementObligationAccount"
  )

  personalUseSources         PersonalUse[]         @relation(
    "PersonalUseSourceAccount"
  )

  createdAt                  DateTime              @default(now())
  updatedAt                  DateTime              @updatedAt

  @@unique([bookId, code])
  @@index([bookId, role])
  @@index([bookId, associateId])
}

model FinancialOperation {
  id                     String                     @id @default(uuid())
  bookId                 String
  kind                   FinancialOperationKind
  status                 FinancialOperationStatus   @default(DRAFT)

  occurredAt             DateTime
  description            String?

  /// Identifies the client command/request.
  /// It is not the database record ID.
  idempotencyKey         String

  createdById            String
  postedAt               DateTime?

  /// Present only on a REVERSAL operation.
  reversalOfOperationId  String?                    @unique

  book                   FinanceBook                @relation(
    fields: [bookId],
    references: [id],
    onDelete: Restrict
  )

  createdBy              User                       @relation(
    "FinancialOperationCreatedBy",
    fields: [createdById],
    references: [id],
    onDelete: Restrict
  )

  reversalOf             FinancialOperation?        @relation(
    "FinancialOperationReversal",
    fields: [reversalOfOperationId],
    references: [id],
    onDelete: Restrict
  )

  reversedBy             FinancialOperation?        @relation(
    "FinancialOperationReversal"
  )

  expense                Expense?
  income                 Income?
  transfer               MoneyTransfer?
  associateFunding       AssociateFunding?
  reimbursement          Reimbursement?
  personalUse            PersonalUse?

  allocations            EconomicAllocation[]
  documents              FinancialDocument[]
  journalEntry           JournalEntry?

  settlementRuns         SettlementOperation[]

  createdAt              DateTime                   @default(now())
  updatedAt              DateTime                   @updatedAt

  @@unique([bookId, idempotencyKey])
  @@index([bookId, occurredAt])
  @@index([bookId, kind, status])
  @@index([status])
}

model ExpenseCategory {
  id                String            @id @default(uuid())
  bookId            String
  code              String
  name              String

  defaultTreatment  ExpenseTreatment?
  isActive          Boolean           @default(true)

  book              FinanceBook       @relation(
    fields: [bookId],
    references: [id],
    onDelete: Restrict
  )

  expenses          Expense[]

  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  @@unique([bookId, code])
  @@index([bookId, isActive])
}

model CostObject {
  id                              String                        @id @default(uuid())
  bookId                          String
  code                            String
  name                            String

  type                            CostObjectType
  ownershipType                   CostObjectOwnershipType

  /// Required when ownershipType = ASSOCIATE.
  ownerAssociateId                String?

  /// Optional links to an existing domain entity.
  /// Replace these with proper relations when suitable models already exist.
  externalEntityType              String?
  externalEntityId                String?

  /// UI defaults only. Every expense must still persist explicit allocations.
  defaultAllocationType           EconomicAllocationType?
  defaultBeneficiaryAssociateId   String?

  isActive                        Boolean                       @default(true)

  book                            FinanceBook                   @relation(
    fields: [bookId],
    references: [id],
    onDelete: Restrict
  )

  ownerAssociate                  User?                         @relation(
    "CostObjectOwner",
    fields: [ownerAssociateId],
    references: [id],
    onDelete: Restrict
  )

  defaultBeneficiaryAssociate     User?                         @relation(
    "CostObjectDefaultBeneficiary",
    fields: [defaultBeneficiaryAssociateId],
    references: [id],
    onDelete: Restrict
  )

  expenses                        Expense[]

  createdAt                       DateTime                      @default(now())
  updatedAt                       DateTime                      @updatedAt

  @@unique([bookId, code])
  @@index([bookId, type])
  @@index([ownerAssociateId])
  @@index([externalEntityType, externalEntityId])
}

model Expense {
  id             String            @id @default(uuid())
  operationId    String            @unique

  amountMinor    Int
  treatment      ExpenseTreatment

  categoryId     String
  costObjectId   String?

  operation      FinancialOperation @relation(
    fields: [operationId],
    references: [id],
    onDelete: Restrict
  )

  category       ExpenseCategory    @relation(
    fields: [categoryId],
    references: [id],
    onDelete: Restrict
  )

  costObject     CostObject?        @relation(
    fields: [costObjectId],
    references: [id],
    onDelete: Restrict
  )

  payments       ExpensePayment[]

  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  @@index([categoryId])
  @@index([costObjectId])
  @@index([treatment])
}

model ExpensePayment {
  id                 String                     @id @default(uuid())
  expenseId          String

  sourceType         ExpensePaymentSourceType
  amountMinor        Int
  paymentMethod      PaymentMethod

  /// Required when sourceType = BOOK_ACCOUNT.
  sourceAccountId    String?

  /// Required when sourceType = ASSOCIATE_PERSONAL_FUNDS.
  payerAssociateId   String?

  expense            Expense                    @relation(
    fields: [expenseId],
    references: [id],
    onDelete: Restrict
  )

  sourceAccount      LedgerAccount?             @relation(
    "ExpensePaymentSourceAccount",
    fields: [sourceAccountId],
    references: [id],
    onDelete: Restrict
  )

  payerAssociate     User?                      @relation(
    "ExpensePaymentPayer",
    fields: [payerAssociateId],
    references: [id],
    onDelete: Restrict
  )

  createdAt          DateTime                   @default(now())

  @@index([expenseId])
  @@index([payerAssociateId])
  @@index([sourceAccountId])
}

model EconomicAllocation {
  id             String                    @id @default(uuid())
  operationId    String

  type           EconomicAllocationType
  amountMinor    Int

  /// Required only when type = ASSOCIATE_SPECIFIC.
  associateId    String?

  operation      FinancialOperation        @relation(
    fields: [operationId],
    references: [id],
    onDelete: Restrict
  )

  associate      User?                     @relation(
    "EconomicAllocationAssociate",
    fields: [associateId],
    references: [id],
    onDelete: Restrict
  )

  createdAt      DateTime                  @default(now())

  @@index([operationId])
  @@index([associateId])
}

model FinancialDocument {
  id                 String                  @id @default(uuid())
  operationId        String

  type               FinancialDocumentType
  documentNumber     String?
  issuedAt           DateTime?

  supplierName       String?
  supplierTaxId      String?

  storageKey         String?
  notes              String?

  operation          FinancialOperation      @relation(
    fields: [operationId],
    references: [id],
    onDelete: Restrict
  )

  createdAt          DateTime                @default(now())
  updatedAt          DateTime                @updatedAt

  @@index([operationId])
}

model Income {
  id                    String             @id @default(uuid())
  operationId           String             @unique

  type                  IncomeType
  amountMinor           Int
  paymentMethod         PaymentMethod

  destinationAccountId  String

  /// Connect these to existing domain models when available.
  rentalId              String?
  scooterId             String?

  operation             FinancialOperation @relation(
    fields: [operationId],
    references: [id],
    onDelete: Restrict
  )

  destinationAccount    LedgerAccount      @relation(
    "IncomeDestinationAccount",
    fields: [destinationAccountId],
    references: [id],
    onDelete: Restrict
  )

  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt

  @@index([destinationAccountId])
  @@index([rentalId])
  @@index([scooterId])
}

model MoneyTransfer {
  id             String             @id @default(uuid())
  operationId    String             @unique

  amountMinor    Int
  fromAccountId  String
  toAccountId    String

  operation      FinancialOperation @relation(
    fields: [operationId],
    references: [id],
    onDelete: Restrict
  )

  fromAccount    LedgerAccount      @relation(
    "TransferFromAccount",
    fields: [fromAccountId],
    references: [id],
    onDelete: Restrict
  )

  toAccount      LedgerAccount      @relation(
    "TransferToAccount",
    fields: [toAccountId],
    references: [id],
    onDelete: Restrict
  )

  createdAt      DateTime           @default(now())

  @@index([fromAccountId])
  @@index([toAccountId])
}

model AssociateFunding {
  id                    String                 @id @default(uuid())
  operationId           String                 @unique

  type                  AssociateFundingType   @default(LOAN)
  associateId           String
  destinationAccountId  String
  amountMinor           Int

  operation             FinancialOperation     @relation(
    fields: [operationId],
    references: [id],
    onDelete: Restrict
  )

  associate             User                   @relation(
    "AssociateFundingAssociate",
    fields: [associateId],
    references: [id],
    onDelete: Restrict
  )

  destinationAccount    LedgerAccount          @relation(
    "FundingDestinationAccount",
    fields: [destinationAccountId],
    references: [id],
    onDelete: Restrict
  )

  createdAt             DateTime               @default(now())

  @@index([associateId])
  @@index([destinationAccountId])
}

model Reimbursement {
  id                    String              @id @default(uuid())
  operationId           String              @unique

  type                  ReimbursementType
  associateId           String
  amountMinor           Int

  /// For liability repayment this is the source account.
  /// For receivable repayment this is the destination account.
  cashAccountId         String

  /// PAYABLE_TO_ASSOCIATE, ASSOCIATE_LOAN_PAYABLE,
  /// or RECEIVABLE_FROM_ASSOCIATE.
  obligationAccountId   String

  operation             FinancialOperation  @relation(
    fields: [operationId],
    references: [id],
    onDelete: Restrict
  )

  associate             User                @relation(
    "ReimbursementAssociate",
    fields: [associateId],
    references: [id],
    onDelete: Restrict
  )

  cashAccount           LedgerAccount       @relation(
    "ReimbursementCashAccount",
    fields: [cashAccountId],
    references: [id],
    onDelete: Restrict
  )

  obligationAccount     LedgerAccount       @relation(
    "ReimbursementObligationAccount",
    fields: [obligationAccountId],
    references: [id],
    onDelete: Restrict
  )

  createdAt             DateTime            @default(now())

  @@index([associateId])
  @@index([cashAccountId])
  @@index([obligationAccountId])
}

model PersonalUse {
  id               String             @id @default(uuid())
  operationId      String             @unique

  associateId      String
  sourceAccountId  String
  amountMinor      Int

  operation        FinancialOperation @relation(
    fields: [operationId],
    references: [id],
    onDelete: Restrict
  )

  associate        User               @relation(
    "PersonalUseAssociate",
    fields: [associateId],
    references: [id],
    onDelete: Restrict
  )

  sourceAccount    LedgerAccount      @relation(
    "PersonalUseSourceAccount",
    fields: [sourceAccountId],
    references: [id],
    onDelete: Restrict
  )

  createdAt        DateTime           @default(now())

  @@index([associateId])
  @@index([sourceAccountId])
}

model JournalEntry {
  id             String             @id @default(uuid())
  operationId    String             @unique
  postedAt       DateTime           @default(now())

  operation      FinancialOperation @relation(
    fields: [operationId],
    references: [id],
    onDelete: Restrict
  )

  postings       JournalPosting[]

  createdAt      DateTime           @default(now())
}

model JournalPosting {
  id                  String        @id @default(uuid())
  journalEntryId      String
  accountId           String

  lineNumber          Int
  signedAmountMinor   Int
  description         String?

  journalEntry        JournalEntry  @relation(
    fields: [journalEntryId],
    references: [id],
    onDelete: Restrict
  )

  account             LedgerAccount @relation(
    fields: [accountId],
    references: [id],
    onDelete: Restrict
  )

  createdAt           DateTime      @default(now())

  @@unique([journalEntryId, lineNumber])
  @@index([journalEntryId])
  @@index([accountId])
}

model SettlementRun {
  id                  String                 @id @default(uuid())
  bookId              String

  kind                SettlementRunKind
  status              SettlementRunStatus    @default(DRAFT)

  /// Treat the period as [periodStart, periodEnd).
  periodStart         DateTime
  periodEnd           DateTime

  createdById         String
  calculatedAt        DateTime               @default(now())
  confirmedAt         DateTime?
  completedAt         DateTime?

  book                FinanceBook            @relation(
    fields: [bookId],
    references: [id],
    onDelete: Restrict
  )

  createdBy           User                   @relation(
    "SettlementRunCreatedBy",
    fields: [createdById],
    references: [id],
    onDelete: Restrict
  )

  shareSnapshots      SettlementShareSnapshot[]
  lines               SettlementLine[]
  transfers           SettlementTransfer[]
  operations          SettlementOperation[]

  createdAt           DateTime               @default(now())
  updatedAt           DateTime               @updatedAt

  @@index([bookId, kind, periodStart, periodEnd])
  @@index([status])
}

model SettlementShareSnapshot {
  id                String        @id @default(uuid())
  settlementRunId   String
  associateId       String
  shareBasisPoints  Int

  settlementRun     SettlementRun @relation(
    fields: [settlementRunId],
    references: [id],
    onDelete: Restrict
  )

  associate         User          @relation(
    "SettlementShareAssociate",
    fields: [associateId],
    references: [id],
    onDelete: Restrict
  )

  @@unique([settlementRunId, associateId])
  @@index([associateId])
}

model SettlementLine {
  id                    String        @id @default(uuid())
  settlementRunId       String
  associateId           String

  /// COMPANY_SPECIFIC_BENEFIT:
  /// actual = specific benefit received.
  ///
  /// ASSOCIATE_POOL_CASH:
  /// actual = pool cash currently held.
  actualAmountMinor     Int

  expectedAmountMinor   Int

  /// Positive = associate must receive.
  /// Negative = associate must pay.
  adjustmentMinor       Int

  settlementRun         SettlementRun @relation(
    fields: [settlementRunId],
    references: [id],
    onDelete: Restrict
  )

  associate             User          @relation(
    "SettlementLineAssociate",
    fields: [associateId],
    references: [id],
    onDelete: Restrict
  )

  @@unique([settlementRunId, associateId])
  @@index([associateId])
}

model SettlementTransfer {
  id                 String                   @id @default(uuid())
  settlementRunId    String

  fromAssociateId    String
  toAssociateId      String

  amountMinor        Int
  status             SettlementTransferStatus @default(PENDING)
  paymentMethod      PaymentMethod?
  completedAt        DateTime?
  notes              String?

  settlementRun      SettlementRun            @relation(
    fields: [settlementRunId],
    references: [id],
    onDelete: Restrict
  )

  fromAssociate      User                     @relation(
    "SettlementTransferFrom",
    fields: [fromAssociateId],
    references: [id],
    onDelete: Restrict
  )

  toAssociate        User                     @relation(
    "SettlementTransferTo",
    fields: [toAssociateId],
    references: [id],
    onDelete: Restrict
  )

  @@index([settlementRunId])
  @@index([fromAssociateId])
  @@index([toAssociateId])
}

model SettlementOperation {
  settlementRunId  String
  operationId      String   @unique

  settlementRun    SettlementRun      @relation(
    fields: [settlementRunId],
    references: [id],
    onDelete: Restrict
  )

  operation        FinancialOperation @relation(
    fields: [operationId],
    references: [id],
    onDelete: Restrict
  )

  @@id([settlementRunId, operationId])
}
```

Add the appropriate reverse relation fields to the existing `User` model.

Do not create another user or associate table if the project already has a suitable model.

---

# 6. Ledger role/category mapping

Validate these combinations in the backend:

| Ledger role                       | Required category |
| --------------------------------- | ----------------- |
| `BANK`                            | `ASSET`           |
| `CASH_REGISTER`                   | `ASSET`           |
| `COMPANY_CASH_CUSTODY`            | `ASSET`           |
| `ASSOCIATE_POOL_CASH_CUSTODY`     | `ASSET`           |
| `PAYABLE_TO_ASSOCIATE`            | `LIABILITY`       |
| `RECEIVABLE_FROM_ASSOCIATE`       | `ASSET`           |
| `ASSOCIATE_LOAN_PAYABLE`          | `LIABILITY`       |
| `OPERATING_EXPENSE`               | `EXPENSE`         |
| `NON_OPERATIONAL_COMPANY_EXPENSE` | `EXPENSE`         |
| `ASSOCIATE_POOL_EXPENSE`          | `EXPENSE`         |
| `FIXED_ASSET`                     | `ASSET`           |
| `RENTAL_REVENUE`                  | `REVENUE`         |
| `SCOOTER_SALE_REVENUE`            | `REVENUE`         |
| `ASSOCIATE_POOL_REVENUE`          | `REVENUE`         |

Keep `EQUITY` in the category enum because it is fundamental to the ledger, even though v1 does not require active equity accounts.

---

# 7. Cost objects

`CostObject` answers:

> What object, asset, property, vehicle, scooter, or activity did this cost belong to?

Examples:

```text
Iusti Personal Car
Emiliano Personal Car
Shared Company Van
Bucharest Apartment — Emiliano
Bucharest Office
Scooter SC-001
Scooter SC-002
General Fleet
```

A personal object owned by an associate must use:

```text
ownershipType = ASSOCIATE
ownerAssociateId = that associate
```

Example:

```json
{
  "code": "VEHICLE_IUSTI_PERSONAL",
  "name": "Iusti Personal Car",
  "type": "VEHICLE",
  "ownershipType": "ASSOCIATE",
  "ownerAssociateId": "user_iusti",
  "defaultAllocationType": "ASSOCIATE_SPECIFIC",
  "defaultBeneficiaryAssociateId": "user_iusti"
}
```

Cost-object defaults are UI conveniences only.

The persisted expense must always have explicit `EconomicAllocation` records.

Do not infer payment source from the cost object.

Do not infer accounting treatment from the cost object.

---

# 8. Expense treatments

## `OPERATING_EXPENSE`

Normal company operating cost:

- scooter repair;
- shared van fuel;
- parts;
- rent for shared premises;
- accounting;
- software;
- insurance;
- advertising.

Posting target:

```text
LedgerAccountRole.OPERATING_EXPENSE
```

It reduces company profit.

## `NON_OPERATIONAL_COMPANY_EXPENSE`

A legitimate company expense tracked separately from core operating costs.

This includes the product requirement where:

- the document is issued to ScooterCity;
- an associate pays from personal funds;
- the cost belongs to an associate-owned object;
- that associate is the economic beneficiary;
- the expense is intentionally tracked separately from normal operations.

Example:

```text
Iusti pays 200 lei fuel from personal funds.
Receipt belongs to ScooterCity.
Cost object is Iusti Personal Car.
Beneficiary is Iusti.
```

Posting:

```text
Debit  Non-operational Company Expense  +200
Credit Payable to Iusti                 -200
```

Separate economic allocation:

```text
Iusti specific benefit: 200
```

Company obligation:

```text
Company owes Iusti: 200
```

At 50%–50%, internal settlement:

```text
Iusti → Emiliano: 100
```

Do not eliminate either obligation.

## `CAPITAL_ASSET`

Used when company money is transformed into an asset:

- company van;
- company-owned scooter;
- equipment;
- machinery;
- other capitalized asset.

Posting target:

```text
LedgerAccountRole.FIXED_ASSET
```

It does not immediately become a P&L expense in this management ledger.

Capital assets are excluded from company-benefit settlement in v1.

## `ASSOCIATE_POOL_EXPENSE`

Used only inside `ASSOCIATE_POOL`.

Posting target:

```text
LedgerAccountRole.ASSOCIATE_POOL_EXPENSE
```

---

# 9. Expense posting rules

The expense posting engine must build one balanced debit side and one or more credit lines.

## Debit account

Resolve by treatment:

```text
OPERATING_EXPENSE
→ OPERATING_EXPENSE ledger account

NON_OPERATIONAL_COMPANY_EXPENSE
→ NON_OPERATIONAL_COMPANY_EXPENSE ledger account

CAPITAL_ASSET
→ FIXED_ASSET ledger account

ASSOCIATE_POOL_EXPENSE
→ ASSOCIATE_POOL_EXPENSE ledger account
```

## Payment line from a book account

For:

```text
sourceType = BOOK_ACCOUNT
```

Credit the selected source account:

```text
Debit  expense/asset account  +amount
Credit source account         -amount
```

The selected account must:

- belong to the same book;
- have category `ASSET`;
- have a role allowed as a payment source.

## Payment line from associate personal funds

For:

```text
sourceType = ASSOCIATE_PERSONAL_FUNDS
```

Credit the `PAYABLE_TO_ASSOCIATE` account belonging to the payer:

```text
Debit  expense/asset account        +amount
Credit Payable to Associate         -amount
```

The company or pool owes the payer the full amount, regardless of the economic beneficiary.

## Mixed payments

Support multiple payment lines.

Example:

```text
Expense: 1,000 lei

Company bank:       500
Emiliano personal:  300
Iusti personal:     200
```

Postings:

```text
Operating Expense        +1,000
Bank                       -500
Payable to Emiliano        -300
Payable to Iusti           -200
```

---

# 10. Economic allocation rules

`EconomicAllocation` answers:

> Who received the economic benefit?

It does not answer who paid.

## `COMMON`

```text
associateId = null
```

Common allocations do not create associate-benefit settlement.

## `ASSOCIATE_SPECIFIC`

```text
associateId = required
```

Specific allocations participate in company-benefit settlement.

## Mixed allocation

Support cases such as:

```text
70% common
30% Emiliano
```

Example for 1,000 lei:

```json
[
  {
    "type": "COMMON",
    "amountMinor": 70000
  },
  {
    "type": "ASSOCIATE_SPECIFIC",
    "associateId": "user_emiliano",
    "amountMinor": 30000
  }
]
```

The sum of allocations must equal the expense amount.

---

# 11. Critical examples

These examples must be covered by tests.

## Case A — Company bank pays common expense

```text
Expense: 300
Treatment: OPERATING_EXPENSE
Payment: Company bank
Allocation: COMMON
```

Journal:

```text
Operating Expense  +300
Bank               -300
```

Result:

```text
Company expense: 300
Company cash: -300
Associate payable: 0
Settlement: 0
```

## Case B — Iusti pays personal funds and Iusti benefits

```text
Expense: 200
Treatment: NON_OPERATIONAL_COMPANY_EXPENSE
Payment source: Iusti personal funds
Beneficiary: Iusti
```

Journal:

```text
Non-operational Company Expense  +200
Payable to Iusti                 -200
```

Result:

```text
Company owes Iusti: 200
Specific benefit Iusti: 200
```

At 50%–50%:

```text
Iusti → Emiliano: 100
```

## Case C — Iusti pays personal funds and Emiliano benefits

```text
Expense: 400
Payment source: Iusti personal funds
Beneficiary: Emiliano
```

Journal:

```text
Company Expense    +400
Payable to Iusti   -400
```

Result:

```text
Company owes Iusti: 400
Specific benefit Emiliano: 400
```

At 50%–50%:

```text
Company → Iusti reimbursement: 400
Emiliano → Iusti internal settlement: 200
```

Do not incorrectly reduce the reimbursement to 200.

## Case D — Iusti pays a common expense

```text
Expense: 300
Payment source: Iusti personal funds
Allocation: COMMON
```

Journal:

```text
Company Expense    +300
Payable to Iusti   -300
```

Result:

```text
Company owes Iusti: 300
Settlement impact: 0
```

## Case E — Company pays an Emiliano-specific expense

```text
Expense: 400
Payment source: Company bank
Beneficiary: Emiliano
```

Journal:

```text
Company Expense  +400
Bank             -400
```

At 50%–50%:

```text
Emiliano → Iusti: 200
```

There is no company payable to an associate because company funds were used.

## Case F — Strictly personal use of company funds

```text
Company bank card used for 100 lei non-company personal purchase.
Associate: Emiliano.
```

This must not create an `Expense`.

Operation:

```text
kind = PERSONAL_USE
```

Journal:

```text
Receivable from Emiliano  +100
Bank                      -100
```

Result:

```text
Company expense: 0
Emiliano owes company: 100
```

## Case G — Associate loan to company

```text
Emiliano transfers 10,000 lei to ScooterCity as a loan.
```

Journal:

```text
Bank                                  +10,000
Associate Loan Payable to Emiliano    -10,000
```

Result:

```text
Revenue: 0
Profit: 0
Company debt to Emiliano: 10,000
```

## Case H — Rental income held by Emiliano

```text
Company rental income: 300
Customer pays cash to Emiliano.
```

Journal:

```text
Company Cash Held by Emiliano  +300
Rental Revenue                  -300
```

The money belongs to the company.

## Case I — Cash custody transferred to cash register

```text
Emiliano hands the 300 company cash to the cash register.
```

Journal:

```text
Cash Register                    +300
Company Cash Held by Emiliano    -300
```

Revenue impact:

```text
0
```

## Case J — Associate-pool settlement

Pool income:

```text
Emiliano collects: 300
Iusti collects: 600
```

Iusti pays 100 pool expense from the cash he holds.

Pool balances:

```text
Pool cash held by Emiliano: 300
Pool cash held by Iusti: 500
Total net pool cash: 800
```

At 50%–50%:

```text
Expected each: 400
```

Settlement:

```text
Iusti → Emiliano: 100
```

---

# 12. Income posting rules

## Company rental income

```text
Debit  destination asset account  +amount
Credit Rental Revenue             -amount
```

Destination may be:

- bank;
- cash register;
- company cash held by Emiliano;
- company cash held by Iusti.

## Company scooter-sale income

```text
Debit  destination asset account  +amount
Credit Scooter Sale Revenue       -amount
```

Removing the sold scooter’s accounting book value is outside the initial implementation unless the existing project already tracks depreciation/book value.

## Associate-pool income

For any income explicitly assigned to `ASSOCIATE_POOL`:

```text
Debit  pool cash custody account  +amount
Credit Associate Pool Revenue     -amount
```

---

# 13. Transfer posting rules

Transfers move money between asset accounts in the same finance book.

```text
Debit  destination asset account  +amount
Credit source asset account       -amount
```

Transfers do not affect:

- revenue;
- expense;
- profit;
- associate settlement.

Reject transfers where:

```text
fromAccountId = toAccountId
```

---

# 14. Associate funding rules

An associate loan is not revenue.

```text
Debit  destination asset account       +amount
Credit Associate Loan Payable          -amount
```

The loan-payable account must belong to the funding associate.

---

# 15. Reimbursement rules

## Expense advance repayment

The company or pool repays an associate-funded expense:

```text
Debit  Payable to Associate  +amount
Credit cash/bank account     -amount
```

This does not create another expense.

## Associate loan repayment

```text
Debit  Associate Loan Payable  +amount
Credit cash/bank account       -amount
```

This does not create an expense.

## Associate receivable repayment

The associate returns money owed to the company:

```text
Debit  cash/bank account             +amount
Credit Receivable from Associate     -amount
```

This does not create revenue.

Validate that the reimbursement amount does not exceed the current natural balance of the obligation account unless the operation is explicitly designed as an advance, which is outside v1.

---

# 16. Personal-use rules

`PERSONAL_USE` is rare and separate from `Expense`.

Use it only when company or pool funds paid for something that does not belong to the corresponding book.

Journal:

```text
Debit  Receivable from Associate  +amount
Credit source asset account       -amount
```

No economic allocation is necessary because the associate owes the book the full amount.

---

# 17. Company-benefit settlement

Implement a pure domain calculator:

```ts
interface AssociateShare {
  associateId: string;
  shareBasisPoints: number;
}

interface SpecificBenefit {
  operationId: string;
  associateId: string;
  amountMinor: number;
}

interface SettlementResult {
  associateId: string;
  actualAmountMinor: number;
  expectedAmountMinor: number;
  adjustmentMinor: number;
}
```

For a settlement period:

1. Select `POSTED` company expense operations.
2. Exclude reversed operations.
3. Include only:

   - `OPERATING_EXPENSE`;
   - `NON_OPERATIONAL_COMPANY_EXPENSE`.

4. Exclude:

   - common allocation lines;
   - capital assets;
   - personal-use operations;
   - operations already included in a confirmed settlement.

5. Sum all `ASSOCIATE_SPECIFIC` allocations.
6. Calculate each associate’s expected amount according to ownership share.
7. Calculate:

```text
adjustmentMinor =
expectedAmountMinor - actualAmountMinor
```

Interpretation:

```text
positive → associate must receive
negative → associate must pay
```

The sum of all adjustments must be zero.

Example:

```text
Total specific benefits: 400

Shares:
Emiliano 50%
Iusti 50%

Actual:
Emiliano 400
Iusti 0

Expected:
Emiliano 200
Iusti 200

Adjustments:
Emiliano -200
Iusti +200
```

Generate transfer:

```text
Emiliano → Iusti: 200
```

Use a deterministic rounding strategy so the final adjustment sum is exactly zero.

For more than two associates, generate the minimum practical transfer set by matching debtors to creditors.

Do not net company reimbursements against private associate settlement in the ledger.

The UI may show a consolidated view, but persistence must keep them separate.

---

# 18. Associate-pool settlement

For `ASSOCIATE_POOL_CASH` settlement:

1. Use pool cash-custody account balances.
2. Require outstanding pool `PAYABLE_TO_ASSOCIATE` and `RECEIVABLE_FROM_ASSOCIATE` balances to be zero before confirming final cash distribution.
3. Calculate total pool cash.
4. Calculate expected cash position according to share percentages.
5. Compare each associate’s actual custody balance with the expected amount.
6. Generate transfers from associates holding excess pool cash to associates holding too little.

Example:

```text
Emiliano holds: 300
Iusti holds: 500
Total: 800
Expected each: 400
```

Result:

```text
Emiliano adjustment: +100
Iusti adjustment: -100

Transfer:
Iusti → Emiliano: 100
```

---

# 19. Idempotency

Every financial write must accept:

```http
Idempotency-Key: <uuid>
```

Store it in:

```text
FinancialOperation.idempotencyKey
```

The unique scope is:

```prisma
@@unique([bookId, idempotencyKey])
```

On retry:

- if the operation already exists, return the existing result;
- do not create a duplicate;
- if the same key is reused for a materially different payload, return `409 Conflict`.

The normal `id` identifies the persisted database resource.

The `idempotencyKey` identifies the client command that created it.

---

# 20. Required invariants

Validate these in application code before posting:

```text
amountMinor > 0
```

```text
sum(expense payments) = expense.amountMinor
```

```text
sum(economic allocations) = expense.amountMinor
```

```text
COMMON allocation:
associateId must be null
```

```text
ASSOCIATE_SPECIFIC allocation:
associateId is required
```

```text
BOOK_ACCOUNT payment:
sourceAccountId is required
payerAssociateId must be null
```

```text
ASSOCIATE_PERSONAL_FUNDS payment:
payerAssociateId is required
sourceAccountId must be null
```

```text
All referenced accounts belong to the operation’s FinanceBook
```

```text
Journal posting sum = 0
```

```text
Posted operations are immutable
```

```text
Reversal postings are exact inverses of the original postings
```

```text
The operation kind matches exactly one detail model
```

Examples:

```text
EXPENSE → Expense exists
INCOME → Income exists
TRANSFER → MoneyTransfer exists
ASSOCIATE_FUNDING → AssociateFunding exists
REIMBURSEMENT → Reimbursement exists
PERSONAL_USE → PersonalUse exists
REVERSAL → reversalOfOperationId exists
```

```text
Active share percentages total exactly 10,000 basis points
```

```text
All settlement adjustments total zero
```

---

# 21. PostgreSQL constraints

Add database-level constraints through the generated migration SQL for invariants Prisma cannot express.

At minimum:

```sql
ALTER TABLE "ExpensePayment"
ADD CONSTRAINT "ExpensePayment_valid_source"
CHECK (
  (
    "sourceType" = 'BOOK_ACCOUNT'
    AND "sourceAccountId" IS NOT NULL
    AND "payerAssociateId" IS NULL
  )
  OR
  (
    "sourceType" = 'ASSOCIATE_PERSONAL_FUNDS'
    AND "sourceAccountId" IS NULL
    AND "payerAssociateId" IS NOT NULL
  )
);
```

```sql
ALTER TABLE "EconomicAllocation"
ADD CONSTRAINT "EconomicAllocation_valid_associate"
CHECK (
  (
    "type" = 'COMMON'
    AND "associateId" IS NULL
  )
  OR
  (
    "type" = 'ASSOCIATE_SPECIFIC'
    AND "associateId" IS NOT NULL
  )
);
```

Add positive-amount checks to all models containing `amountMinor`.

Add:

```sql
CHECK ("shareBasisPoints" > 0 AND "shareBasisPoints" <= 10000)
```

Add:

```sql
CHECK ("fromAccountId" <> "toAccountId")
```

for transfers.

Add:

```sql
CHECK ("fromAssociateId" <> "toAssociateId")
```

for settlement transfers.

Application validation must still exist so users receive understandable errors.

Database constraints are the final safety layer.

---

# 22. Posting engine architecture

Do not place accounting decisions in controllers or Prisma repositories.

Create pure posting policies.

Suggested structure:

```text
apps/api/src/modules/finance/
├── finance.module.ts
│
├── domain/
│   ├── money.ts
│   ├── finance.types.ts
│   ├── finance.errors.ts
│   ├── finance-invariants.ts
│   ├── posting-plan.ts
│   ├── journal-validator.ts
│   │
│   ├── policies/
│   │   ├── expense-posting.policy.ts
│   │   ├── income-posting.policy.ts
│   │   ├── transfer-posting.policy.ts
│   │   ├── associate-funding-posting.policy.ts
│   │   ├── reimbursement-posting.policy.ts
│   │   ├── personal-use-posting.policy.ts
│   │   └── reversal-posting.policy.ts
│   │
│   └── settlement/
│       ├── company-benefit-settlement.calculator.ts
│       ├── associate-pool-settlement.calculator.ts
│       └── settlement-transfer.matcher.ts
│
├── application/
│   ├── expenses/
│   │   ├── preview-expense.use-case.ts
│   │   └── create-expense.use-case.ts
│   ├── incomes/
│   ├── transfers/
│   ├── funding/
│   ├── reimbursements/
│   ├── personal-use/
│   ├── settlements/
│   ├── reverse-operation.use-case.ts
│   ├── get-operation.query.ts
│   ├── list-operations.query.ts
│   ├── get-account-balances.query.ts
│   └── get-finance-overview.query.ts
│
├── infrastructure/
│   ├── prisma-finance.repository.ts
│   ├── ledger-account.resolver.ts
│   ├── finance-account.seed.ts
│   └── finance-book.seed.ts
│
└── http/
    ├── controllers/
    └── dto/
```

Do not introduce:

- microservices;
- Kafka;
- event sourcing;
- a generic repository abstraction around every Prisma model;
- `@nestjs/cqrs` unless the project already uses it consistently;
- a giant `FinanceService` containing all domain logic.

Use small application use cases and pure domain policies.

---

# 23. Posting-plan contract

Use a reusable posting-plan structure.

```ts
export interface PostingLine {
  accountId: string;
  signedAmountMinor: number;
  description: string;
}

export interface AssociateAmount {
  associateId: string;
  amountMinor: number;
}

export interface PostingImpactSummary {
  companyExpenseMinor: number;
  companyAssetIncreaseMinor: number;
  companyCashImpactMinor: number;

  associatePayables: AssociateAmount[];
  associateReceivables: AssociateAmount[];

  specificEconomicBenefits: AssociateAmount[];
  commonEconomicBenefitMinor: number;
}

export interface PostingPlan {
  postings: PostingLine[];
  summary: PostingImpactSummary;
}
```

The same posting-policy method must power:

```text
preview endpoint
create/post endpoint
```

Do not implement separate preview arithmetic that can diverge from persisted posting logic.

---

# 24. Prisma transaction boundary

The following must be created atomically:

```text
FinancialOperation
detail record
payments
allocations
documents metadata
JournalEntry
JournalPosting[]
status transition to POSTED
```

Build and validate the posting plan before entering the Prisma transaction.

Keep the transaction short.

Do not perform:

- external HTTP calls;
- file uploads;
- slow parsing;
- document OCR

inside the database transaction.

Pseudo-flow:

```ts
const postingPlan = await postingPolicy.build(command);

journalValidator.assertBalanced(postingPlan.postings);

return prisma.$transaction(async (tx) => {
  // Create operation as DRAFT.
  // Create detail records.
  // Create payment and allocation records.
  // Create journal entry and postings.
  // Mark operation POSTED.
});
```

A failure at any point must roll back everything.

---

# 25. Account resolver

Do not hardcode ledger-account IDs.

Use a resolver:

```ts
export interface LedgerAccountSelector {
  bookId: string;
  role: LedgerAccountRole;
  associateId?: string;
  requireDefault?: boolean;
}
```

Example:

```ts
const payableToIusti = await accountResolver.resolve({
  bookId,
  role: LedgerAccountRole.PAYABLE_TO_ASSOCIATE,
  associateId: iustiId,
});
```

If the query expects exactly one account and finds zero or multiple matches, throw a domain configuration error.

---

# 26. Seed data

Create:

## Finance books

```text
ScooterCity Company
ScooterCity Associate Pool
```

## Current shares

```text
Emiliano: 5,000 basis points
Iusti:    5,000 basis points
```

Resolve the actual users from existing project data. Do not hardcode production user IDs in source code.

## Company accounts

```text
Default Company Bank
Company Cash Register

Company Cash Held by Emiliano
Company Cash Held by Iusti

Payable to Emiliano
Payable to Iusti

Receivable from Emiliano
Receivable from Iusti

Associate Loan Payable to Emiliano
Associate Loan Payable to Iusti

Operating Expenses
Non-operational Company Expenses
Fixed Assets

Rental Revenue
Scooter Sale Revenue
```

## Associate-pool accounts

```text
Pool Cash Held by Emiliano
Pool Cash Held by Iusti

Pool Payable to Emiliano
Pool Payable to Iusti

Pool Receivable from Emiliano
Pool Receivable from Iusti

Associate Pool Expenses
Associate Pool Revenue
```

Use stable account codes.

Example:

```text
COMPANY_BANK_DEFAULT
COMPANY_CASH_REGISTER
COMPANY_CASH_CUSTODY_<associate-id>
COMPANY_PAYABLE_<associate-id>
COMPANY_RECEIVABLE_<associate-id>
COMPANY_LOAN_PAYABLE_<associate-id>
COMPANY_OPERATING_EXPENSE
COMPANY_NON_OPERATIONAL_EXPENSE
COMPANY_FIXED_ASSET
COMPANY_RENTAL_REVENUE
COMPANY_SCOOTER_SALE_REVENUE
```

Create associate-specific accounts automatically when an associate becomes a finance-book member.

---

# 27. API endpoints

Follow existing route and DTO conventions.

Implement the following target API:

```http
GET  /finance/books
GET  /finance/accounts
GET  /finance/accounts/:accountId
GET  /finance/accounts/:accountId/balance

GET  /finance/operations
GET  /finance/operations/:operationId
POST /finance/operations/:operationId/reverse
```

Expenses:

```http
POST /finance/expenses/preview
POST /finance/expenses
```

Income:

```http
POST /finance/incomes/preview
POST /finance/incomes
```

Transfers:

```http
POST /finance/transfers/preview
POST /finance/transfers
```

Associate funding:

```http
POST /finance/associate-fundings/preview
POST /finance/associate-fundings
```

Reimbursements:

```http
POST /finance/reimbursements/preview
POST /finance/reimbursements
```

Personal use:

```http
POST /finance/personal-uses/preview
POST /finance/personal-uses
```

Settlements:

```http
POST /finance/settlements/preview
POST /finance/settlements
GET  /finance/settlements/:settlementRunId
POST /finance/settlements/:settlementRunId/confirm
POST /finance/settlements/:settlementRunId/transfers/:transferId/complete
POST /finance/settlements/:settlementRunId/cancel
```

Configuration:

```http
GET  /finance/expense-categories
POST /finance/expense-categories

GET  /finance/cost-objects
POST /finance/cost-objects
PATCH /finance/cost-objects/:costObjectId
```

All write endpoints require an idempotency key where applicable.

---

# 28. Expense DTO

Use discriminated unions internally.

Conceptual contract:

```ts
export type ExpensePaymentInput =
  | {
      sourceType: "BOOK_ACCOUNT";
      sourceAccountId: string;
      payerAssociateId?: never;
      paymentMethod: PaymentMethod;
      amountMinor: number;
    }
  | {
      sourceType: "ASSOCIATE_PERSONAL_FUNDS";
      sourceAccountId?: never;
      payerAssociateId: string;
      paymentMethod: PaymentMethod;
      amountMinor: number;
    };

export type EconomicAllocationInput =
  | {
      type: "COMMON";
      associateId?: never;
      amountMinor: number;
    }
  | {
      type: "ASSOCIATE_SPECIFIC";
      associateId: string;
      amountMinor: number;
    };

export interface CreateExpenseInput {
  bookId: string;
  occurredAt: string;
  description?: string;

  amountMinor: number;
  treatment: ExpenseTreatment;
  categoryId: string;
  costObjectId?: string;

  payments: ExpensePaymentInput[];
  allocations: EconomicAllocationInput[];

  documents?: Array<{
    type: FinancialDocumentType;
    documentNumber?: string;
    issuedAt?: string;
    supplierName?: string;
    supplierTaxId?: string;
    storageKey?: string;
    notes?: string;
  }>;
}
```

Example:

```json
{
  "bookId": "company-book-id",
  "occurredAt": "2026-08-14T10:00:00.000Z",
  "description": "Fuel for Iusti personal car",
  "amountMinor": 20000,
  "treatment": "NON_OPERATIONAL_COMPANY_EXPENSE",
  "categoryId": "fuel-category-id",
  "costObjectId": "iusti-personal-car-id",
  "payments": [
    {
      "sourceType": "ASSOCIATE_PERSONAL_FUNDS",
      "payerAssociateId": "user_iusti",
      "paymentMethod": "CASH",
      "amountMinor": 20000
    }
  ],
  "allocations": [
    {
      "type": "ASSOCIATE_SPECIFIC",
      "associateId": "user_iusti",
      "amountMinor": 20000
    }
  ],
  "documents": [
    {
      "type": "RECEIPT",
      "issuedAt": "2026-08-14T09:55:00.000Z",
      "supplierName": "Fuel Station"
    }
  ]
}
```

Expected preview:

```json
{
  "postings": [
    {
      "accountRole": "NON_OPERATIONAL_COMPANY_EXPENSE",
      "signedAmountMinor": 20000
    },
    {
      "accountRole": "PAYABLE_TO_ASSOCIATE",
      "associateId": "user_iusti",
      "signedAmountMinor": -20000
    }
  ],
  "summary": {
    "companyExpenseMinor": 20000,
    "companyCashImpactMinor": 0,
    "associatePayables": [
      {
        "associateId": "user_iusti",
        "amountMinor": 20000
      }
    ],
    "specificEconomicBenefits": [
      {
        "associateId": "user_iusti",
        "amountMinor": 20000
      }
    ]
  }
}
```

---

# 29. Next.js requirements

NestJS remains the source of truth.

Suggested routes:

```text
app/finance/
├── page.tsx
├── operations/
│   ├── page.tsx
│   └── [operationId]/
│       └── page.tsx
├── expenses/
│   ├── page.tsx
│   └── new/
│       └── page.tsx
├── incomes/
├── transfers/
├── reimbursements/
├── accounts/
├── cost-objects/
└── settlements/
```

Suggested components:

```text
ExpenseForm
ExpensePaymentFields
EconomicAllocationFields
CostObjectSelector
FinancialDocumentFields
FinancialImpactPreview
FinancialOperationDetails
JournalEntryView
AccountBalanceCard
SettlementPreview
SettlementTransferList
```

Expense-form workflow:

1. Select finance book.
2. Enter amount and date.
3. Select expense treatment.
4. Select category.
5. Select cost object.
6. Add one or more payment lines.
7. Add one or more economic-allocation lines.
8. Add optional document metadata.
9. Request backend preview.
10. Show financial impact.
11. Confirm and post.

When a cost object has default allocation settings:

- prefill the UI;
- allow the user to change the allocation;
- persist the final explicit allocation.

The impact preview must clearly show:

```text
Expense impact
Cash impact
Company payable to each associate
Company receivable from each associate
Specific-benefit allocation
Common-benefit allocation
Journal posting lines
```

Do not show debit/credit terminology as the primary user-facing language. It may be available in an advanced details panel.

Use the project’s existing form and API libraries. Do not add a new state-management or form library without a concrete need.

---

# 30. Tests

## Pure unit tests

Create unit tests for every posting policy.

At minimum:

```text
ExpensePostingPolicy
IncomePostingPolicy
TransferPostingPolicy
AssociateFundingPostingPolicy
ReimbursementPostingPolicy
PersonalUsePostingPolicy
ReversalPostingPolicy
CompanyBenefitSettlementCalculator
AssociatePoolSettlementCalculator
SettlementTransferMatcher
JournalValidator
```

## Integration tests

Use a real PostgreSQL test database for:

- Prisma transaction atomicity;
- idempotency;
- database constraints;
- account-role resolution;
- immutable posted operations;
- reversal;
- balance calculations;
- settlement persistence.

Do not mock Prisma for the tests whose purpose is to verify database behavior.

## Mandatory financial scenarios

Test all scenarios in section 11.

For every test, verify independently:

```text
domain record
payment records
economic allocations
journal postings
journal balance
company cash impact
company payable
company receivable
specific-benefit position
settlement result
```

---

# 31. First implementation phase

Do not attempt to implement the entire target module in one uncontrolled change.

Complete this first vertical slice:

## Backend foundation

- enums;
- Prisma models needed for:

  - `FinanceBook`;
  - `FinanceBookMember`;
  - `LedgerAccount`;
  - `FinancialOperation`;
  - `ExpenseCategory`;
  - `CostObject`;
  - `Expense`;
  - `ExpensePayment`;
  - `EconomicAllocation`;
  - `FinancialDocument`;
  - `JournalEntry`;
  - `JournalPosting`;

- migration constraints;
- finance-book and ledger-account seed;
- account resolver;
- money utilities;
- journal validator;
- expense posting policy;
- company-benefit settlement calculator.

## API

Implement:

```http
POST /finance/expenses/preview
POST /finance/expenses
GET  /finance/operations/:operationId
GET  /finance/accounts
GET  /finance/accounts/:accountId/balance
POST /finance/operations/:operationId/reverse
POST /finance/settlements/preview
```

`POST /finance/settlements/preview` only needs to support:

```text
COMPANY_SPECIFIC_BENEFIT
```

Persistence of settlement runs may be completed in a later phase.

## Frontend

Implement:

- expense list;
- create-expense form;
- payment-source selection;
- economic-allocation selection;
- cost-object selection;
- backend impact preview;
- operation detail page with journal postings;
- basic account-balance overview;
- company-specific-benefit settlement preview.

## Tests

The first phase is not complete until all mandatory expense scenarios pass.

---

# 32. Later phases

After the first vertical slice is stable:

## Phase 2

- income;
- cash custody;
- transfers;
- associate funding;
- reimbursements;
- personal use.

## Phase 3

- persisted settlement runs;
- settlement transfer completion;
- associate-pool operations;
- associate-pool cash settlement.

## Phase 4

- reporting;
- exports;
- period locking;
- historical snapshots;
- additional revenue and asset-disposal logic.

---

# 33. Code-quality requirements

- TypeScript strict mode.
- No `any`.
- Use discriminated unions for mutually exclusive inputs.
- Add JSDoc to public domain services and non-obvious settlement formulas.
- Keep financial calculations in pure functions where possible.
- Controllers must remain thin.
- Use domain-specific error classes.
- Do not duplicate posting logic between preview and create.
- Do not hardcode account IDs.
- Do not calculate money with JavaScript floating-point values.
- Do not mutate posted financial records.
- Do not silently correct invalid financial inputs.
- Return explicit validation errors.
- Use authorization so only permitted ScooterCity users can view or create financial operations.
- Preserve existing project conventions unless they conflict with the financial invariants in this specification.

---

# 34. Required delivery summary

After implementation, report:

1. Files added and modified.
2. Prisma models and migrations created.
3. Seed behavior.
4. API endpoints implemented.
5. UI routes and components implemented.
6. Test cases added.
7. Commands run.
8. Any assumptions made after inspecting the existing repository.
9. Anything intentionally deferred to a later phase.

Do not claim completion if migrations, compilation, or tests fail.

The financial behavior in this specification is the source of truth. Do not simplify the payer, beneficiary, reimbursement, and settlement concepts into one balance or one generic transaction field.
