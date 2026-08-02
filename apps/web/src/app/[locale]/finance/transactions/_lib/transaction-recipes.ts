import { v1 } from "@repo/api-shared";

export type BalanceDirection = "POSITIVE" | "NEGATIVE";

export type TransactionFormField =
  | "amount"
  | "billingStatus"
  | "categoryId"
  | "counterpartyId"
  | "currency"
  | "description"
  | "occurredAt"
  | "paymentMethod"
  | "primaryWalletId"
  | "reference"
  | "secondaryWalletId";

export type TransactionFormErrors = Partial<
  Record<TransactionFormField, string>
>;

export interface TransactionFormState {
  type: v1.finance.CreatableMoneyTransactionType;
  amount: string;
  currency: string;
  financialScope: "COMPANY" | "ADMIN_PERSONAL";
  paymentMethod: v1.finance.PaymentMethod;
  billingStatus: v1.finance.BillingStatus;
  categoryId: string;
  counterpartyId: string;
  primaryWalletId: string;
  secondaryWalletId: string;
  bucket: v1.finance.WalletBalanceBucket;
  direction: BalanceDirection;
  occurredAt: string;
  description: string;
  postImmediately: boolean;
  referenceType: string;
  referenceId: string;
}

export interface TransactionPrefill {
  type?: v1.finance.CreatableMoneyTransactionType;
  amount?: string;
  currency?: string;
  debtorUserId?: string;
  creditorUserId?: string;
}

export type WalletRole =
  | "ADMIN_PERSONAL"
  | "BUSINESS_FUNDS"
  | "COMPANY_GUARANTEE"
  | "USER_SETTLEMENT";

export interface WalletFieldRecipe {
  primaryRole: WalletRole;
  secondaryRole: WalletRole | null;
  primaryLabel:
    | "companyWallet"
    | "customerWallet"
    | "debtorWallet"
    | "destinationWallet"
    | "recipientWallet"
    | "sourceWallet"
    | "wallet";
  secondaryLabel:
    | "companyWallet"
    | "creditorWallet"
    | "destinationWallet"
    | "recipientWallet"
    | null;
}

interface BuildOptions {
  idempotencyKey: string;
  wallets: readonly v1.finance.WalletOption[];
  requiredMessage(
    field:
      | "amount"
      | "category"
      | "counterparty"
      | "description"
      | "occurredAt"
      | "wallet",
  ): string;
  differentWalletsMessage: string;
  differentPeopleMessage: string;
  referencePairMessage: string;
}

export interface TransactionInputCandidate {
  input?: v1.finance.CreateMoneyTransactionInput;
  errors: TransactionFormErrors;
}

export function createTransactionFormState(
  wallets: readonly v1.finance.WalletOption[],
  prefill: TransactionPrefill = {},
): TransactionFormState {
  const type = prefill.type ?? "INCOME";
  const primaryWalletId =
    type === "PERSONAL_FUNDS_SPLIT"
      ? walletIdForOwner(wallets, prefill.debtorUserId)
      : "";
  const secondaryWalletId =
    type === "PERSONAL_FUNDS_SPLIT"
      ? walletIdForOwner(wallets, prefill.creditorUserId)
      : "";

  return {
    type,
    amount: prefill.amount ?? "",
    currency: prefill.currency ?? "RON",
    financialScope:
      type === "PERSONAL_FUNDS_SPLIT" ? "ADMIN_PERSONAL" : "COMPANY",
    paymentMethod: "CASH",
    billingStatus: type === "USER_CHARGE" ? "BILLED" : "NOT_APPLICABLE",
    categoryId: "",
    counterpartyId: "",
    primaryWalletId,
    secondaryWalletId,
    bucket: "BUSINESS_FUNDS",
    direction: "POSITIVE",
    occurredAt: "",
    description: "",
    postImmediately: true,
    referenceType: "",
    referenceId: "",
  };
}

