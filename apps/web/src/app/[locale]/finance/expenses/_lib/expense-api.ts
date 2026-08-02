"use client";

import { v1 } from "@repo/api-shared";

import { webApi } from "@/lib/api";
import type {
  CompactExpenseCreatePayload,
  ExpenseEvidenceReference,
} from "./expense-form";

export const EXPENSE_EVIDENCE_MAX_BYTES = 10 * 1_024 * 1_024;
export const EXPENSE_EVIDENCE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;

export type ExpenseEvidenceContentType =
  (typeof EXPENSE_EVIDENCE_CONTENT_TYPES)[number];

export interface SelectedExpenseEvidence extends ExpenseEvidenceReference {
  file: File;
}

export interface BusinessSetupInput {
  company:
    | { mode: "EXISTING"; companyId: string }
    | {
        mode: "NEW";
        legalName: string;
        legalForm: v1.finance.CompanyLegalForm;
        taxIdentifier: string;
      };
  defaultCurrency: string;
  bankAccounts: Array<{ name: string; cardHolderUserId: string }>;
  ownerUserIds: string[];
  ownerEffectiveFrom: string;
  vat:
    | { registered: false }
    | {
        registered: true;
        countryCode: string;
        vatNumber: string;
        effectiveFrom: string;
      };
}

export type ExpenseCompletionStage = "EVIDENCE_UPLOAD" | "POSTING";

export class ExpenseCompletionPendingError extends Error {
  readonly expenseId: string;
  readonly stage: ExpenseCompletionStage;

  constructor(
    expenseId: string,
    stage: ExpenseCompletionStage,
    cause: unknown,
  ) {
    super(
      cause instanceof Error
        ? cause.message
        : "The expense draft could not be completed.",
    );
    this.name = "ExpenseCompletionPendingError";
    this.expenseId = expenseId;
    this.stage = stage;
  }
}

export type BusinessSetupRecoveryScope = "OWNERS" | "VAT";

export class BusinessSetupPartialError extends Error {
  readonly entityId: string;
  readonly recoveryScopes: BusinessSetupRecoveryScope[];

  constructor(entityId: string, recoveryScopes: BusinessSetupRecoveryScope[]) {
    super("The operating company was created, but setup is incomplete.");
    this.name = "BusinessSetupPartialError";
    this.entityId = entityId;
    this.recoveryScopes = recoveryScopes;
  }
}

export async function searchExpenseCounterparties(
  search: string,
  signal?: AbortSignal,
): Promise<v1.finance.FinancialCounterpartySearchResult> {
  const params = new URLSearchParams({
    search,
    transactionType: "EXPENSE",
    pageSize: "20",
  });

  return webApi.fetch(
    `${v1.finance.ROUTES.counterparties.search}?${params}`,
    v1.finance.financialCounterpartySearchResultSchema,
    { cache: "no-store", signal },
  );
}

export async function searchExpenseScooters(
  search: string,
  signal?: AbortSignal,
): Promise<v1.scooters.ScooterList> {
  const params = new URLSearchParams({
    page: "1",
    pageSize: "20",
    ...(search ? { search } : {}),
  });
  return webApi.fetch(
    `${v1.scooters.ROUTES.list}?${params}`,
    v1.scooters.scooterListSchema,
    { cache: "no-store", signal },
  );
}

export async function searchBusinessUsers(
  search: string,
  options: { cursor?: string; signal?: AbortSignal } = {},
): Promise<v1.finance.ExpenseUserOptionList> {
  const params = new URLSearchParams({
    purpose: "BUSINESS_OWNER",
    pageSize: "20",
    ...(search ? { search } : {}),
    ...(options.cursor ? { cursor: options.cursor } : {}),
  });
  return webApi.fetch(
    `${v1.finance.EXPENSE_ROUTES.options.users}?${params}`,
    v1.finance.expenseUserOptionListSchema,
    { cache: "no-store", signal: options.signal },
  );
}

