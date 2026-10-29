"use client";

import { useId, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import {
  Button,
  Checkbox,
  DropdownMenuItem,
  FormActions,
  Label,
} from "@repo/ui/components";
import { SaveButton } from "@repo/ui/components/save-button";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@repo/ui/components/bottom-sheet";
import { RefreshCwIcon } from "lucide-react";
import { webApi } from "@/lib/api";
import type { DocumentImportResult } from "./scooter-document-import";
import type { ScooterEditorValues } from "./scooter-editor-schema";
import type { ScooterDocumentsEditor } from "./useScooterDocuments";
import { useScooterDocumentReextraction } from "./useScooterDocumentReextraction";
import {
  reextractionReview,
  selectedReextraction,
  type ReextractionProposal,
} from "./scooter-document-reextraction";

type Evidence = v1.scooters.ScooterDocumentExtractedData;

/** Human-readable evidence, including ITP rows; no implementation JSON in the review. */
function evidenceValues(
  evidence: Evidence,
  label: (field: string) => string,
  inspection: string,
) {
  const values: Record<string, string> = {};
  function append(
    prefix: string,
    data: Pick<Evidence, "vin" | "fields" | "rawFields">,
  ) {
    if (data.vin) values[`${prefix}${label("vin")}`] = data.vin;
    for (const [field, value] of Object.entries(data.fields))
      if (value != null && String(value).trim())
        values[`${prefix}${label(field)}`] = String(value);
    for (const [field, value] of Object.entries(data.rawFields))
      if (value?.trim()) values[`${prefix}${field}`] = value;
  }
  append("", evidence);
  evidence.documents?.forEach((document, index) => {
    const prefix = `${index + 1}. `;
    values[`${prefix}${label("documentType")}`] = label(document.documentType);
    append(prefix, document);
    document.inspections?.forEach((row, rowIndex) => {
      const rowPrefix = `${prefix}${inspection} ${rowIndex + 1}: `;
      for (const [field, value] of Object.entries(row)) {
        if (field === "rawFields") {
          for (const [key, raw] of Object.entries(row.rawFields))
            if (raw?.trim()) values[`${rowPrefix}${key}`] = raw;
        } else if (value != null)
          values[`${rowPrefix}${label(field)}`] = String(value);
      }
    });
  });
  return values;
}

export function ScooterReextractionMenuItem({
  onStart,
  disabled,
}: {
  onStart: () => void;
  disabled: boolean;
}) {
  const t = useTranslations("scooters.reextraction");
  return (
    <DropdownMenuItem disabled={disabled} onClick={onStart}>
      <RefreshCwIcon aria-hidden="true" />
      {t("action")}
    </DropdownMenuItem>
  );
}

export function useScooterReextractionReview({
  documents,
  scooterId,
  brands,
  rawFields,
  onApply,
  disabled,
}: {
  documents: ScooterDocumentsEditor;
  scooterId?: string;
  brands: v1.scooterBrands.ScooterBrand[];
  rawFields: Record<string, string>;
  onApply?: (result: Extract<DocumentImportResult, { ok: true }>) => void;
  disabled: boolean;
}) {
  const t = useTranslations("scooters.reextraction");
  const scooterT = useTranslations("scooters");
  const form = useFormContext<ScooterEditorValues>();
  useWatch({ control: form.control });
  const id = useId();
  const analysis = useScooterDocumentReextraction(documents, scooterId ?? "");
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const [baseline, setBaseline] = useState<ScooterEditorValues>(() =>
    form.getValues(),
  );
  const [choices, setChoices] = useState<
    Record<string, { previous: string; next: string; checked: boolean }>
  >({});
  const files = documents.existing
    .filter((file) => !file.extractedData?.clientCopy)
    .map((file) => ({
      ...file,
      extractedData: Object.hasOwn(documents.extractions, file.id)
        ? documents.extractions[file.id]
        : file.extractedData,
    }));
  const analyses = Object.values(analysis.entries).flatMap((entry) =>
    entry.status === "success" ? [entry.analysis] : [],
  );
  const review = reextractionReview(
    analyses,
    files,
    brands,
    form.getValues(),
    baseline,
    rawFields,
    (field) => form.getFieldState(field).isDirty,
  );
  const checked = (proposal: ReextractionProposal) => {
    const choice = choices[proposal.id];
    if (proposal.blocked) return false;
    if (!choice) return proposal.preselected;
    return (
      choice.previous === proposal.previous &&
      choice.next === proposal.next &&
      choice.checked
    );
  };
  const selected = review.proposals.filter(checked);
  const failures = Object.entries(analysis.entries).filter(
    ([, entry]) => entry.status === "failed",
  );
  const finished = Object.values(analysis.entries).filter(
    (entry) => entry.status !== "processing",
  ).length;
  function fieldLabel(field: string) {
    if (field === "brandId" || field === "brandName")
      return scooterT("fields.brand");
    if (field === "documentType") return scooterT("workspace.documentType");
    if (scooterT.has(`documents.${field}`))
      return scooterT(`documents.${field}`);
    if (scooterT.has(`fields.${field}`)) return scooterT(`fields.${field}`);
    if (scooterT.has(`insurance.fields.${field}`))
      return scooterT(`insurance.fields.${field}`);
    if (scooterT.has(`itp.${field}`)) return scooterT(`itp.${field}`);
    return field;
  }
  function displayValue(proposal: ReextractionProposal, value: string) {
    if (!value) return t("empty");
    if (proposal.field === "brandId")
      return (
        brands.find((brand) => brand.id === value)?.name ?? t("unknownBrand")
      );
    if (
      proposal.field === "powertrainType" &&
      scooterT.has(`powertrainTypes.${value}`)
    )
      return scooterT(`powertrainTypes.${value}`);
    return value;
  }
  function sourceLink(sourceId: string) {
    const file = files.find((item) => item.id === sourceId);
    return file ? (
      <a
        key={file.id}
        href={webApi.url(file.contentUrl)}
        target="_blank"
        rel="noopener noreferrer"
        className="break-words text-sm underline underline-offset-4"
      >
        {file.fileName}
      </a>
    ) : null;
  }
  function evidenceDiff(proposal: ReextractionProposal) {
    const old = evidenceValues(
      JSON.parse(proposal.previous) as Evidence,
      fieldLabel,
      t("inspection"),
    );
    const next = evidenceValues(
      JSON.parse(proposal.next) as Evidence,
      fieldLabel,
      t("inspection"),
    );
    const changed = Object.keys(next).filter((key) => next[key] !== old[key]);
    return (
      <details className="grid gap-2">
        <summary className="cursor-pointer py-2 text-sm font-medium">
          {t("evidenceDetails", { count: changed.length })}
        </summary>
        <dl className="grid gap-3 py-2">
          {changed.map((key) => (
            <div key={key} className="grid min-w-0 gap-1">
              <dt className="text-sm font-medium">{key}</dt>
              <dd className="grid gap-1 break-words text-sm">
                {old[key] ? (
                  <span className="text-muted-foreground">
                    {t("current")}: {old[key]}
                  </span>
                ) : null}
                <span>
                  {t("extracted")}: {next[key]}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </details>
    );
  }
  return {
    canStart: Boolean(scooterId && files.length && onApply),
    running: analysis.running,
    start: () => {
      if (disabled || analysis.running || !scooterId || !onApply) return;
      setBaseline(structuredClone(form.getValues()));
      setChoices({});
      setApplied(false);
      setOpen(true);
      void analysis.run();
    },
    content: (
      <>
        {applied ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t("applied")}
          </p>
        ) : null}
        <BottomSheet
          open={open}
          onOpenChange={(next) => {
            if (!next) analysis.cancel();
            setOpen(next);
          }}
        >
          <BottomSheetContent className="lg:w-document-editor lg:max-w-document-editor">
            <BottomSheetHeader>
              <BottomSheetTitle>{t("title")}</BottomSheetTitle>
              <BottomSheetDescription>
                {t("description")}
              </BottomSheetDescription>
            </BottomSheetHeader>
            <BottomSheetBody className="grid gap-4">
              {analysis.running ? (
                <p role="status" className="text-sm">
                  {t("progress", {
                    done: finished,
                    total: Object.keys(analysis.entries).length,
                  })}
                </p>
              ) : null}
              {failures.length ? (
                <div role="alert" className="grid gap-2 text-sm">
                  <p>{t("partialFailure")}</p>
                  {failures.map(([sourceId]) => sourceLink(sourceId))}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={analysis.running || disabled}
                    onClick={() => {
                      void analysis.run(failures.map(([sourceId]) => sourceId));
                    }}
                  >
                    {t("retryFailed")}
                  </Button>
                </div>
              ) : null}
              {review.rejected.length ? (
                <div role="alert" className="grid gap-2 text-sm text-warning">
                  <p>{t("vinMismatch")}</p>
                  {review.rejected.map(sourceLink)}
                </div>
              ) : null}
              {!analysis.running && !review.result.ok ? (
                <p role="alert" className="text-sm text-warning">
                  {t("needsReview")}
                </p>
              ) : !analysis.running &&
                review.result.ok &&
                (review.result.unresolved.length ||
                  review.result.emptyConflicts.length ||
                  review.result.unmatchedBrand) ? (
                <p role="status" className="text-sm text-warning">
                  {t("needsReview")}{" "}
                  {[
                    ...new Set([
                      ...review.result.unresolved,
                      ...review.result.emptyConflicts,
                      ...review.result.unresolvedRawFields,
                    ]),
                  ]
                    .map(fieldLabel)
                    .join(", ")}
                </p>
              ) : null}
              {!analysis.running &&
              !review.proposals.length &&
              !failures.length &&
              !review.rejected.length &&
              review.result.ok &&
              !review.result.unresolved.length &&
              !review.result.emptyConflicts.length &&
              !review.result.unmatchedBrand ? (
                <p role="status" className="text-sm">
                  {t("noChanges")}
                </p>
              ) : null}
              {review.proposals.length ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {t("found", {
                    additions: review.proposals.filter(
                      (proposal) => !proposal.previous || proposal.preselected,
                    ).length,
                    differences: review.proposals.filter(
                      (proposal) => proposal.previous && !proposal.preselected,
                    ).length,
                  })}
                </p>
              ) : null}
              <ul className="grid divide-y divide-border">
                {review.proposals.map((proposal, index) => (
                  <li key={proposal.id} className="grid min-w-0 gap-3 py-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={`${id}-${index}`}
                        checked={checked(proposal)}
                        disabled={
                          analysis.running || disabled || proposal.blocked
                        }
                        onCheckedChange={(value) =>
                          setChoices((previous) => ({
                            ...previous,
                            [proposal.id]: {
                              previous: proposal.previous,
                              next: proposal.next,
                              checked: value,
                            },
                          }))
                        }
                      />
                      <div className="grid min-w-0 flex-1 gap-2">
                        <Label htmlFor={`${id}-${index}`}>
                          {proposal.kind === "document"
                            ? t("documentEvidence", { name: proposal.field })
                            : proposal.kind === "raw"
                              ? t("rawField", { field: proposal.field })
                              : fieldLabel(proposal.field)}
                        </Label>
                        {proposal.kind === "document" ? (
                          evidenceDiff(proposal)
                        ) : (
                          <dl className="grid gap-2 text-sm sm:grid-cols-2">
                            <div>
                              <dt className="text-muted-foreground">
                                {t("current")}
                              </dt>
                              <dd className="break-words">
                                {displayValue(proposal, proposal.previous)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                {t("extracted")}
                              </dt>
                              <dd className="break-words">
                                {displayValue(proposal, proposal.next)}
                              </dd>
                            </div>
                          </dl>
                        )}
                        <div className="grid gap-1">
                          {proposal.sourceIds.map(sourceLink)}
                        </div>
                        {proposal.blocked ? (
                          <p className="text-sm text-warning">
                            {t("needsReview")}
                          </p>
                        ) : null}
                        {proposal.field === "civIssuedAt" ? (
                          <p className="text-sm text-muted-foreground">
                            {t("initialItpHint")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {review.proposals.some(
                (proposal) => proposal.kind === "document",
              ) ? (
                <p className="text-sm text-muted-foreground">
                  {t("evidenceHint")}
                </p>
              ) : null}
            </BottomSheetBody>
            <BottomSheetFooter className="block p-0">
              <FormActions>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    analysis.cancel();
                    setOpen(false);
                  }}
                >
                  {t(analysis.running ? "cancelAnalysis" : "close")}
                </Button>
                <SaveButton
                  type="button"
                  disabled={
                    analysis.running ||
                    disabled ||
                    !selected.length ||
                    !review.result.ok
                  }
                  idleLabel={t("apply", { count: selected.length })}
                  pendingLabel={t("applying")}
                  successLabel={t("applied")}
                  onClick={() => {
                    if (
                      analysis.running ||
                      disabled ||
                      !onApply ||
                      !review.result.ok
                    )
                      return;
                    // Compute again against live form values at the actual click boundary.
                    const fresh = reextractionReview(
                      analyses,
                      files,
                      brands,
                      form.getValues(),
                      baseline,
                      rawFields,
                      (field) => form.getFieldState(field).isDirty,
                    );
                    const selection = Object.fromEntries(
                      selected.map((proposal) => [
                        proposal.id,
                        { previous: proposal.previous, next: proposal.next },
                      ]),
                    );
                    const result = selectedReextraction(
                      fresh.proposals,
                      selection,
                      rawFields,
                      fresh.evidence ?? {},
                      files,
                      form.getValues(),
                    );
                    onApply(result);
                    setApplied(true);
                    setOpen(false);
                  }}
                />
              </FormActions>
            </BottomSheetFooter>
          </BottomSheetContent>
        </BottomSheet>
      </>
    ),
  };
}
