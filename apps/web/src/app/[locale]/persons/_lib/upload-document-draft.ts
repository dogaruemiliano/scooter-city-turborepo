import { v1 } from "@repo/api-shared";
import { webApi } from "@/lib/api";

export async function uploadDocumentDraft(
  file: File,
  documentType: v1.persons.PersonDocumentType,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const checksumSha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const upload = await webApi.fetch(
    v1.persons.ROUTES.documents.photos.createDraftUploadUrl,
    v1.persons.personDocumentPhotoUploadUrlSchema,
    {
      method: "POST",
      json: {
        documentType,
        contentType: file.type,
        byteSize: file.size,
        checksumSha256,
      },
    },
  );
  const response = await fetch(upload.uploadUrl, {
    method: upload.method,
    headers: upload.headers,
    body: file,
  });
  if (!response.ok) throw new Error("Document upload failed");
  return upload.uploadToken;
}
