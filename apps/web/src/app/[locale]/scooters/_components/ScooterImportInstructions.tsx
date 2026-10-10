"use client";

import { motion } from "@repo/theme";
import { Button, Label, Textarea } from "@repo/ui/components";
import { ArrowDownIcon, CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { documentExtractionPrompt } from "./scooter-document-import";

export function ScooterImportInstructions({
  editing,
  disabled,
}: {
  editing: boolean;
  disabled: boolean;
}) {
  const t = useTranslations("scooters");
  const id = useId();
  const [copied, setCopied] = useState(false);
  const [manualPrompt, setManualPrompt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef(0);

  useEffect(
    () => () => {
      request.current += 1;
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  async function copyPrompt() {
    const current = ++request.current;
    const prompt = documentExtractionPrompt(editing, (field) =>
      t(`fields.${field}`),
    );
    try {
      await navigator.clipboard.writeText(prompt);
      if (current !== request.current) return;
      if (timer.current !== null) clearTimeout(timer.current);
      setCopied(true);
      setManualPrompt(null);
      timer.current = setTimeout(() => {
        setCopied(false);
        timer.current = null;
      }, motion.duration.clipboardFeedback);
    } catch {
      if (current !== request.current) return;
      if (timer.current !== null) clearTimeout(timer.current);
      setCopied(false);
      setManualPrompt(prompt);
    }
  }

  return (
    <div data-slot="import-instructions" className="grid gap-3">
      <ol className="list-decimal space-y-6 pl-5 text-sm text-muted-foreground">
        <li>
          <p>{t("documentImport.steps.copy")}</p>
          <div
            data-slot="import-copy-step"
            className="mt-3 grid justify-items-center gap-2"
          >
            <Button
              type="button"
              size="icon"
              variant={copied ? "success" : "secondary"}
              className="size-16 rounded-full motion-reduce:transition-none md:size-16"
              disabled={disabled}
              aria-label={t("documentImport.copyPrompt")}
              title={t("documentImport.copyPrompt")}
              onClick={() => void copyPrompt()}
            >
              {copied ? (
                <CheckIcon aria-hidden="true" className="size-6" />
              ) : (
                <CopyIcon aria-hidden="true" className="size-6" />
              )}
            </Button>
            <p
              role="status"
              aria-atomic="true"
              className={`min-h-5 text-center text-sm ${copied ? "text-success" : "text-muted-foreground"}`}
            >
              {t(
                copied
                  ? "documentImport.copiedShort"
                  : "documentImport.copyPrompt",
              )}
            </p>
          </div>
          {manualPrompt ? (
            <div className="mt-3 grid gap-2">
              <Label htmlFor={id}>{t("documentImport.copyManually")}</Label>
              <Textarea
                id={id}
                value={manualPrompt}
                readOnly
                className="field-sizing-fixed"
                rows={6}
                onFocus={(event) => event.currentTarget.select()}
              />
            </div>
          ) : null}
        </li>
        <li>
          <p>{t("documentImport.steps.extract")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{t("documentImport.steps.documents.civ")}</li>
            <li>{t("documentImport.steps.documents.registration")}</li>
          </ul>
          <p className="mt-2">{t("documentImport.steps.allPages")}</p>
        </li>
        <li>{t("documentImport.steps.return")}</li>
      </ol>
      <ArrowDownIcon
        aria-hidden="true"
        className="size-5 justify-self-center text-muted-foreground"
      />
    </div>
  );
}
