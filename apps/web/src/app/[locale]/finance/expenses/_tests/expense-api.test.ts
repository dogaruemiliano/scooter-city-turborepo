import { v1 } from "@repo/api-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BusinessSetupPartialError,
  ExpenseCompletionPendingError,
  createBusinessSetup,
  recordExpense,
  type SelectedExpenseEvidence,
} from "../_lib/expense-api";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  signedUploadFetch: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: { fetch: mocks.apiFetch },
}));

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.signedUploadFetch.mockReset();
  mocks.signedUploadFetch.mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", mocks.signedUploadFetch);
});

describe("recordExpense", () => {
  it("waits for concurrent uploads and safely resumes only missing originals", async () => {
    let createCount = 0;
    let finishPosUpload: ((value: unknown) => void) | undefined;
    const pendingPosUpload = new Promise((resolve) => {
      finishPosUpload = resolve;
    });

    mocks.apiFetch.mockImplementation((url: string) => {
      if (url === v1.finance.EXPENSE_ROUTES.create) {
        createCount += 1;
        return Promise.resolve(
          expenseDraft(createCount > 1 ? ["document-pos"] : []),
        );
      }
      if (url.includes("upload-url")) {
        const documentId = url.includes("document-fiscal")
          ? "document-fiscal"
          : "document-pos";
        return Promise.resolve({
          uploadUrl: `https://uploads.example/${documentId}`,
          uploadToken: `token-${documentId}`,
          method: "PUT",
          headers: {},
        });
      }
      if (url.includes("complete")) {
        if (url.includes("document-fiscal") && createCount === 1) {
          return Promise.reject(new Error("fiscal completion failed"));
        }
        if (url.includes("document-pos") && createCount === 1) {
          return pendingPosUpload;
        }
        return Promise.resolve({ id: "completed-document" });
      }
      if (url.endsWith("/post")) {
        return Promise.resolve(
          expenseDraft(["document-fiscal", "document-pos"]),
        );
      }
      throw new Error(`Unexpected API request: ${url}`);
    });

    const payload = expensePayload();
    const evidence = {
      fiscal: evidenceFile("invoice.png"),
      pos: evidenceFile("pos.png"),
    };
    let firstAttemptSettled = false;
    const firstAttempt = recordExpense(payload, evidence).finally(() => {
      firstAttemptSettled = true;
    });
    void firstAttempt.catch(() => undefined);

    await vi.waitFor(() =>
      expect(
        mocks.apiFetch.mock.calls.some(([url]) =>
          String(url).includes("document-pos/assets/ORIGINAL/complete"),
        ),
      ).toBe(true),
    );
    expect(firstAttemptSettled).toBe(false);

    finishPosUpload?.({ id: "document-pos" });
    await expect(firstAttempt).rejects.toMatchObject({
      expenseId: "expense-1",
      stage: "EVIDENCE_UPLOAD",
    } satisfies Partial<ExpenseCompletionPendingError>);

    await expect(recordExpense(payload, evidence)).resolves.toMatchObject({
      id: "expense-1",
    });

    const createCalls = mocks.apiFetch.mock.calls.filter(
      ([url]) => url === v1.finance.EXPENSE_ROUTES.create,
    );
    expect(createCalls).toHaveLength(2);
    expect(createCalls[1]?.[2]?.json).toEqual(createCalls[0]?.[2]?.json);

    const uploadUrlCalls = mocks.apiFetch.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes("upload-url"));
    expect(
      uploadUrlCalls.filter((url) => url.includes("document-pos")),
    ).toHaveLength(1);
    expect(
      uploadUrlCalls.filter((url) => url.includes("document-fiscal")),
    ).toHaveLength(2);
  });
});

