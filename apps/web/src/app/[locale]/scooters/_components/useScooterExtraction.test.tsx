import { v1 } from "@repo/api-shared";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { parseDocumentImport } from "./scooter-document-import";
import type {
  DocumentSource,
  ExtractedDocumentData,
} from "./scooter-document-sources";
import {
  insuranceEditorDefaults,
  scooterEditorDefaults,
  type ScooterEditorValues,
} from "./scooter-editor-schema";
import { useScooterExtraction } from "./useScooterExtraction";
import type { ScooterDocumentsEditor } from "./useScooterDocuments";

const vin = "LXYTCKP05P0000001";
const brands = [
  {
    id: "brand-1",
    name: "KYMCO",
    code: "KYMCO",
    scooterCount: 0,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    deletedAt: null,
  },
];
const importer: DocumentSource = {
  sourceId: "import-1",
  type: "import_document",
  fileName: "import.pdf",
};
const civ: DocumentSource = {
  sourceId: "civ-1",
  type: "civ",
  fileName: "civ.pdf",
};
const insurer: DocumentSource = {
  sourceId: "insurance-1",
  type: "insurance",
  fileName: "insurance.pdf",
  insurancePolicyId: "policy-1",
};
function extracted(
  fields: ExtractedDocumentData["fields"],
  rawFields: ExtractedDocumentData["rawFields"] = {},
  documentVin: string | null = vin,
): ExtractedDocumentData {
  return { vin: documentVin, fields, rawFields };
}
interface Props {
  attached: DocumentSource[];
  existing?: boolean;
  editing?: boolean;
  existingExtraction?: Record<string, ExtractedDocumentData>;
}
function setup(
  initialProps: Props,
  defaults = scooterEditorDefaults(),
  reactStrictMode = false,
) {
  const onRawFields = vi.fn();
  const hook = renderHook(
    (props: Props) => {
      const form = useForm<
        ScooterEditorValues,
        unknown,
        v1.scooters.UpdateScooterInput
      >({ defaultValues: defaults });
      const [extractions, setExtractions] = useState<
        Record<string, v1.scooters.ScooterDocumentExtractedData | null>
      >({});
      // Real RHF dirtiness subscribes through formState, as it does in ScooterEditor.
      void form.formState.dirtyFields;
      const documents = {
        drafts: props.existing
          ? []
          : props.attached.map((source) => ({
              id: source.sourceId,
              type: source.type,
              insurancePolicyId: source.insurancePolicyId ?? undefined,
              file: new File(["fixture"], source.fileName, {
                type: "application/pdf",
              }),
              status: "ready" as const,
              uploadToken: "token",
            })),
        existing: props.existing
          ? props.attached.map((source) => ({
              id: source.sourceId,
              type: source.type,
              fileName: source.fileName,
              insurancePolicyId: source.insurancePolicyId,
              extractedData: props.existingExtraction?.[source.sourceId],
            }))
          : [],
        extractions,
        setExtractions,
      } as unknown as ScooterDocumentsEditor;
      return {
        form,
        documents,
        extraction: useScooterExtraction({
          form,
          documents,
          brands,
          editing: props.editing ?? false,
          onRawFields,
        }),
      };
    },
    { initialProps, reactStrictMode },
  );
  function apply(
    data: Record<string, ExtractedDocumentData>,
    confirmedUnknownVins = false,
  ) {
    const sources = hook.result.current.extraction.sources;
    const parsed = parseDocumentImport(
      JSON.stringify({
        schemaVersion: 2,
        documents: sources.map((source) => ({
          sourceId: source.sourceId,
          documentType: source.type,
          ...(data[source.sourceId] ?? extracted({}, {}, null)),
        })),
      }),
      brands,
      hook.result.current.form.getValues(),
      initialProps.editing ?? false,
      {},
      [],
      sources,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok)
      throw new Error(`${parsed.reason}: ${parsed.fields.join(",")}`);
    act(() =>
      hook.result.current.extraction.applyImport(parsed, {
        confirmedUnknownVins,
      }),
    );
  }
  return { ...hook, onRawFields, apply };
}