export async function recordExpense(
  payload: CompactExpenseCreatePayload,
  evidence: {
    fiscal: SelectedExpenseEvidence | null;
    pos: SelectedExpenseEvidence | null;
  },
): Promise<v1.finance.Expense> {
  const hasEvidence = Boolean(evidence.fiscal || evidence.pos);
  const createInput = v1.finance.createExpenseInputSchema.parse({
    ...payload,
    postImmediately: !hasEvidence,
  });
  const expense = await webApi.fetch(
    v1.finance.EXPENSE_ROUTES.create,
    v1.finance.expenseSchema,
    { method: "POST", json: createInput },
  );

  if (!hasEvidence) return expense;

  const uploads = [
    ...(evidence.fiscal
      ? [
          uploadEvidenceForDocumentType(
            expense,
            ["FISCAL_RECEIPT", "INVOICE"],
            evidence.fiscal,
          ),
        ]
      : []),
    ...(evidence.pos
      ? [uploadEvidenceForDocumentType(expense, ["POS_RECEIPT"], evidence.pos)]
      : []),
  ];
  const uploadResults = await Promise.allSettled(uploads);
  const failedUpload = uploadResults.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failedUpload) {
    throw new ExpenseCompletionPendingError(
      expense.id,
      "EVIDENCE_UPLOAD",
      failedUpload.reason,
    );
  }

  try {
    return await webApi.fetch(
      v1.finance.EXPENSE_ROUTES.post(expense.id),
      v1.finance.expenseSchema,
      {
        method: "POST",
        json: v1.finance.expenseActionInputSchema.parse({
          idempotencyKey: `${payload.idempotencyKey}:post`,
        }),
      },
    );
  } catch (error) {
    throw new ExpenseCompletionPendingError(expense.id, "POSTING", error);
  }
}

export async function prepareExpenseEvidence(
  file: File,
): Promise<SelectedExpenseEvidence> {
  if (
    !EXPENSE_EVIDENCE_CONTENT_TYPES.includes(
      file.type as ExpenseEvidenceContentType,
    )
  ) {
    throw new Error("UNSUPPORTED_TYPE");
  }
  if (file.size > EXPENSE_EVIDENCE_MAX_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }

  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const mediaMetadata =
    file.type === "application/pdf"
      ? { pageCount: countPdfPages(bytes) }
      : await imageDimensions(file);

  return {
    file,
    fileName: file.name,
    contentType: file.type,
    byteSize: file.size,
    sha256,
    ...mediaMetadata,
  };
}

export async function createBusinessSetup(
  input: BusinessSetupInput,
): Promise<v1.finance.BusinessLegalEntity> {
  const entityInput = v1.finance.createBusinessLegalEntityInputSchema.parse({
    ...(input.company.mode === "EXISTING"
      ? { companyId: input.company.companyId }
      : {
          company: {
            legalName: input.company.legalName,
            legalForm: input.company.legalForm,
            ...(input.company.taxIdentifier.trim()
              ? { taxIdentifier: input.company.taxIdentifier }
              : {}),
          },
        }),
    defaultCurrency: input.defaultCurrency,
    walletIds: [],
    bankAccounts: input.bankAccounts,
  });
  const entity = await webApi.fetch(
    v1.finance.EXPENSE_ROUTES.legalEntities.create,
    v1.finance.businessLegalEntitySchema,
    { method: "POST", json: entityInput },
  );

  const followUps: Array<{
    promise: Promise<unknown>;
    scope: BusinessSetupRecoveryScope;
  }> = input.ownerUserIds.map((userId) => ({
    scope: "OWNERS",
    promise: startBusinessOwner(entity.id, {
      userId,
      effectiveFrom: input.ownerEffectiveFrom,
    }),
  }));

  if (input.vat.registered) {
    followUps.push({
      scope: "VAT",
      promise: startVatRegistration(entity.id, {
        countryCode: input.vat.countryCode,
        vatNumber: input.vat.vatNumber,
        effectiveFrom: input.vat.effectiveFrom,
      }),
    });
  }

  const results = await Promise.allSettled(
    followUps.map((followUp) => followUp.promise),
  );
  const recoveryScopes = followUps.flatMap((followUp, index) =>
    results[index]?.status === "rejected" ? [followUp.scope] : [],
  );
  const uniqueRecoveryScopes = [...new Set(recoveryScopes)];
  if (uniqueRecoveryScopes.length > 0) {
    throw new BusinessSetupPartialError(entity.id, uniqueRecoveryScopes);
  }
  return entity;
}

export async function startBusinessOwner(
  legalEntityId: string,
  input: v1.finance.CreateBusinessOwnerInput,
): Promise<v1.finance.BusinessOwner> {
  return webApi.fetch(
    v1.finance.EXPENSE_ROUTES.legalEntities.owners.create(legalEntityId),
    v1.finance.businessOwnerSchema,
    {
      method: "POST",
      json: v1.finance.createBusinessOwnerInputSchema.parse(input),
    },
  );
}

