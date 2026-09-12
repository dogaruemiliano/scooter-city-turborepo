import { describe, expect, it } from "vitest";

import {
  createEmptyCreateForm,
  switchDocumentWorkflow,
  updateDocumentDrafts,
} from "./form-state";
import { createPersonInput } from "./input";

describe("person document workflows", () => {
  it("shares the uploaded ID, its edits and both photo sides across format changes", () => {
    let form = createEmptyCreateForm("romanian");
    const front = {
      id: "front",
      status: "uploaded" as const,
      file: new File(["front"], "front.png"),
      uploadToken: "token",
    };
    const identity = {
      ...form.documents[0]!,
      number: "123456",
      issuedBy: "Issuer",
      photos: { front },
    };
    form.documents[0] = identity;
    form = switchDocumentWorkflow(form, "romanian", "electronic");
    expect(form.documents[0]).toMatchObject({
      key: identity.key,
      number: "123456",
      issuedBy: "Issuer",
      nationalIdFormat: "electronic",
    });
    expect(form.documents[0]!.photos.front).toBe(front);
    expect(
      form.documents.some((document) => document.type === "proofOfAddress"),
    ).toBe(true);
    const back = { ...front, id: "back", file: new File(["back"], "back.png") };
    form.documents[0]!.photos.back = back;
    form = switchDocumentWorkflow(form, "romanian", "classic");
    form = switchDocumentWorkflow(form, "romanian", "electronic");
    expect(form.documents[0]!.photos).toEqual({ front, back });
    expect(form.documents[0]!.key).toBe(identity.key);
  });

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
