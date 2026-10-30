"use client";

import {
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CameraIcon,
  FilesIcon,
  ImagesIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useObjectUrl } from "../hooks/use-object-url";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
} from "./bottom-sheet";
import { Button } from "./button";
import { SaveButton } from "./save-button";
import { FormActions } from "./form-actions";
import { DocumentViewer } from "./document-viewer";

export type AttachmentPickerLabels = {
  title: string;
  close: string;
  takePhoto: string;
  gallery: string;
  files: string;
  addMore: string;
  review: string;
  replace: string;
  remove: string;
  preview: string;
  moveEarlier: string;
  moveLater: string;
  empty: string;
  confirming: string;
  confirmed: string;
  invalidFile: string;
  fileTooLarge: string;
  tooManyFiles: (max: number) => string;
  selectedCount: (count: number, max: number) => string;
  confirm: (count: number) => string;
};

export type AttachmentPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (files: File[]) => void | false | Promise<void | false>;
  maxFiles: number;
  maxFileSize: number;
  accept: string;
  sources?: readonly ("camera" | "gallery" | "files")[];
  labels: AttachmentPickerLabels;
  validate?: (file: File) => string | null;
  /** Optional crop/rotate and preview labels; feature logic stays in the caller. */
  viewerProps: Partial<ComponentProps<typeof DocumentViewer>> &
    Pick<
      ComponentProps<typeof DocumentViewer>,
      "openFileLabel" | "pdfLabels" | "zoomLabels" | "actionsLabel"
    >;
  allowCrop?: boolean;
  /** Empty-selection fallback, such as entering an expense without a receipt. */
  secondaryAction?: { label: string; icon?: ReactNode; onClick: () => void };
};

/** Native camera/import with provisional review. Only confirmation commits the files. */
export function AttachmentPicker(props: AttachmentPickerProps) {
  return props.open ? <AttachmentPickerSession {...props} /> : null;
}

