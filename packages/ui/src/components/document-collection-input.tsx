"use client";

import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useObjectUrl } from "../hooks/use-object-url";
import { Button } from "./button";
import type {
  DocumentCollectionLabels,
  DocumentInputItem,
} from "./document-input";
import { FileDropOverlay } from "./file-drop-overlay";
import { useFileDrop } from "../hooks/use-file-drop";
import { DocumentPreview } from "./document-preview";
import { DocumentViewer } from "./document-viewer";

export type DocumentCollectionInputProps = {
  multiple: true;
  id?: string;
  values: DocumentInputItem[];
  onConfirm: (files: File[]) => void;
  onReplace: (id: string, file: File) => void;
  onRemove: (id: string) => void;
  validate: (file: File) => string | null;
  maxFiles?: number;
  accept: string;
  disabled?: boolean;
  labels: DocumentCollectionLabels;
};

/** A collection shares one card; native selections stay provisional until Save. */
export function DocumentCollectionInput({
  id,
  values,
  onConfirm,
  onReplace,
  onRemove,
  validate,
  maxFiles,
  accept,
  disabled,
  labels,
}: DocumentCollectionInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const replacementInput = useRef<HTMLInputElement>(null);
  const replacementId = useRef<string | null>(null);
  const sequence = useRef(0);
  const [open, setOpen] = useState(false);
  const [documentDirection, setDocumentDirection] = useState<-1 | 1>();
  const [initialPdfPage, setInitialPdfPage] = useState<"first" | "last">(
    "first",
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<DocumentInputItem[]>([]);
  const [replacements, setReplacements] = useState<Record<string, File>>({});
  const [error, setError] = useState<string | null>(null);
  const items = [
    ...values.map((item) => {
      const file = replacements[item.id];
      return file
        ? { id: item.id, file, fileName: file.name, contentType: file.type }
        : item;
    }),
    ...pending,
  ];
  const foundIndex = items.findIndex((item) => item.id === activeId);
  const activeIndex = foundIndex < 0 ? 0 : foundIndex;
  const active = items[activeIndex];
  const cover = values[0];
  const coverUrl = useObjectUrl(cover?.file ?? null);
  const activeUrl = useObjectUrl(open ? (active?.file ?? null) : null);
  const coverSrc = cover?.src ?? coverUrl;
  const activeSrc = active?.src ?? activeUrl;
  const atLimit = maxFiles !== undefined && items.length >= maxFiles;
  const failed = values.find((item) => item.uploadError);
  const status = values.find((item) => item.status)?.status;

  function moveDocument(direction: -1 | 1) {
    const item = items[activeIndex + direction];
    if (!item) return;
    setDocumentDirection(direction);
    setInitialPdfPage(direction < 0 ? "last" : "first");
    setActiveId(item.id);
    setError(null);
  }

  function close() {
    setDocumentDirection(undefined);
    setInitialPdfPage("first");
    setOpen(false);
    setPending([]);
    setReplacements({});
    setError(null);
    replacementId.current = null;
  }

  function validationError(files: File[], total: number) {
    if (maxFiles !== undefined && total > maxFiles) {
      return labels.tooManyFiles(maxFiles);
    }
    for (const file of files) {
      const problem = validate(file);
      if (problem) return `${file.name}: ${problem}`;
    }
    return null;
  }

  function add(files: File[]) {
    if (disabled || files.length === 0) return;
    const problem = validationError(files, items.length + files.length);
    setError(problem);
    if (problem) return;
    const additions = files.map((file) => ({
      id: `pending-document-${++sequence.current}`,
      file,
      fileName: file.name,
      contentType: file.type,
    }));
    setPending((current) => [...current, ...additions]);
    setActiveId(additions[0]!.id);
    setOpen(true);
  }

  function replace(file: File | undefined) {
    const targetId = replacementId.current;
    if (
      disabled ||
      !file ||
      !targetId ||
      !items.some((item) => item.id === targetId)
    )
      return;
    const problem = validationError([file], items.length);
    setError(problem);
    if (problem) return;
    if (pending.some((item) => item.id === targetId)) {
      setPending((current) =>
        current.map((item) =>
          item.id === targetId
            ? { ...item, file, fileName: file.name, contentType: file.type }
            : item,
        ),
      );
    } else {
      setReplacements((current) => ({ ...current, [targetId]: file }));
    }
  }

  function remove() {
    if (!active || disabled) return;
    const remaining = items.filter((item) => item.id !== active.id);
    if (pending.some((item) => item.id === active.id)) {
      setPending((current) => current.filter((item) => item.id !== active.id));
    } else {
      setReplacements((current) => {
        const next = { ...current };
        delete next[active.id];
        return next;
      });
      onRemove(active.id);
    }
    setError(null);
    if (remaining.length === 0) close();
    else
      setActiveId(remaining[Math.min(activeIndex, remaining.length - 1)]!.id);
  }

  function save() {
    if (disabled) return;
    // Ignore replacements for attachments removed externally while the viewer was open.
    const changed = values.flatMap((item) => {
      const file = replacements[item.id];
      return file ? [{ id: item.id, file }] : [];
    });
    const additions = pending.map((item) => item.file!);
    const problem = validationError(
      [...changed.map((item) => item.file), ...additions],
      items.length,
    );
    setError(problem);
    if (problem) return;
    for (const item of changed) onReplace(item.id, item.file);
    if (additions.length) onConfirm(additions);
    close();
  }

  const { dragging, handlers } = useFileDrop({
    disabled,
    onFiles: add,
  });
  const addButton = (className?: string) => (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      className={className}
      aria-label={labels.addMore}
      disabled={disabled || atLimit}
      onClick={() => input.current?.click()}
    >
      <PlusIcon aria-hidden="true" className="size-6" />
    </Button>
  );

  return (
    <div
      data-slot="document-input"
      data-multiple="true"
      className="min-w-0"
      {...handlers}
    >
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        aria-label={cover ? labels.addMore : labels.add}
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          add(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <input
        ref={replacementInput}
        type="file"
        className="hidden"
        aria-label={labels.change}
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          replace(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <div className="relative">
        {dragging ? (
          <FileDropOverlay label={labels.add} className="rounded-lg" />
        ) : null}
        <DocumentPreview
          id={id}
          src={coverSrc}
          fileName={cover?.fileName}
          contentType={cover?.contentType}
          label={labels.label}
          triggerLabel={cover ? labels.preview : labels.add}
          imageAlt={cover?.fileName ?? labels.imageAlt}
          title={cover?.fileName ?? labels.title}
          closeLabel={labels.close}
          openFileLabel={labels.openFile}
          actionsLabel={labels.actions}
          pdfLabels={labels}
          zoomLabels={labels}
          open={false}
          onOpenChange={() => {
            setActiveId(cover?.id ?? null);
            setOpen(true);
          }}
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
          uploaded={values.length > 0 && values.every((item) => item.uploaded)}
          status={status}
          countLabel={
            values.length ? labels.documentCount(values.length) : undefined
          }
        />
        {cover ? addButton("absolute top-1 right-1") : null}
        {failed ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 rounded-b-lg bg-popover p-2 text-popover-foreground">
            <p role="alert" className="min-w-0 text-sm text-destructive">
              {failed.fileName}: {failed.uploadError}
            </p>
            {failed.onRetry ? (
              <Button
                type="button"
                variant="text"
                disabled={disabled}
                onClick={failed.onRetry}
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
        open={open && Boolean(active)}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        entryDirection={documentDirection}
        initialPdfPage={initialPdfPage}
        onPrevious={activeIndex > 0 ? () => moveDocument(-1) : undefined}
        onNext={
          activeIndex < items.length - 1 ? () => moveDocument(1) : undefined
        }
        src={activeSrc}
        contentType={active?.contentType}
        fileName={active?.fileName}
        title={active?.fileName ?? labels.title}
        imageAlt={active?.fileName ?? labels.imageAlt}
        closeLabel={labels.close}
        openFileLabel={labels.openFile}
        actionsLabel={labels.actions}
        pdfLabels={labels}
        zoomLabels={labels}
        onChange={() => {
          replacementId.current = active?.id ?? null;
          replacementInput.current?.click();
        }}
        changeLabel={labels.change}
        onRemove={remove}
        removeLabel={labels.remove}
        onSave={save}
        saveLabel={labels.save}
        disabled={disabled}
        error={error ?? active?.uploadError}
        navigation={
          <div
            data-slot="document-navigation"
            className="flex items-center justify-between gap-2"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={labels.previousDocument}
              disabled={activeIndex === 0}
              onClick={() => {
                moveDocument(-1);
              }}
            >
              <ChevronLeftIcon aria-hidden="true" className="size-5" />
            </Button>
            <p
              aria-live="polite"
              className="min-w-0 flex-1 text-center text-sm"
            >
              {labels.documentPosition(activeIndex + 1, items.length)}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={labels.nextDocument}
              disabled={activeIndex >= items.length - 1}
              onClick={() => {
                moveDocument(1);
              }}
            >
              <ChevronRightIcon aria-hidden="true" className="size-5" />
            </Button>
            {addButton()}
          </div>
        }
        footer={
          active?.uploadError && active.onRetry ? (
            <Button
              type="button"
              variant="text"
              disabled={disabled}
              onClick={active.onRetry}
            >
              {labels.retry}
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
