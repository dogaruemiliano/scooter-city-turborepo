import { v1 } from "@repo/api-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { analyzeExpenseReceipt, uploadExpenseReceipt } from "./expense-api";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  storageFetch: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: { fetch: mocks.apiFetch },
}));

const signedUpload: v1.finance.ExpenseReceiptDraftUpload = {
  uploadUrl: "https://s3.test/receipt",
  uploadToken: "receipt-upload-token",
  method: "PUT",
  headers: {
    "Content-Type": "image/jpeg",
    "x-amz-checksum-sha256": "checksum-base64",
  },
  expiresAt: "2026-08-23T10:05:00.000Z",
  maxBytes: 10_000_000,
};

describe("expense receipt upload", () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset();
    mocks.storageFetch.mockReset();
    vi.stubGlobal("fetch", mocks.storageFetch);
  });

  it("returns the private upload token without starting extraction", async () => {
    mocks.apiFetch.mockResolvedValueOnce(signedUpload);
    mocks.storageFetch.mockResolvedValueOnce(
      new Response(null, { status: 200 }),
    );
    const file = new File(["receipt"], "receipt.jpg", {
      type: "image/jpeg",
    });

    await expect(uploadExpenseReceipt(file)).resolves.toBe(
      "receipt-upload-token",
    );

    expect(mocks.apiFetch).toHaveBeenCalledOnce();
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.finance.ROUTES.expenses.draftUpload,
      v1.finance.expenseReceiptDraftUploadSchema,
      {
        method: "POST",
        json: {
          contentType: "image/jpeg",
          byteSize: 7,
          checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      },
    );
    expect(mocks.storageFetch).toHaveBeenCalledWith(signedUpload.uploadUrl, {
      method: "PUT",
      headers: signedUpload.headers,
      body: file,
    });
  });

  it("uses the same uploader before asking Textract to analyze", async () => {
    const draft = { id: "draft-1" };
    mocks.apiFetch
      .mockResolvedValueOnce(signedUpload)
      .mockResolvedValueOnce(draft);
    mocks.storageFetch.mockResolvedValueOnce(
      new Response(null, { status: 200 }),
    );
    const file = new File(["receipt"], "receipt.jpg", {
      type: "image/jpeg",
    });

    await expect(analyzeExpenseReceipt(file)).resolves.toBe(draft);

    expect(mocks.apiFetch).toHaveBeenNthCalledWith(
      2,
      v1.finance.ROUTES.expenses.analyze,
      v1.finance.expenseExtractionDraftSchema,
      {
        method: "POST",
        json: { uploadToken: "receipt-upload-token" },
      },
    );
  });
});
