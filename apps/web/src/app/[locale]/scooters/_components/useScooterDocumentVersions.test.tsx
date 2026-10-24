import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  useScooterDocuments,
  type ScooterDocumentsSnapshot,
} from "./useScooterDocuments";

vi.mock("@/lib/api", () => ({ webApi: { fetch: vi.fn() } }));

function snapshot(): ScooterDocumentsSnapshot {
  const file = {
    name: "original.pdf",
    type: "application/pdf",
    size: 100,
    lastModified: 1,
  };
  return {
    drafts: [
      {
        id: "original",
        type: "ownership_proof",
        file,
        status: "ready",
        uploadToken: "original-token",
      },
      {
        id: "client",
        type: null,
        uploadType: "unclassified",
        version: "client_copy",
        originalId: "original",
        file: { ...file, name: "client.pdf" },
        status: "ready",
        uploadToken: "client-token",
      },
    ],
    extractions: {},
    removedIds: [],
  };
}
describe("document versions", () => {
  it("sends both versions as one document without requiring a second classification", () => {
    const hook = renderHook(() =>
      useScooterDocuments([], { snapshot: snapshot() }),
    );
    expect(hook.result.current.blocked).toBe(false);
    expect(hook.result.current.payload.documentDrafts).toEqual([
      {
        type: "ownership_proof",
        fileName: "original.pdf",
        uploadToken: "original-token",
        clientCopy: {
          fileName: "client.pdf",
          uploadToken: "client-token",
          uploadType: "unclassified",
        },
      },
    ]);
    act(() => hook.result.current.removeDraft("original"));
    expect(hook.result.current.drafts).toHaveLength(0);
  });
  it("saves a corrected classification while retaining the original signed upload scope", () => {
    const state = snapshot();
    state.drafts[0].uploadType = "unclassified";
    state.extractions.original = {
      vin: null,
      fields: {},
      rawFields: {},
      documents: [
        {
          id: "logical",
          documentType: "export_certificate",
          pages: [1],
          vin: null,
          fields: {},
          rawFields: {},
        },
      ],
    };
    const hook = renderHook(() => useScooterDocuments([], { snapshot: state }));
    expect(hook.result.current.payload.documentDrafts?.[0]).toMatchObject({
      type: "export_certificate",
      uploadType: "unclassified",
      uploadToken: "original-token",
    });
  });
  it("blocks a client copy whose original is missing", () => {
    const state = snapshot();
    state.drafts.shift();
    const hook = renderHook(() => useScooterDocuments([], { snapshot: state }));
    expect(hook.result.current.blocked).toBe(true);
    expect(hook.result.current.payload.documentDrafts).toEqual([]);
  });
});