export async function endBusinessOwner(
  legalEntityId: string,
  ownerId: string,
  effectiveTo: string,
): Promise<v1.finance.BusinessOwner> {
  return webApi.fetch(
    v1.finance.EXPENSE_ROUTES.legalEntities.owners.update(
      legalEntityId,
      ownerId,
    ),
    v1.finance.businessOwnerSchema,
    {
      method: "PATCH",
      json: v1.finance.updateBusinessOwnerInputSchema.parse({ effectiveTo }),
    },
  );
}

export async function startVatRegistration(
  legalEntityId: string,
  input: v1.finance.CreateVatRegistrationPeriodInput,
): Promise<v1.finance.VatRegistrationPeriod> {
  return webApi.fetch(
    v1.finance.EXPENSE_ROUTES.legalEntities.vatPeriods.create(legalEntityId),
    v1.finance.vatRegistrationPeriodSchema,
    {
      method: "POST",
      json: v1.finance.createVatRegistrationPeriodInputSchema.parse(input),
    },
  );
}

export async function endVatRegistration(
  legalEntityId: string,
  periodId: string,
  effectiveTo: string,
): Promise<v1.finance.VatRegistrationPeriod> {
  return webApi.fetch(
    v1.finance.EXPENSE_ROUTES.legalEntities.vatPeriods.update(
      legalEntityId,
      periodId,
    ),
    v1.finance.vatRegistrationPeriodSchema,
    {
      method: "PATCH",
      json: v1.finance.updateVatRegistrationPeriodInputSchema.parse({
        effectiveTo,
      }),
    },
  );
}

export async function updateVatRegistration(
  legalEntityId: string,
  periodId: string,
  input: v1.finance.UpdateVatRegistrationPeriodInput,
): Promise<v1.finance.VatRegistrationPeriod> {
  return webApi.fetch(
    v1.finance.EXPENSE_ROUTES.legalEntities.vatPeriods.update(
      legalEntityId,
      periodId,
    ),
    v1.finance.vatRegistrationPeriodSchema,
    {
      method: "PATCH",
      json: v1.finance.updateVatRegistrationPeriodInputSchema.parse(input),
    },
  );
}

async function uploadEvidenceForDocumentType(
  expense: v1.finance.Expense,
  documentTypes: v1.finance.ExpenseDocumentType[],
  evidence: SelectedExpenseEvidence,
): Promise<unknown> {
  const document = expense.documents.find((item) =>
    documentTypes.includes(item.type),
  );
  if (!document) {
    throw new Error("The evidence document was not created.");
  }
  if (document.assets.some((asset) => asset.role === "ORIGINAL")) {
    return document;
  }
  return uploadExpenseEvidence(expense.id, document.id, evidence);
}

async function uploadExpenseEvidence(
  expenseId: string,
  documentId: string,
  evidence: SelectedExpenseEvidence,
) {
  const uploadInput =
    v1.finance.createExpenseDocumentUploadUrlInputSchema.parse({
      contentType: evidence.contentType,
      byteSize: evidence.byteSize,
      checksumSha256: evidence.sha256,
      ...(evidence.contentType === "application/pdf"
        ? { pageCount: evidence.pageCount }
        : {
            imageWidth: evidence.imageWidth,
            imageHeight: evidence.imageHeight,
          }),
    });
  const signedUpload = await webApi.fetch(
    v1.finance.EXPENSE_ROUTES.documents.uploadUrl(
      expenseId,
      documentId,
      "ORIGINAL",
    ),
    v1.finance.expenseDocumentUploadUrlSchema,
    { method: "POST", json: uploadInput },
  );
  const uploadResponse = await fetch(signedUpload.uploadUrl, {
    method: signedUpload.method,
    headers: signedUpload.headers,
    body: evidence.file,
  });
  if (!uploadResponse.ok) {
    throw new Error(
      `Evidence upload failed with HTTP ${uploadResponse.status}.`,
    );
  }

  return webApi.fetch(
    v1.finance.EXPENSE_ROUTES.documents.completeUpload(
      expenseId,
      documentId,
      "ORIGINAL",
    ),
    v1.finance.expenseDocumentSchema,
    {
      method: "POST",
      json: v1.finance.completeExpenseDocumentUploadInputSchema.parse({
        uploadToken: signedUpload.uploadToken,
      }),
    },
  );
}

async function imageDimensions(
  file: File,
): Promise<{ imageWidth: number; imageHeight: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    return { imageWidth: bitmap.width, imageHeight: bitmap.height };
  } finally {
    bitmap.close();
  }
}

function countPdfPages(bytes: ArrayBuffer): number {
  const content = new TextDecoder("latin1").decode(bytes);
  const pageObjects = content.match(/\/Type\s*\/Page(?!s)\b/g);
  return Math.max(1, pageObjects?.length ?? 0);
}
