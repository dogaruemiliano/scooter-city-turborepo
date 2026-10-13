"use client";

import { v1 } from "@repo/api-shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWatch, type FieldPath, type UseFormReturn } from "react-hook-form";
import {
  parseDocumentImport,
  type DocumentImportResult,
} from "./scooter-document-import";
import type {
  DocumentSource,
  ExtractedDocumentData,
} from "./scooter-document-sources";
import type {
  ScooterEditorField,
  ScooterEditorValues,
} from "./scooter-editor-schema";
import type { ScooterDocumentsEditor } from "./useScooterDocuments";

type Success = Extract<DocumentImportResult, { ok: true }>;
type InsuranceField = (typeof v1.scooters.INSURANCE_FIELDS)[number];
type Form = UseFormReturn<
  ScooterEditorValues,
  unknown,
  v1.scooters.UpdateScooterInput
>;
interface Origin {
  field: string;
  policyId?: string;
  baseline: string;
  lastAuto: string;
  sourceIds: string[];
}
interface Options {
  form: Form;
  documents: ScooterDocumentsEditor;
  brands: v1.scooterBrands.ScooterBrand[];
  editing: boolean;
  onRawFields: (raw: Record<string, string>) => void;
  initialRawFields?: Record<string, string>;
}
function originKey(field: string, policyId?: string) {
  return policyId ? `policy:${policyId}:${field}` : field;
}
function pathFor(
  origin: Pick<Origin, "field" | "policyId">,
  values: ScooterEditorValues,
): FieldPath<ScooterEditorValues> | undefined {
  if (!origin.policyId) return origin.field as ScooterEditorField;
  const index =
    values.insurancePolicies?.findIndex(
      (policy) => policy.id === origin.policyId,
    ) ?? -1;
  return index < 0
    ? undefined
    : `insurancePolicies.${index}.${origin.field as InsuranceField}`;
}
function readField(
  origin: Pick<Origin, "field" | "policyId">,
  values: ScooterEditorValues,
) {
  return origin.policyId
    ? (values.insurancePolicies?.find(
        (policy) => policy.id === origin.policyId,
      )?.[origin.field as InsuranceField] ?? "")
    : (values[origin.field as ScooterEditorField] ?? "");
}
function blankResult(): Success {
  return {
    ok: true,
    values: {},
    confirmedEmpty: [],
    unresolved: [],
    unresolvedRawFields: [],
    emptyConflicts: [],
  };
}
function initialEvidence(documents: ScooterDocumentsEditor) {
  return Object.fromEntries(
    documents.existing.flatMap((doc) =>
      doc.extractedData ? [[doc.id, doc.extractedData]] : [],
    ),
  );
}