function AttachmentPickerSession({
  onOpenChange,
  onConfirm,
  maxFiles,
  maxFileSize,
  accept,
  sources = ["camera", "gallery", "files"],
  labels,
  validate,
  viewerProps,
  allowCrop = true,
  secondaryAction,
}: AttachmentPickerProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [replacement, setReplacement] = useState<number | null>(null);
  const [choosing, setChoosing] = useState(true);
  const running = useRef(false);
  const requestedReplacement = useRef<number | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const preview = previewIndex === null ? undefined : files[previewIndex];
  const atLimit = files.length >= maxFiles && replacement === null;

  function check(file: File) {
    if (!file.size || !matchesAccept(file, accept)) return labels.invalidFile;
    if (file.size > maxFileSize) return labels.fileTooLarge;
    return validate?.(file) ?? null;
  }
  function receive(incoming: File[]) {
    if (running.current || !incoming.length) return;
    const target = requestedReplacement.current;
    requestedReplacement.current = null;
    if (target !== null && incoming.length !== 1) {
      setError(labels.tooManyFiles(1));
      return;
    }
    if (
      (target === null ? files.length + incoming.length : files.length) >
      maxFiles
    ) {
      setError(labels.tooManyFiles(maxFiles));
      return;
    }
    for (const file of incoming) {
      const problem = check(file);
      if (problem) {
        setError(`${file.name}: ${problem}`);
        return;
      }
    }
    setFiles((current) =>
      target === null
        ? [...current, ...incoming]
        : current.map((file, index) =>
            index === target ? incoming[0]! : file,
          ),
    );
    setReplacement(null);
    setChoosing(false);
    setError(null);
  }
  function choose(ref: { current: HTMLInputElement | null }) {
    requestedReplacement.current = replacement;
    ref.current?.click();
  }
  function move(index: number, offset: number) {
    setFiles((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [
        next[index + offset]!,
        next[index]!,
      ];
      return next;
    });
  }
  async function confirm() {
    if (running.current || !files.length || replacement !== null) return;
    if (files.length > maxFiles) {
      setError(labels.tooManyFiles(maxFiles));
      return;
    }
    for (const file of files) {
      const problem = check(file);
      if (problem) {
        setError(problem);
        return;
      }
    }
    running.current = true;
    setPending(true);
    setError(null);
    try {
      if ((await onConfirm(files)) !== false) onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : labels.invalidFile);
    } finally {
      running.current = false;
      setPending(false);
    }
  }
  const nativeInput = (
    ref: { current: HTMLInputElement | null },
    inputAccept: string,
    label: string,
    capture?: "environment",
  ) => (
    <input
      ref={ref}
      type="file"
      hidden
      aria-label={label}
      accept={inputAccept}
      capture={capture}
      multiple={!capture && maxFiles > 1 && replacement === null}
      disabled={pending}
      onChange={(event) => {
        const incoming = Array.from(event.target.files ?? []);
        event.target.value = "";
        receive(incoming);
      }}
    />
  );
  return (
    <>
      {nativeInput(camera, "image/*", labels.takePhoto, "environment")}
      {nativeInput(
        gallery,
        accept
          .split(",")
          .filter((value) => value.trim().startsWith("image/"))
          .join(",") || "image/*",
        labels.gallery,
      )}
      {nativeInput(fileInput, accept, labels.files)}
      <BottomSheet
        open
        onOpenChange={(open) => {
          if (!running.current) onOpenChange(open);
        }}
      >
        <BottomSheetContent>
          <BottomSheetHeader className="flex-row items-center justify-between gap-3">
            <BottomSheetTitle id={titleId}>{labels.title}</BottomSheetTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={labels.close}
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </BottomSheetHeader>
          <BottomSheetBody className="gap-4">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {replacement === null
                ? labels.selectedCount(files.length, maxFiles)
                : `${labels.replace}: ${files[replacement]?.name}`}
            </p>
            {choosing || !files.length || replacement !== null ? (
              <div className="flex flex-col gap-2">
                {sources.includes("camera") ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending || atLimit}
                    onClick={() => choose(camera)}
                  >
                    <CameraIcon aria-hidden="true" />
                    {labels.takePhoto}
                  </Button>
                ) : null}
                {sources.includes("gallery") ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending || atLimit}
                    onClick={() => choose(gallery)}
                  >
                    <ImagesIcon aria-hidden="true" />
                    {labels.gallery}
                  </Button>
                ) : null}
                {sources.includes("files") ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending || atLimit}
                    onClick={() => choose(fileInput)}
                  >
                    <FilesIcon aria-hidden="true" />
                    {labels.files}
                  </Button>
                ) : null}
                {files.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setReplacement(null);
                      setChoosing(false);
                    }}
                  >
                    {labels.review}
                  </Button>
                ) : null}
              </div>
            ) : files.length < maxFiles ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setChoosing(true)}
              >
                <PlusIcon aria-hidden="true" />
                {labels.addMore}
              </Button>
            ) : null}
            {!files.length ? (
              <p className="text-sm text-muted-foreground">{labels.empty}</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {files.map((file, index) => (
                  <li
                    key={`${index}:${file.name}`}
                    className="flex flex-col gap-2 rounded-lg border border-border p-3"
                  >
                    <AttachmentPreview
                      file={file}
                      label={labels.preview}
                      disabled={pending}
                      onClick={() => setPreviewIndex(index)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`${labels.replace}: ${file.name}`}
                        disabled={pending}
                        onClick={() => {
                          setReplacement(index);
                          setChoosing(true);
                          setError(null);
                        }}
                      >
                        <PencilIcon aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="secondary-destructive"
                        size="icon"
                        aria-label={`${labels.remove}: ${file.name}`}
                        disabled={pending}
                        onClick={() => {
                          setFiles((current) =>
                            current.filter((_, i) => i !== index),
                          );
                          setReplacement(null);
                          setError(null);
                        }}
                      >
                        <Trash2Icon aria-hidden="true" />
                      </Button>
                      {maxFiles > 1 ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`${labels.moveEarlier}: ${file.name}`}
                            disabled={
                              pending || index === 0 || replacement !== null
                            }
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUpIcon aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`${labels.moveLater}: ${file.name}`}
                            disabled={
                              pending ||
                              index === files.length - 1 ||
                              replacement !== null
                            }
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDownIcon aria-hidden="true" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </BottomSheetBody>
          <BottomSheetFooter>
            <FormActions pending={pending}>
              <SaveButton
                type="button"
                state={pending ? "pending" : error ? "error" : "idle"}
                idleLabel={labels.confirm(files.length)}
                pendingLabel={labels.confirming}
                successLabel={labels.confirmed}
                disabled={pending || !files.length || replacement !== null}
                onClick={() => void confirm()}
              />
              {secondaryAction && !files.length ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={secondaryAction.onClick}
                >
                  {secondaryAction.icon}
                  {secondaryAction.label}
                </Button>
              ) : null}
            </FormActions>
          </BottomSheetFooter>
        </BottomSheetContent>
      </BottomSheet>
      {preview && viewerProps ? (
        <DocumentViewer
          {...viewerProps}
          open
          file={preview}
          title={preview.name}
          imageAlt={preview.name}
          closeLabel={viewerProps.closeLabel ?? labels.close}
          onOpenChange={(open) => {
            if (!open) setPreviewIndex(null);
          }}
          onCrop={
            allowCrop && preview.type.startsWith("image/")
              ? (file) => {
                  const problem = check(file);
                  if (problem) throw new Error(problem);
                  setFiles((current) =>
                    current.map((value, index) =>
                      index === previewIndex ? file : value,
                    ),
                  );
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}

function AttachmentPreview({
  file,
  label,
  disabled,
  onClick,
}: {
  file: File;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const url = useObjectUrl(file);
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      className="h-auto justify-start gap-3 text-left"
      aria-label={`${label}: ${file.name}`}
    >
      {file.type.startsWith("image/") && url ? (
        <img
          src={url}
          alt=""
          className="size-16 shrink-0 rounded object-cover"
        />
      ) : (
        <FilesIcon aria-hidden="true" className="size-8" />
      )}
      <span className="min-w-0 wrap-anywhere">{file.name}</span>
    </Button>
  );
}

function matchesAccept(file: File, accept: string) {
  return accept.split(",").some((entry) => {
    const type = entry.trim().toLowerCase();
    return type.startsWith(".")
      ? file.name.toLowerCase().endsWith(type)
      : type.endsWith("/*")
        ? file.type.startsWith(type.slice(0, -1))
        : file.type === type;
  });
}
