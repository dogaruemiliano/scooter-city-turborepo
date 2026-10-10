"use client";

import { useRef, useState } from "react";
import { useObjectUrl } from "../hooks/use-object-url";
import { Button } from "./button";
import { DocumentPreview } from "./document-preview";
import { DocumentViewer } from "./document-viewer";
import {
  DocumentCollectionInput,
  type DocumentCollectionInputProps,
} from "./document-collection-input";
import type { DocumentZoomLabels } from "./document-zoom";
import type { PdfPreviewLabels } from "./pdf-preview";

export type DocumentInputValue = {
  fileName: string;
  contentType: string;
  src?: string | null;
  file?: File;
};
export type DocumentInputLabels = DocumentZoomLabels &
  PdfPreviewLabels & {
    label: string;
    add: string;
    addAction?: string;
    preview: string;
    title: string;
    imageAlt: string;
    close: string;
    change: string;
    save: string;
    openFile: string;
    actions: string;
    remove: string;
    retry: string;
  };

export type DocumentInputItem = DocumentInputValue & {
  id: string;
  uploaded?: boolean;
  status?: string;
  uploadError?: string;
  onRetry?: () => void;
};

export type DocumentCollectionLabels = DocumentInputLabels & {
  addMore: string;
  previousDocument: string;
  nextDocument: string;
  documentCount: (count: number) => string;
  documentPosition: (index: number, total: number) => string;
  tooManyFiles: (max: number) => string;
};

type SingleDocumentInputProps = {
  multiple?: false;
  id?: string;
  value?: DocumentInputValue;
  onConfirm: (file: File) => void;
  onRemove?: () => void;
  uploadError?: string;
  onRetry?: () => void;
  validate: (file: File) => string | null;
  accept: string;
  disabled?: boolean;
  uploaded?: boolean;
  status?: string;
  labels: DocumentInputLabels;
};

export type DocumentInputProps =
  | SingleDocumentInputProps
  | DocumentCollectionInputProps;

export function DocumentInput(props: DocumentInputProps) {
  return props.multiple ? (
    <DocumentCollectionInput {...props} />
  ) : (
    <SingleDocumentInput {...props} />
  );
}

/** Native picker → provisional preview → explicit confirmation. No upload on selection. */
function SingleDocumentInput({
  id,
  value,
  onConfirm,
  onRemove,
  uploadError,
  onRetry,
  validate,
  accept,
  disabled,
  uploaded,
  status,
  labels,
}: SingleDocumentInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUrl = useObjectUrl(value?.file ?? null);
  const pendingUrl = useObjectUrl(pending);
  const src = value?.src ?? currentUrl;
  function select(file: File | undefined) {
    if (!file || disabled) return;
    const problem = validate(file);
    setError(problem);
    if (problem) return;
    setPending(file);
    setOpen(true);
  }
  function close() {
    setOpen(false);
    setPending(null);
    setError(null);
  }
  const picker = (
    <input
      ref={input}
      type="file"
      className="hidden"
      aria-label={value ? labels.change : labels.add}
      accept={accept}
      disabled={disabled}
      onChange={(event) => {
        select(event.target.files?.[0]);
        event.target.value = "";
      }}
    />
  );
  return (
    <div
      data-slot="document-input"
      className="min-w-0"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        select(event.dataTransfer.files[0]);
      }}
    >
      {picker}
      <div className="relative">
        <DocumentPreview
          id={id}
          src={src}
          fileName={value?.fileName}
          contentType={value?.contentType}
          label={labels.label}
          triggerLabel={value ? labels.preview : labels.add}
          imageAlt={labels.imageAlt}
          title={labels.title}
          closeLabel={labels.close}
          openFileLabel={labels.openFile}
          actionsLabel={labels.actions}
          pdfLabels={labels}
          zoomLabels={labels}
          open={false}
          onOpenChange={setOpen}
          onEmptyClick={() => input.current?.click()}
          emptyLabel={
            labels.addAction ? (
              <>
                <span className="block">{labels.addAction}</span>
                <span className="block">{labels.label}</span>
              </>
            ) : (
              labels.add
            )
          }
          disabled={disabled}
          uploaded={uploaded}
          status={status}
        />
        {uploadError ? (
          <div
            data-slot="document-upload-error"
            className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 rounded-b-lg bg-popover p-2 text-popover-foreground"
          >
            <p role="alert" className="text-sm text-destructive">
              {uploadError}
            </p>
            {onRetry ? (
              <Button
                type="button"
                variant="text"
                disabled={disabled}
                onClick={onRetry}
              >
                {labels.retry}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {error && !open ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DocumentViewer
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        src={pending ? pendingUrl : src}
        contentType={pending?.type ?? value?.contentType}
        fileName={pending?.name ?? value?.fileName}
        title={
          pending && value?.fileName === labels.title
            ? pending.name
            : labels.title
        }
        imageAlt={labels.imageAlt}
        closeLabel={labels.close}
        openFileLabel={labels.openFile}
        actionsLabel={labels.actions}
        pdfLabels={labels}
        zoomLabels={labels}
        onChange={() => input.current?.click()}
        changeLabel={labels.change}
        removeLabel={labels.remove}
        onRemove={
          pending || onRemove
            ? () => {
                if (!pending) onRemove?.();
                close();
              }
            : undefined
        }
        saveLabel={labels.save}
        disabled={disabled}
        error={error}
        onSave={() => {
          if (pending) {
            const problem = validate(pending);
            if (problem) {
              setError(problem);
              return;
            }
            onConfirm(pending);
          }
          close();
        }}
      />
    </div>
  );
}