describe("createBusinessSetup", () => {
  it("waits for all follow-ups and reports the recoverable failed scope", async () => {
    let finishVatSetup: ((value: unknown) => void) | undefined;
    const pendingVatSetup = new Promise((resolve) => {
      finishVatSetup = resolve;
    });

    mocks.apiFetch.mockImplementation((url: string) => {
      if (url === v1.finance.EXPENSE_ROUTES.legalEntities.create) {
        return Promise.resolve({ id: "entity-1" });
      }
      if (url.endsWith("/owners")) {
        return Promise.reject(new Error("owner failed"));
      }
      if (url.endsWith("/vat-periods")) {
        return pendingVatSetup;
      }
      throw new Error(`Unexpected API request: ${url}`);
    });

    let setupSettled = false;
    const setup = createBusinessSetup({
      company: { mode: "EXISTING", companyId: "company-1" },
      defaultCurrency: "RON",
      bankAccounts: [
        { name: "Business card", cardHolderUserId: "owner-user-1" },
      ],
      ownerUserIds: ["owner-user-1"],
      ownerEffectiveFrom: "2026-08-01",
      vat: {
        registered: true,
        countryCode: "RO",
        vatNumber: "RO123",
        effectiveFrom: "2026-09-01",
      },
    }).finally(() => {
      setupSettled = true;
    });
    void setup.catch(() => undefined);

    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(3));
    expect(setupSettled).toBe(false);

    finishVatSetup?.({ id: "vat-period-1" });
    await expect(setup).rejects.toMatchObject({
      entityId: "entity-1",
      recoveryScopes: ["OWNERS"],
    } satisfies Partial<BusinessSetupPartialError>);

    const ownerCall = mocks.apiFetch.mock.calls.find(([url]) =>
      String(url).endsWith("/owners"),
    );
    const vatCall = mocks.apiFetch.mock.calls.find(([url]) =>
      String(url).endsWith("/vat-periods"),
    );
    expect(ownerCall?.[2]?.json).toMatchObject({
      effectiveFrom: "2026-08-01",
    });
    expect(vatCall?.[2]?.json).toMatchObject({
      effectiveFrom: "2026-09-01",
    });
  });
});

function expensePayload(): v1.finance.CreateExpenseInput {
  return v1.finance.createExpenseInputSchema.parse({
    legalEntityId: "entity-1",
    payeeId: "payee-1",
    categoryId: "category-1",
    occurredOn: "2026-08-01",
    currency: "RON",
    grossAmount: "10.00",
    idempotencyKey: "expense-idempotency-1",
    postImmediately: false,
    payment: {
      source: "COMPANY_CARD",
      companyWalletId: "wallet-1",
      paidByUserId: "user-1",
      amount: "10.00",
      paidOn: "2026-08-01",
    },
    attribution: { target: "BUSINESS" },
    references: [],
    taxLines: [],
    documents: [
      {
        type: "INVOICE",
        documentNumber: "INV-1",
        issuedOn: "2026-08-01",
        buyerCuiStatus: "MATCHED",
        reviewStatus: "CONFIRMED",
      },
      {
        type: "POS_RECEIPT",
        issuedOn: "2026-08-01",
        buyerCuiStatus: "NOT_APPLICABLE",
        reviewStatus: "CONFIRMED",
      },
    ],
  });
}

function evidenceFile(fileName: string): SelectedExpenseEvidence {
  return {
    file: new File([fileName], fileName, { type: "image/png" }),
    fileName,
    contentType: "image/png",
    byteSize: fileName.length,
    sha256: "a".repeat(64),
    imageWidth: 100,
    imageHeight: 100,
  };
}

function expenseDraft(originalDocumentIds: string[]): v1.finance.Expense {
  return {
    id: "expense-1",
    documents: [
      expenseDocument("document-fiscal", "INVOICE", originalDocumentIds),
      expenseDocument("document-pos", "POS_RECEIPT", originalDocumentIds),
    ],
  } as v1.finance.Expense;
}

function expenseDocument(
  id: string,
  type: v1.finance.ExpenseDocumentType,
  originalDocumentIds: string[],
) {
  return {
    id,
    type,
    assets: originalDocumentIds.includes(id)
      ? [{ id: `asset-${id}`, role: "ORIGINAL" }]
      : [],
  };
}