/** Owns source provenance so navigating or replacing files never discards human corrections. */
export function useScooterExtraction(options: Options) {
  const { form, documents } = options;
  const signature = JSON.stringify([
    ...documents.existing.map((doc) => ({
      sourceId: doc.id,
      type: doc.type,
      fileName: doc.fileName,
      insurancePolicyId: doc.insurancePolicyId,
    })),
    ...documents.drafts
      .filter((doc) => doc.type !== null)
      .map((doc) => ({
        sourceId: doc.id,
        type: doc.type,
        fileName: doc.file.name,
        insurancePolicyId: doc.insurancePolicyId,
      })),
  ]);
  const sources = useMemo<DocumentSource[]>(
    () => JSON.parse(signature),
    [signature],
  );
  const liveVin = useWatch({ control: form.control, name: "vin" });
  const [evidence, setEvidence] = useState<
    Record<string, ExtractedDocumentData>
  >(() => ({
    ...initialEvidence(documents),
    ...Object.fromEntries(
      Object.entries(documents.extractions).filter(
        (entry): entry is [string, ExtractedDocumentData] => entry[1] !== null,
      ),
    ),
  }));
  const [reviewResult, setReviewResult] = useState<Success>();
  const [confirmedSources, setConfirmedSources] = useState<Set<string>>(
    () => new Set(documents.existing.map((doc) => doc.id)),
  );
  const store = useRef(evidence);
  const origins = useRef(new Map<string, Origin>());
  const manual = useRef(new Set<string>());
  const automaticBaselines = useRef(new Map<string, string>());
  const publishedRaw = useRef(options.initialRawFields ?? {});
  const previousSources = useRef<DocumentSource[] | null>(null);
  const rawBySource = useRef(new Map<string, Record<string, string>>());
  const latest = useRef({ ...options, sources });

  useEffect(() => {
    latest.current = { ...options, sources };
  });

  const publishRawFields = useCallback((raw: Record<string, string>) => {
    const previous = publishedRaw.current;
    if (
      Object.keys(previous).length === Object.keys(raw).length &&
      Object.entries(raw).every(([key, value]) => previous[key] === value)
    )
      return;
    publishedRaw.current = raw;
    latest.current.onRawFields(raw);
  }, []);

  const applyValues = useCallback(
    (incoming: Success, sourceConflicts: Origin[] = []) => {
      const { form, sources } = latest.current;
      const values = form.getValues();
      const retained = new Set(incoming.emptyConflicts);
      const policyConflicts = new Map<string, Set<string>>();
      function conflict(field: string, policyId?: string) {
        if (!policyId) retained.add(field);
        else {
          const fields = policyConflicts.get(policyId) ?? new Set<string>();
          fields.add(field);
          policyConflicts.set(policyId, fields);
        }
      }
      sourceConflicts.forEach((entry) => conflict(entry.field, entry.policyId));
      function mergeValue(
        field: string,
        next: string,
        sourceIds: string[],
        policyId?: string,
      ): string {
        const key = originKey(field, policyId);
        const previous = origins.current.get(key);
        const current = readField({ field, policyId }, values);
        const path = pathFor({ field, policyId }, values);
        const manuallyChanged =
          manual.current.has(key) ||
          (previous
            ? current !== previous.lastAuto
            : Boolean(
                path &&
                form.getFieldState(path).isDirty &&
                automaticBaselines.current.get(key) !== current &&
                (!policyId ||
                  current !== "" ||
                  form.formState.defaultValues?.insurancePolicies?.some(
                    (policy) => policy?.id === policyId,
                  )),
              ));
        if (manuallyChanged) {
          manual.current.add(key);
          if (next !== current) conflict(field, policyId);
          return current;
        }
        automaticBaselines.current.delete(key);
        origins.current.set(key, {
          field,
          policyId,
          baseline: previous?.baseline ?? current,
          lastAuto: next,
          sourceIds,
        });
        return next;
      }
      for (const [field, next] of Object.entries(incoming.values)) {
        const value = mergeValue(
          field,
          next,
          incoming.fieldSources?.[field] ?? [],
        );
        if (value !== values[field as ScooterEditorField])
          form.setValue(field as ScooterEditorField, value, {
            shouldDirty: true,
            shouldTouch: true,
          });
      }
      if (incoming.insurancePolicies) {
        const policies = incoming.insurancePolicies.map((policy, index) => {
          const prior = values.insurancePolicies?.find(
            (item) => item.id === policy.id,
          );
          const merged = {
            ...policy,
            vinReviewConfirmed:
              policy.vinReviewConfirmed || prior?.vinReviewConfirmed || false,
          };
          for (const field of v1.scooters.INSURANCE_FIELDS) {
            merged[field] = mergeValue(
              field,
              policy[field],
              incoming.fieldSources?.[`insurancePolicies.${index}.${field}`] ??
                [],
              policy.id,
            );
          }
          return merged;
        });
        form.setValue("insurancePolicies", policies, {
          shouldDirty: true,
          shouldTouch: true,
        });
      }
      if (incoming.extractedDocuments) {
        for (const [id, data] of Object.entries(incoming.extractedDocuments)) {
          const known = Object.fromEntries(
            Object.entries(data.rawFields).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === "string" && Boolean(entry[1].trim()),
            ),
          );
          rawBySource.current.set(id, {
            ...rawBySource.current.get(id),
            ...known,
          });
        }
      }
      if (sources.some((entry) => entry.type === "civ")) {
        const civRaw = Object.assign(
          {},
          ...sources
            .filter((entry) => entry.type === "civ")
            .map((entry) => rawBySource.current.get(entry.sourceId) ?? {}),
        ) as Record<string, string>;
        publishRawFields(civRaw);
      } else if (incoming.rawFields) publishRawFields(incoming.rawFields);
      const reviewPolicies = (form.getValues("insurancePolicies") ?? []).map(
        (policy) => {
          const fields = policyConflicts.get(policy.id);
          // Review markers belong to the result only; exact saved policy originals remain intact.
          return fields?.size
            ? {
                ...policy,
                rawFields: {
                  ...policy.rawFields,
                  ...Object.fromEntries(
                    [...fields].map((field) => [field, null]),
                  ),
                },
              }
            : policy;
        },
      );
      setReviewResult({
        ...incoming,
        emptyConflicts: [...retained],
        ...(reviewPolicies.length ? { insurancePolicies: reviewPolicies } : {}),
      });
    },
    [publishRawFields],
  );

  const applyImport = useCallback(
    (result: Success, options: { confirmedUnknownVins?: boolean } = {}) => {
      const { documents, sources } = latest.current;
      if (result.extractedDocuments) {
        store.current = { ...store.current, ...result.extractedDocuments };
        setEvidence({ ...store.current });
        documents.setExtractions((previous) => ({
          ...previous,
          ...result.extractedDocuments,
        }));
        // Only the JSON dialog can attest to its explicit prior confirmation.
        // Provider success is never confirmation of an unreadable VIN.
        if (result.needsVinReview && options.confirmedUnknownVins)
          setConfirmedSources(
            (previous) =>
              new Set([
                ...previous,
                ...sources
                  .filter(
                    (entry) =>
                      result.extractedDocuments?.[entry.sourceId]?.vin === null,
                  )
                  .map((entry) => entry.sourceId),
              ]),
          );
      }
      applyValues(result);
    },
    [applyValues],
  );

  const synchronizeSources = useCallback(() => {
    const { documents, sources, form, brands, editing, initialRawFields } =
      latest.current;
    const previous = previousSources.current;
    // Mount effects can replay. Reconcile only when source identities change;
    // an unchanged empty list is not a successful document import.
    if (previous && JSON.stringify(previous) === JSON.stringify(sources))
      return;
    previousSources.current = sources;
    const activeIds = new Set(sources.map((entry) => entry.sourceId));
    const hasCiv = sources.some((entry) => entry.type === "civ");
    const authorizedIds = new Set(
      sources
        .filter((entry) => !hasCiv || entry.type !== "import_document")
        .map((entry) => entry.sourceId),
    );
    if (previous === null) {
      const civ = sources.find((entry) => entry.type === "civ");
      if (civ && initialRawFields)
        rawBySource.current.set(civ.sourceId, initialRawFields);
      for (const entry of sources) {
        const data = store.current[entry.sourceId];
        if (data)
          rawBySource.current.set(entry.sourceId, {
            ...rawBySource.current.get(entry.sourceId),
            ...Object.fromEntries(
              Object.entries(data.rawFields).filter(
                (pair): pair is [string, string] =>
                  typeof pair[1] === "string" && Boolean(pair[1].trim()),
              ),
            ),
          });
      }
      // Persisted scooter fields are already reviewed; do not replay them on mount.
      return;
    }
    const changedIds = new Set(
      previous
        .filter((old) => {
          const next = sources.find((entry) => entry.sourceId === old.sourceId);
          return (
            !next ||
            next.type !== old.type ||
            next.fileName !== old.fileName ||
            next.insurancePolicyId !== old.insurancePolicyId
          );
        })
        .map((entry) => entry.sourceId),
    );
    for (const id of changedIds) {
      if (activeIds.has(id)) {
        delete store.current[id];
        rawBySource.current.delete(id);
      }
    }
    setConfirmedSources(
      (items) =>
        new Set(
          // Keep confirmations for removed records so Undo restores their reviewed state.
          [...items].filter((id) => !activeIds.has(id) || !changedIds.has(id)),
        ),
    );
    const retainedConflicts: Origin[] = [];
    const snapshot = form.getValues();
    for (const [key, origin] of origins.current) {
      if (
        !origin.sourceIds.some(
          (id) => !authorizedIds.has(id) || changedIds.has(id),
        )
      )
        continue;
      const current = readField(origin, snapshot);
      if (current === origin.lastAuto && !manual.current.has(key)) {
        const path = pathFor(origin, snapshot);
        if (path) {
          form.setValue(path, origin.baseline, { shouldDirty: true });
          automaticBaselines.current.set(key, origin.baseline);
        }
      } else {
        manual.current.add(key);
        retainedConflicts.push(origin);
      }
      origins.current.delete(key);
    }
    if (
      !editing &&
      previous.some((entry) => entry.type === "insurance") &&
      !sources.some((entry) => entry.type === "insurance")
    ) {
      if (form.getValues("insurancePolicies")?.length)
        form.setValue("insurancePolicies", [], { shouldDirty: true });
      for (const [key, origin] of origins.current)
        if (origin.policyId) origins.current.delete(key);
    }
    if (changedIds.size)
      documents.setExtractions((items) => {
        const next = { ...items };
        for (const id of changedIds) if (activeIds.has(id)) delete next[id];
        return next;
      });
    setEvidence({ ...store.current });
    if (
      previous.some((entry) => entry.type === "civ") &&
      !sources.some((entry) => entry.type === "civ")
    )
      publishRawFields({});
    const result =
      sources.length && sources.some((entry) => store.current[entry.sourceId])
        ? parseDocumentImport(
            JSON.stringify({
              schemaVersion: 2,
              documents: sources.map((entry) => ({
                sourceId: entry.sourceId,
                documentType: entry.type,
                ...(store.current[entry.sourceId] ?? {
                  vin: null,
                  fields: {},
                  rawFields: {},
                }),
              })),
            }),
            brands,
            form.getValues(),
            editing,
            {},
            [],
            sources,
          )
        : undefined;
    if (result?.ok) applyValues(result, retainedConflicts);
    else applyValues(blankResult(), retainedConflicts);
  }, [applyValues, publishRawFields]);

  useEffect(() => {
    synchronizeSources();
  }, [signature, synchronizeSources]);

  const hasCiv = sources.some((source) => source.type === "civ");
  const reviewedSources = sources.filter(
    (source) => !hasCiv || source.type !== "import_document",
  );
  const knownVins = [
    liveVin,
    ...reviewedSources.map((source) => evidence[source.sourceId]?.vin),
  ]
    .filter(
      (vin): vin is string => typeof vin === "string" && Boolean(vin.trim()),
    )
    .map((vin) => vin.trim().toUpperCase());
  const vinMismatch = new Set(knownVins).size > 1;
  const unverifiedSources = reviewedSources.filter(
    (source) =>
      !evidence[source.sourceId]?.vin && !confirmedSources.has(source.sourceId),
  );
  const confirmVin = useCallback((sourceId: string) => {
    setConfirmedSources((previous) => new Set([...previous, sourceId]));
    const { sources, form } = latest.current;
    const source = sources.find((item) => item.sourceId === sourceId);
    if (source?.type === "insurance" && source.insurancePolicyId) {
      const policies = form.getValues("insurancePolicies") ?? [];
      const index = policies.findIndex(
        (policy) => policy.id === source.insurancePolicyId,
      );
      if (index >= 0 && !policies[index]?.documentVin)
        form.setValue(`insurancePolicies.${index}.vinReviewConfirmed`, true, {
          shouldDirty: true,
        });
    }
  }, []);
  return {
    sources,
    applyImport,
    reviewResult,
    vinMismatch,
    unverifiedSources,
    confirmVin,
    isVinConfirmed: (sourceId: string) => confirmedSources.has(sourceId),
  };
}