describe("document extraction lifecycle", () => {
  it("keeps an empty create form unimported when Strict Mode replays mount effects", () => {
    const hook = setup({ attached: [] }, scooterEditorDefaults(), true);
    expect(hook.result.current.extraction.sources).toEqual([]);
    expect(hook.result.current.extraction.reviewResult).toBeUndefined();
    hook.rerender({ attached: [] });
    expect(hook.result.current.extraction.reviewResult).toBeUndefined();
    expect(hook.result.current.form.formState.isDirty).toBe(false);
    expect(hook.onRawFields).not.toHaveBeenCalled();
  });

  it("does not replay persisted extraction on Strict Mode mounts", () => {
    const hook = setup(
      {
        attached: [civ],
        existing: true,
        editing: true,
        existingExtraction: { [civ.sourceId]: extracted({ color: "Printed" }) },
      },
      { ...scooterEditorDefaults(), color: "Saved correction" },
      true,
    );
    expect(hook.result.current.form.getValues("color")).toBe(
      "Saved correction",
    );
    expect(hook.result.current.extraction.reviewResult).toBeUndefined();
    expect(hook.result.current.form.formState.isDirty).toBe(false);
  });

  it("preserves manual corrections when the final document is removed", () => {
    const hook = setup({ attached: [civ] });
    hook.apply({ [civ.sourceId]: extracted({ color: "Printed" }) });
    act(() =>
      hook.result.current.form.setValue("color", "Corrected", {
        shouldDirty: true,
      }),
    );
    hook.rerender({ attached: [] });
    expect(hook.result.current.extraction.sources).toEqual([]);
    expect(hook.result.current.form.getValues("color")).toBe("Corrected");
  });
  it("reviews import VINs only while there is no CIV", () => {
    const hook = setup({ attached: [importer] });
    expect(hook.result.current.extraction.unverifiedSources).toEqual([
      importer,
    ]);
    hook.rerender({ attached: [importer, civ] });
    expect(hook.result.current.extraction.unverifiedSources).toEqual([civ]);
    hook.rerender({ attached: [importer] });
    expect(hook.result.current.extraction.unverifiedSources).toEqual([
      importer,
    ]);
  });

  it("does not let historical import VINs block reviewing the CIV", () => {
    const hook = setup({
      attached: [importer, civ],
      existing: true,
      editing: true,
      existingExtraction: {
        [importer.sourceId]: extracted({}, {}, "LXYTCKP05P0000002"),
        [civ.sourceId]: extracted({}, {}, vin),
      },
    });
    expect(hook.result.current.extraction.vinMismatch).toBe(false);
  });

  it("does not dirty a persisted edit on mount or require reviewing historical files without extraction", () => {
    const hook = setup({ attached: [civ], existing: true, editing: true });
    expect(hook.onRawFields).not.toHaveBeenCalled();
    expect(hook.result.current.documents.extractions).toEqual({});
    expect(hook.result.current.extraction.unverifiedSources).toEqual([]);
    expect(hook.result.current.form.formState.isDirty).toBe(false);
  });

  it("clears replaced automatic values but preserves manual changes and flags conflicts", () => {
    const hook = setup({ attached: [importer] });
    hook.apply({
      [importer.sourceId]: extracted({
        powertrainType: "combustion",
        powerKw: 2,
        color: "Blue",
      }),
    });
    expect(hook.result.current.form.getValues("powerKw")).toBe("2");
    act(() =>
      hook.result.current.form.setValue("powerKw", "3", { shouldDirty: true }),
    );
    const replacement = {
      ...importer,
      sourceId: "import-2",
      fileName: "new.pdf",
    };
    hook.rerender({ attached: [replacement] });
    expect(hook.result.current.form.getValues("powerKw")).toBe("3");
    expect(hook.result.current.form.getValues("color")).toBe("");
    expect(
      hook.result.current.extraction.unverifiedSources.map(
        (source) => source.sourceId,
      ),
    ).toEqual(["import-2"]);
    hook.apply({
      [replacement.sourceId]: extracted({
        powertrainType: "combustion",
        powerKw: 4,
        color: "Red",
      }),
    });
    expect(hook.result.current.form.getValues("powerKw")).toBe("3");
    expect(hook.result.current.form.getValues("color")).toBe("Red");
    expect(
      hook.result.current.extraction.reviewResult?.emptyConflicts,
    ).toContain("powerKw");
  });

  it("suppresses import values as soon as CIV is attached and restores them if CIV is removed", () => {
    const hook = setup({ attached: [importer] });
    const importData = extracted({
      powertrainType: "combustion",
      powerKw: 2,
      color: "Blue",
    });
    hook.apply({ [importer.sourceId]: importData });
    act(() =>
      hook.result.current.form.setValue("color", "Purple", {
        shouldDirty: true,
      }),
    );
    hook.rerender({ attached: [importer, civ] });
    expect(hook.result.current.form.getValues("powerKw")).toBe("");
    expect(hook.result.current.form.getValues("color")).toBe("Purple");
    const civData = extracted(
      {
        powertrainType: "combustion",
        powerKw: 1,
        color: "White",
        civVersion: "2024",
      },
      { "P.2": "1" },
    );
    hook.apply({ [importer.sourceId]: importData, [civ.sourceId]: civData });
    expect(hook.result.current.form.getValues("powerKw")).toBe("1");
    expect(hook.result.current.form.getValues("color")).toBe("Purple");
    hook.rerender({ attached: [importer] });
    expect(hook.result.current.form.getValues("powerKw")).toBe("2");
    expect(hook.result.current.form.getValues("color")).toBe("Purple");
    expect(hook.result.current.form.getValues("civVersion")).toBe("unknown");
    expect(hook.onRawFields).toHaveBeenLastCalledWith({});
    // An undo restores the original CIV extraction and its precedence.
    hook.rerender({ attached: [importer, civ] });
    expect(hook.result.current.form.getValues("powerKw")).toBe("1");
  });

  it("replays after clearing to a non-default automatic baseline and keeps historical confirmation on undo", () => {
    const hook = setup({ attached: [importer] });
    act(() =>
      hook.result.current.form.setValue("powerKw", "5", { shouldDirty: false }),
    );
    const importData = extracted({ powertrainType: "combustion", powerKw: 2 });
    hook.apply({ [importer.sourceId]: importData });
    hook.rerender({ attached: [importer, civ] });
    expect(hook.result.current.form.getValues("powerKw")).toBe("5");
    hook.apply({
      [importer.sourceId]: importData,
      [civ.sourceId]: extracted({ powertrainType: "combustion", powerKw: 1 }),
    });
    expect(hook.result.current.form.getValues("powerKw")).toBe("1");
    hook.rerender({ attached: [importer] });
    expect(hook.result.current.form.getValues("powerKw")).toBe("2");
    const saved = setup({ attached: [civ], existing: true, editing: true });
    saved.rerender({ attached: [], existing: true, editing: true });
    saved.rerender({ attached: [civ], existing: true, editing: true });
    expect(saved.result.current.extraction.unverifiedSources).toEqual([]);
    expect(saved.onRawFields).not.toHaveBeenCalled();
  });

  it("replaces untouched smart defaults with documented engine and homologation", () => {
    const hook = setup({ attached: [civ], editing: false });
    hook.apply({
      [civ.sourceId]: extracted({
        powertrainType: "electric",
        vehicleCategory: "L3e",
      }),
    });
    expect(hook.result.current.form.getValues("powertrainType")).toBe(
      "electric",
    );
    expect(hook.result.current.form.getValues("vehicleCategory")).toBe("L3e");
  });

  it("preserves fields already edited before the first JSON import", () => {
    const hook = setup({ attached: [civ] });
    act(() =>
      hook.result.current.form.setValue("color", "Manual", {
        shouldDirty: true,
      }),
    );
    hook.apply({
      [civ.sourceId]: extracted({
        color: "Printed",
        powertrainType: "combustion",
      }),
    });
    expect(hook.result.current.form.getValues("color")).toBe("Manual");
    expect(
      hook.result.current.extraction.reviewResult?.emptyConflicts,
    ).toContain("color");
  });

  it("preserves manually entered insurance when unrelated vehicle documents change", () => {
    const policy = {
      ...insuranceEditorDefaults(),
      insuredName: "Manual policy",
      documentVin: vin,
    };
    const hook = setup(
      { attached: [], editing: false },
      { ...scooterEditorDefaults(), insurancePolicies: [policy] },
    );
    expect(hook.result.current.form.getValues("insurancePolicies")).toEqual([
      policy,
    ]);
    hook.rerender({ attached: [civ], editing: false });
    hook.apply({ [civ.sourceId]: extracted({ color: "White" }) });
    expect(hook.result.current.form.getValues("insurancePolicies")).toEqual([
      policy,
    ]);
  });

  it("fills a new insurance draft despite array dirtiness, preserves manual policy edits, and clears hidden policy after file removal", () => {
    const defaults = scooterEditorDefaults();
    const hook = setup({ attached: [], editing: false }, defaults);
    act(() =>
      hook.result.current.form.setValue(
        "insurancePolicies",
        [{ ...insuranceEditorDefaults(), id: "policy-1" }],
        { shouldDirty: true },
      ),
    );
    hook.rerender({ attached: [insurer], editing: false });
    const policy = extracted(
      {
        insuredName: "Printed Name",
        premiumAmount: 250,
        currency: "RON",
        documentVin: vin,
      },
      { insuredName: "Printed Name" },
    );
    hook.apply({ [insurer.sourceId]: policy });
    expect(
      hook.result.current.form.getValues("insurancePolicies.0.insuredName"),
    ).toBe("Printed Name");
    act(() =>
      hook.result.current.form.setValue(
        "insurancePolicies.0.insuredName",
        "Corrected Name",
        { shouldDirty: true },
      ),
    );
    hook.apply({ [insurer.sourceId]: policy });
    expect(
      hook.result.current.form.getValues("insurancePolicies.0.insuredName"),
    ).toBe("Corrected Name");
    expect(
      hook.result.current.form.getValues(
        "insurancePolicies.0.rawFields.insuredName",
      ),
    ).toBe("Printed Name");
    expect(
      hook.result.current.extraction.reviewResult?.insurancePolicies?.[0]
        ?.rawFields?.insuredName,
    ).toBeNull();
    hook.rerender({ attached: [], editing: false });
    expect(hook.result.current.form.getValues("insurancePolicies")).toEqual([]);
  });

  it("requires new unknown sources to be confirmed and never permits confirmation to hide a VIN mismatch", () => {
    const hook = setup({ attached: [civ] });
    expect(hook.result.current.extraction.unverifiedSources).toHaveLength(1);
    act(() => hook.result.current.extraction.confirmVin(civ.sourceId));
    expect(hook.result.current.extraction.unverifiedSources).toEqual([]);
    hook.apply({ [civ.sourceId]: extracted({ color: "Blue" }) });
    act(() =>
      hook.result.current.form.setValue("vin", "LXYTCKP05P0000002", {
        shouldDirty: true,
      }),
    );
    expect(hook.result.current.extraction.vinMismatch).toBe(true);
    act(() => hook.result.current.extraction.confirmVin(civ.sourceId));
    expect(hook.result.current.extraction.vinMismatch).toBe(true);
    hook.rerender({ attached: [{ ...civ, sourceId: "civ-2" }] });
    expect(
      hook.result.current.extraction.unverifiedSources.map(
        (source) => source.sourceId,
      ),
    ).toEqual(["civ-2"]);
  });

  it("accepts the import dialog's confirmation for unknown VINs without asking twice", () => {
    const hook = setup({ attached: [civ] });
    hook.apply(
      { [civ.sourceId]: extracted({ color: "Blue" }, {}, null) },
      true,
    );
    expect(hook.result.current.extraction.unverifiedSources).toEqual([]);
    expect(
      hook.result.current.documents.extractions[civ.sourceId]?.vin,
    ).toBeNull();
  });

  it("never treats a successful direct extraction as confirmation of an unreadable VIN", () => {
    const hook = setup({ attached: [civ] });
    hook.apply({ [civ.sourceId]: extracted({ color: "Blue" }, {}, null) });
    expect(hook.result.current.extraction.unverifiedSources).toEqual([civ]);
    expect(hook.result.current.form.getValues("color")).toBe("Blue");
    act(() => hook.result.current.extraction.confirmVin(civ.sourceId));
    expect(hook.result.current.extraction.unverifiedSources).toEqual([]);
  });
});