export function walletFieldRecipe(
  form: Pick<TransactionFormState, "bucket" | "financialScope" | "type">,
): WalletFieldRecipe {
  switch (form.type) {
    case "INCOME":
      return {
        primaryRole:
          form.financialScope === "ADMIN_PERSONAL"
            ? "ADMIN_PERSONAL"
            : "BUSINESS_FUNDS",
        secondaryRole: null,
        primaryLabel: "destinationWallet",
        secondaryLabel: null,
      };
    case "EXPENSE":
      return {
        primaryRole:
          form.financialScope === "ADMIN_PERSONAL"
            ? "ADMIN_PERSONAL"
            : "BUSINESS_FUNDS",
        secondaryRole: null,
        primaryLabel: "sourceWallet",
        secondaryLabel: null,
      };
    case "TRANSFER":
      return {
        primaryRole: walletRoleForBucket(form.bucket),
        secondaryRole: walletRoleForBucket(form.bucket),
        primaryLabel: "sourceWallet",
        secondaryLabel: "destinationWallet",
      };
    case "USER_CHARGE":
      return {
        primaryRole: "USER_SETTLEMENT",
        secondaryRole: null,
        primaryLabel: "customerWallet",
        secondaryLabel: null,
      };
    case "USER_PAYMENT":
    case "REFUND":
      return {
        primaryRole: "USER_SETTLEMENT",
        secondaryRole: "BUSINESS_FUNDS",
        primaryLabel: "customerWallet",
        secondaryLabel: "companyWallet",
      };
    case "GUARANTEE_RECEIVED":
    case "GUARANTEE_REFUNDED":
      return {
        primaryRole: "USER_SETTLEMENT",
        secondaryRole: "COMPANY_GUARANTEE",
        primaryLabel: "customerWallet",
        secondaryLabel: "companyWallet",
      };
    case "REIMBURSEMENT":
      return {
        primaryRole: "BUSINESS_FUNDS",
        secondaryRole: "ADMIN_PERSONAL",
        primaryLabel: "sourceWallet",
        secondaryLabel: "recipientWallet",
      };
    case "PERSONAL_EXTRACTION":
      return {
        primaryRole: "ADMIN_PERSONAL",
        secondaryRole: "USER_SETTLEMENT",
        primaryLabel: "sourceWallet",
        secondaryLabel: "recipientWallet",
      };
    case "PERSONAL_FUNDS_SPLIT":
      return {
        primaryRole: "ADMIN_PERSONAL",
        secondaryRole: "ADMIN_PERSONAL",
        primaryLabel: "debtorWallet",
        secondaryLabel: "creditorWallet",
      };
    case "COMPANY_DISTRIBUTION":
      return {
        primaryRole: "BUSINESS_FUNDS",
        secondaryRole: "USER_SETTLEMENT",
        primaryLabel: "sourceWallet",
        secondaryLabel: "recipientWallet",
      };
    case "ADJUSTMENT":
      return {
        primaryRole: walletRoleForBucket(form.bucket),
        secondaryRole: null,
        primaryLabel: "wallet",
        secondaryLabel: null,
      };
  }
}

export function walletMatchesRole(
  wallet: v1.finance.WalletOption,
  role: WalletRole,
  adminWalletIds: ReadonlySet<string>,
): boolean {
  switch (role) {
    case "ADMIN_PERSONAL":
      return wallet.type === "USER" && adminWalletIds.has(wallet.id);
    case "BUSINESS_FUNDS":
      return (
        (wallet.type !== "USER" && wallet.type !== "PAYMENT_PROCESSOR") ||
        adminWalletIds.has(wallet.id)
      );
    case "COMPANY_GUARANTEE":
      return wallet.type !== "USER" && wallet.type !== "PAYMENT_PROCESSOR";
    case "USER_SETTLEMENT":
      return wallet.type === "USER";
  }
}

export function preferredTransactionWalletId(
  form: Pick<TransactionFormState, "financialScope" | "paymentMethod" | "type">,
  wallets: readonly v1.finance.WalletOption[],
  adminWalletIds: ReadonlySet<string>,
): string {
  if (form.paymentMethod === "CASH") {
    return (
      wallets.find(
        (wallet) => wallet.type === "USER" && adminWalletIds.has(wallet.id),
      )?.id ?? ""
    );
  }

  if (
    form.type === "EXPENSE" &&
    form.financialScope === "COMPANY" &&
    form.paymentMethod === "POS"
  ) {
    return wallets.find((wallet) => wallet.type === "COMPANY_BANK")?.id ?? "";
  }

  return "";
}

