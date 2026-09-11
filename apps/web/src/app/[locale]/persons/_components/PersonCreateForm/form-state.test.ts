import { describe, expect, it } from "vitest";

import {
  createEmptyCreateForm,
  switchDocumentWorkflow,
  updateDocumentDrafts,
} from "./form-state";
import { createPersonInput } from "./input";

describe("person document workflows", () => {
  it("restores edited documents and uploads completed while their workflow was hidden", () => {
    let form = createEmptyCreateForm("romanian");
    const file = new File(["id"], "id.png", { type: "image/png" });
    form.documents[0] = {
      ...form.documents[0]!,
      number: "123456",
      cnp: "1900228123450",
      photos: { front: { id: "upload-1", status: "uploading", file } },
    };
    form.documents[1] = {
      ...form.documents[1]!,
      licenseCategories: [
        { category: "A1", issuedOn: null, expiresOn: "2030-12-31" },
      ],
    };
    form = switchDocumentWorkflow(form, "foreign");
    form.documents[0] = { ...form.documents[0]!, number: "PASSPORT-123" };
    form = updateDocumentDrafts(form, (document) =>
      document.photos.front?.id === "upload-1"
        ? {
            ...document,
            photos: {
              front: {
                id: "upload-1",
                status: "uploaded",
                file,
                uploadToken: "id-token",
              },
            },
          }
        : document,
    );

    expect(createPersonInput(form, () => "invalid").input?.documents).toEqual([
      expect.objectContaining({ type: "passport", number: "PASSPORT-123" }),
      expect.objectContaining({
        type: "driverLicense",
        licenseCategories: [expect.objectContaining({ category: "A1" })],
      }),
    ]);
    form = switchDocumentWorkflow(form, "romanian", "electronic");
    expect(form.documents[0]?.number).toBe("");
    expect(form.documents[0]?.photos).toEqual({});
    form = switchDocumentWorkflow(form, "romanian", "classic");
    expect(form.documents[0]).toMatchObject({
      number: "123456",
      photos: { front: { status: "uploaded", uploadToken: "id-token" } },
    });
    expect(form.documents.at(-1)?.licenseCategories).toEqual([
      { category: "A1", issuedOn: null, expiresOn: "2030-12-31" },
    ]);
    expect(createPersonInput(form, () => "invalid").input?.documents).toEqual([
      expect.objectContaining({
        type: "nationalId",
        photos: { front: "id-token" },
      }),
      expect.objectContaining({ type: "driverLicense" }),
    ]);
    form = switchDocumentWorkflow(form, "foreign");
    expect(form.documents[0]?.number).toBe("PASSPORT-123");
  });
});
