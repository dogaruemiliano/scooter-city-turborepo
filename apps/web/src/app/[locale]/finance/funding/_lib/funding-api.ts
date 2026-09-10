import { v1 } from "@repo/api-shared";

import { webApi } from "@/lib/api";

export function previewFunding(
  input: v1.finance.PreviewAssociateFundingInput,
  signal?: AbortSignal,
) {
  return webApi.fetch(
    v1.finance.ROUTES.funding.preview,
    v1.finance.postingPlanSchema,
    { method: "POST", json: input, signal, cache: "no-store" },
  );
}

export function createFunding(
  input: v1.finance.CreateAssociateFundingInput,
  idempotencyKey: string,
) {
  return webApi.fetch(
    v1.finance.ROUTES.funding.create,
    v1.finance.financialOperationSchema,
    {
      method: "POST",
      json: input,
      headers: { [v1.finance.IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    },
  );
}

export async function uploadFundingProof(file: File): Promise<string> {
  const checksum = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const checksumSha256 = Array.from(new Uint8Array(checksum), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  const signed = await webApi.fetch(
    v1.finance.ROUTES.funding.draftUpload,
    v1.finance.fundingProofDraftUploadSchema,
    {
      method: "POST",
      json: {
        contentType: file.type,
        byteSize: file.size,
        checksumSha256,
      },
    },
  );

  const response = await fetch(signed.uploadUrl, {
    method: signed.method,
    headers: signed.headers,
    body: file,
  });
  if (!response.ok) {
    throw new Error(`Storage upload returned HTTP ${response.status}`);
  }
  return signed.uploadToken;
}