export function buildTransactionInput(
  form: TransactionFormState,
  options: BuildOptions,
): TransactionInputCandidate {
  const errors: TransactionFormErrors = {};
  const primaryWallet = options.wallets.find(
    (wallet) => wallet.id === form.primaryWalletId,
  );
  const secondaryWallet = options.wallets.find(
    (wallet) => wallet.id === form.secondaryWalletId,
  );

  if (!form.amount.trim()) errors.amount = options.requiredMessage("amount");
  if (form.type === "INCOME" && !form.counterpartyId) {
    errors.counterpartyId = options.requiredMessage("counterparty");
  }
  if (form.type === "EXPENSE" && !form.categoryId) {
    errors.categoryId = options.requiredMessage("category");
  }
  if (
    form.type === "EXPENSE" &&
    !form.counterpartyId &&
    !form.description.trim()
  ) {
    errors.description = options.requiredMessage("description");
  }
  if (!primaryWallet) {
    errors.primaryWalletId = options.requiredMessage("wallet");
  }

  const recipe = walletFieldRecipe(form);
  if (recipe.secondaryRole && !secondaryWallet) {
    errors.secondaryWalletId = options.requiredMessage("wallet");
  }
  if (
    form.type === "TRANSFER" &&
    primaryWallet &&
    secondaryWallet &&
    primaryWallet.id === secondaryWallet.id
  ) {
    errors.secondaryWalletId = options.differentWalletsMessage;
  }
  if (
    form.type === "PERSONAL_FUNDS_SPLIT" &&
    primaryWallet?.owner?.id &&
    primaryWallet.owner.id === secondaryWallet?.owner?.id
  ) {
    errors.secondaryWalletId = options.differentPeopleMessage;
  }
  if (Boolean(form.referenceType.trim()) !== Boolean(form.referenceId.trim())) {
    errors.reference = options.referencePairMessage;
  }

  let occurredAt: string | undefined;
  if (form.occurredAt) {
    const parsed = new Date(form.occurredAt);
    if (Number.isNaN(parsed.getTime())) {
      errors.occurredAt = options.requiredMessage("occurredAt");
    } else {
      occurredAt = parsed.toISOString();
    }
  }

  if (Object.keys(errors).length > 0 || !primaryWallet) {
    return { errors };
  }

  const amount = form.amount.trim();
  const positive = amount;
  const negative = `-${amount}`;
  const common = {
    type: form.type,
    amount,
    currency: form.currency,
    occurredAt,
    description: form.description.trim() || null,
    idempotencyKey: options.idempotencyKey,
    postImmediately: form.postImmediately,
    references:
      form.referenceType.trim() && form.referenceId.trim()
        ? [
            {
              referenceType: form.referenceType,
              referenceId: form.referenceId,
              isPrimary: true,
            },
          ]
        : [],
  };
  let candidate: unknown;

  switch (form.type) {
    case "INCOME": {
      const personal = form.financialScope === "ADMIN_PERSONAL";
      candidate = {
        ...common,
        financialScope: form.financialScope,
        paymentMethod: personal ? "CASH" : form.paymentMethod,
        billingStatus: personal ? "NOT_BILLED" : form.billingStatus,
        categoryId: form.categoryId || null,
        counterpartyId: form.counterpartyId || null,
        balanceChanges: [
          change(
            primaryWallet.id,
            personal ? "ADMIN_PERSONAL_FUNDS" : "BUSINESS_FUNDS",
            form.currency,
            positive,
          ),
        ],
      };
      break;
    }
    case "EXPENSE": {
      const personal = form.financialScope === "ADMIN_PERSONAL";
      candidate = {
        ...common,
        financialScope: form.financialScope,
        paymentMethod: form.paymentMethod,
        billingStatus: form.billingStatus,
        categoryId: form.categoryId,
        counterpartyId: form.counterpartyId || null,
        balanceChanges: [
          change(
            primaryWallet.id,
            personal ? "ADMIN_PERSONAL_FUNDS" : "BUSINESS_FUNDS",
            form.currency,
            negative,
          ),
        ],
      };
      break;
    }
    case "TRANSFER":
      candidate = {
        ...common,
        financialScope: scopeForBucket(form.bucket),
        paymentMethod: null,
        billingStatus: "NOT_APPLICABLE",
        balanceChanges: [
          change(primaryWallet.id, form.bucket, form.currency, negative),
          change(secondaryWallet!.id, form.bucket, form.currency, positive),
        ],
      };
      break;
    case "USER_CHARGE":
      candidate = {
        ...common,
        financialScope: "COMPANY",
        paymentMethod: null,
        billingStatus: "BILLED",
        categoryId: form.categoryId || null,
        counterpartyUserId: ownerId(primaryWallet),
        balanceChanges: [
          change(primaryWallet.id, "USER_SETTLEMENT", form.currency, negative),
        ],
      };
      break;
    case "USER_PAYMENT":
      candidate = customerCashMovement(
        common,
        form,
        primaryWallet,
        secondaryWallet!,
        positive,
      );
      break;
    case "GUARANTEE_RECEIVED":
      candidate = guaranteeMovement(
        common,
        form,
        primaryWallet,
        secondaryWallet!,
        positive,
      );
      break;
    case "GUARANTEE_REFUNDED":
      candidate = guaranteeMovement(
        common,
        form,
        primaryWallet,
        secondaryWallet!,
        negative,
      );
      break;
    case "REIMBURSEMENT":
      candidate = {
        ...common,
        financialScope: "COMPANY",
        paymentMethod: form.paymentMethod,
        billingStatus: "NOT_APPLICABLE",
        recipientUserId: ownerId(secondaryWallet!),
        balanceChanges: [
          change(primaryWallet.id, "BUSINESS_FUNDS", form.currency, negative),
          change(
            secondaryWallet!.id,
            "ADMIN_PERSONAL_FUNDS",
            form.currency,
            positive,
          ),
        ],
      };
      break;
    case "PERSONAL_EXTRACTION":
      candidate = {
        ...common,
        financialScope: "ADMIN_PERSONAL",
        paymentMethod: form.paymentMethod,
        billingStatus: "NOT_APPLICABLE",
        recipientUserId: ownerId(secondaryWallet!),
        balanceChanges: [
          change(
            primaryWallet.id,
            "ADMIN_PERSONAL_FUNDS",
            form.currency,
            negative,
          ),
        ],
      };
      break;
    case "PERSONAL_FUNDS_SPLIT":
      candidate = {
        ...common,
        financialScope: "ADMIN_PERSONAL",
        paymentMethod: "CASH",
        billingStatus: "NOT_APPLICABLE",
        debtorUserId: ownerId(primaryWallet),
        creditorUserId: ownerId(secondaryWallet!),
        balanceChanges: [
          change(
            primaryWallet.id,
            "ADMIN_PERSONAL_FUNDS",
            form.currency,
            negative,
          ),
          change(
            secondaryWallet!.id,
            "ADMIN_PERSONAL_FUNDS",
            form.currency,
            positive,
          ),
        ],
      };
      break;
    case "COMPANY_DISTRIBUTION":
      candidate = {
        ...common,
        financialScope: "COMPANY",
        paymentMethod: form.paymentMethod,
        billingStatus: "NOT_APPLICABLE",
        recipientUserId: ownerId(secondaryWallet!),
        balanceChanges: [
          change(primaryWallet.id, "BUSINESS_FUNDS", form.currency, negative),
        ],
      };
      break;
    case "REFUND":
      candidate = customerCashMovement(
        common,
        form,
        primaryWallet,
        secondaryWallet!,
        negative,
      );
      break;
    case "ADJUSTMENT":
      candidate = {
        ...common,
        financialScope: scopeForBucket(form.bucket),
        paymentMethod: null,
        billingStatus: "NOT_APPLICABLE",
        balanceChanges: [
          change(
            primaryWallet.id,
            form.bucket,
            form.currency,
            form.direction === "POSITIVE" ? positive : negative,
          ),
        ],
      };
      break;
  }

  const parsed =
    v1.finance.createMoneyTransactionInputSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = fieldForIssue(issue.path[0]);
      if (field && !errors[field]) errors[field] = issue.message;
    }
    return { errors };
  }

  return { input: parsed.data, errors };
}

