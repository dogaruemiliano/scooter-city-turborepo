"use client";

import { useEffect, useRef, useState } from "react";
import { PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { aspectRatio } from "@repo/theme";
import { AddAction } from "./add-action";
import { Button } from "./button";
import { ImageEditor, type ImageEditorLabels } from "./image-editor";
import { ImageGallery } from "./image-gallery";
import type { ImageViewerLabels } from "./image-viewer";

type Preview = {
  id: string;
  file: File;
  src: string;
  alt: string;
  fileName: string;
};

/** Local image collection editor; callers own validation, files and uploading. */
export function ImageGalleryEditor({
  files,
  onChange,
  disabled = false,
  title,
  accept,
  maxFiles,
  maxFileSize,
  labels,
  onBusyChange,
  onAdd,
}: {
  /** Optional shared picker supplied by the feature. */
  onAdd?: () => void;
  files: readonly File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  title: string;
  accept: string;
  maxFiles: number;
  maxFileSize: number;
  labels: {
    add: string;
    edit: string;
    remove: string;
    instructions: string;
    deleteDrop: string;
    deleteDropActive: string;
    open: (name: string) => string;
    viewer: ImageViewerLabels;
    editor: ImageEditorLabels;
  };
  onBusyChange?: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [editing, setEditing] = useState<File | null>(null);
  const [sorting, setSorting] = useState(false);
  const busy = disabled || sorting || editing !== null;
  useEffect(() => {
    onBusyChange?.(sorting || editing !== null);
    return () => onBusyChange?.(false);
  }, [sorting, editing, onBusyChange]);
  useEffect(() => {
    const next = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      src: URL.createObjectURL(file),
      alt: file.name,
      fileName: file.name,
    }));
    setPreviews(next);
    return () => {
      for (const photo of next) URL.revokeObjectURL(photo.src);
    };
  }, [files]);
  function remove(photo: Preview) {
    onChange(files.filter((file) => file !== photo.file));
  }
  return (
    <div
      data-slot="image-gallery-editor"
      className="flex min-w-0 flex-col gap-3"
    >
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept={accept}
        aria-label={labels.add}
        disabled={busy}
        onChange={(event) => {
          const added = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (added.length) onChange([...files, ...added]);
        }}
      />
      <ImageGallery
        items={previews}
        images={previews}
        title={title}
        labels={labels.viewer}
        instructions={labels.instructions}
        disabled={disabled || editing !== null}
        onInteractionChange={setSorting}
        className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3"
        getItemLabel={(photo) => labels.open(photo.fileName)}
        onOrderChange={async (ids) => {
          onChange(
            ids.map((id) => previews.find((photo) => photo.id === id)!.file),
          );
          return true;
        }}
        removal={
          previews.length
            ? {
                label: labels.deleteDrop,
                activeLabel: labels.deleteDropActive,
                onRemove: async (photo) => {
                  remove(photo);
                  return true;
                },
              }
            : undefined
        }
        renderItem={(photo) => (
          <div className="relative">
            {/* Local object URLs do not need an image optimization service. */}
            <img
              src={photo.src}
              alt={photo.alt}
              draggable={false}
              style={{ aspectRatio: aspectRatio.scooterPhoto }}
              className="block w-full bg-muted object-cover"
            />
            <div className="absolute inset-x-2 top-2 flex justify-between gap-2">
              <Button
                type="button"
                size="icon"
                variant="secondary"
                disabled={busy}
                aria-label={`${labels.edit}: ${photo.fileName}`}
                onClick={() => setEditing(photo.file)}
              >
                <PencilIcon aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                disabled={busy}
                aria-label={`${labels.remove}: ${photo.fileName}`}
                onClick={() => remove(photo)}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      >
        {files.length < maxFiles ? (
          <AddAction
            text={labels.add}
            icon={<PlusIcon />}
            disabled={busy}
            style={{ aspectRatio: aspectRatio.scooterPhoto }}
            onClick={() => (onAdd ? onAdd() : input.current?.click())}
          />
        ) : null}
      </ImageGallery>
      {editing ? (
        <ImageEditor
          file={editing}
          maxFileSize={maxFileSize}
          labels={labels.editor}
          onCancel={() => setEditing(null)}
          onSave={(file) => {
            onChange(
              files.map((current) => (current === editing ? file : current)),
            );
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
