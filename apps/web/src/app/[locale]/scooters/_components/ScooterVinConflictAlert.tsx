"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
} from "@repo/ui/components";
import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { VinReviewDocument } from "./ScooterVinReview";

export function ScooterVinConflictAlert({
  documents,
  vin,
  disabled,
  onReview,
}: {
  documents: VinReviewDocument[];
  vin: string;
  disabled: boolean;
  onReview: () => void;
}) {
  const t = useTranslations("scooters");
  const review = useTranslations("scooters.extraction.vinReview");
  return (
    <Alert variant="warning">
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle>{review("conflictTitle")}</AlertTitle>
      <AlertDescription className="grid min-w-0 gap-3">
        <div>{review("conflictDescription")}</div>
        <div>
          {review("vinLabel")}:{" "}
          <span className="font-mono font-medium select-all">
            {vin || review("unreadable")}
          </span>
        </div>
        <ul className="grid min-w-0 gap-3">
          {documents.map((document) => (
            <li
              key={JSON.stringify([document.sourceId, document.documentId])}
              className="grid min-w-0 gap-1"
            >
              <span className="font-medium wrap-anywhere">
                {document.fileName}
              </span>
              <span>
                {document.documentType
                  ? t(`documents.${document.documentType}`)
                  : null}
                {document.pages?.length
                  ? ` · ${t("workspace.pages", { pages: document.pages.join(", ") })}`
                  : null}
              </span>
              <span>
                {review("extractedVin")}:{" "}
                <span className="font-mono select-all">
                  {document.vin ?? review("unreadable")}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <div>{review("replaceHint")}</div>
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          disabled={disabled}
          onClick={onReview}
        >
          {review("resume")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