export function scopeForBucket(
  bucket: v1.finance.WalletBalanceBucket,
): v1.finance.MoneyTransactionScope {
  if (bucket === "ADMIN_PERSONAL_FUNDS") return "ADMIN_PERSONAL";
  if (bucket === "CUSTOMER_GUARANTEE_FUNDS") return "CUSTOMER_HELD";
  return "COMPANY";
}

function walletRoleForBucket(
  bucket: v1.finance.WalletBalanceBucket,
): WalletRole {
  switch (bucket) {
    case "ADMIN_PERSONAL_FUNDS":
      return "ADMIN_PERSONAL";
    case "BUSINESS_FUNDS":
      return "BUSINESS_FUNDS";
    case "CUSTOMER_GUARANTEE_FUNDS":
      return "COMPANY_GUARANTEE";
    case "USER_SETTLEMENT":
      return "USER_SETTLEMENT";
  }
}

function change(
  walletId: string,
  bucket: v1.finance.WalletBalanceBucket,
  currency: string,
  amountDelta: string,
): v1.finance.WalletBalanceChangeInput {
  return { walletId, bucket, currency, amountDelta };
}

function ownerId(wallet: v1.finance.WalletOption): string {
  return wallet.owner?.id ?? "";
}

function customerCashMovement(
  common: object,
  form: TransactionFormState,
  customerWallet: v1.finance.WalletOption,
  companyWallet: v1.finance.WalletOption,
  amountDelta: string,
): unknown {
  return {
    ...common,
    financialScope: "COMPANY",
    paymentMethod: form.paymentMethod,
    billingStatus: "NOT_APPLICABLE",
    counterpartyUserId: ownerId(customerWallet),
    balanceChanges: [
      change(customerWallet.id, "USER_SETTLEMENT", form.currency, amountDelta),
      change(companyWallet.id, "BUSINESS_FUNDS", form.currency, amountDelta),
    ],
  };
}

function guaranteeMovement(
  common: object,
  form: TransactionFormState,
  customerWallet: v1.finance.WalletOption,
  companyWallet: v1.finance.WalletOption,
  amountDelta: string,
): unknown {
  return {
    ...common,
    financialScope: "CUSTOMER_HELD",
    paymentMethod: form.paymentMethod,
    billingStatus: "NOT_APPLICABLE",
    counterpartyUserId: ownerId(customerWallet),
    balanceChanges: [
      change(customerWallet.id, "USER_SETTLEMENT", form.currency, amountDelta),
      change(
        companyWallet.id,
        "CUSTOMER_GUARANTEE_FUNDS",
        form.currency,
        amountDelta,
      ),
    ],
  };
}

function walletIdForOwner(
  wallets: readonly v1.finance.WalletOption[],
  ownerUserId: string | undefined,
): string {
  if (!ownerUserId) return "";
  return wallets.find((wallet) => wallet.owner?.id === ownerUserId)?.id ?? "";
}

function fieldForIssue(
  firstPathSegment: PropertyKey | undefined,
): TransactionFormField | null {
  switch (firstPathSegment) {
    case "amount":
      return "amount";
    case "billingStatus":
      return "billingStatus";
    case "categoryId":
      return "categoryId";
    case "counterpartyId":
      return "counterpartyId";
    case "currency":
      return "currency";
    case "description":
      return "description";
    case "occurredAt":
      return "occurredAt";
    case "paymentMethod":
      return "paymentMethod";
    case "references":
      return "reference";
    case "balanceChanges":
      return "primaryWalletId";
    default:
      return null;
  }
}
