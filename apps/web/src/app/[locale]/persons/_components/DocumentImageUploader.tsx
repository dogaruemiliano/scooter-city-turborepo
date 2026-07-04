"use client";

import { CheckIcon, ImagePlusIcon, PencilIcon } from "lucide-react";
import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { Badge, Input, Label } from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";

type DocumentImageUploaderProps = {
  accept: string;
  action?: ReactNode;
  addLabel: string;
  alt: string;
  disabled?: boolean;
  formatsLabel?: string;
  imageUrl?: string | null;
  inputId: string;
  missingLabel: string;
  onFileSelected: (file: File | null) => void;
  replaceLabel: string;
  slotLabel: string;
  uploadLabel: string;
};

export function DocumentImageUploader({
  accept,
  action,
  addLabel,
  alt,
  disabled = false,
  formatsLabel,
  imageUrl,
  inputId,
  missingLabel,
  onFileSelected,
  replaceLabel,
  slotLabel,
  uploadLabel,
}: DocumentImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasImage = Boolean(imageUrl);

  const handleKeyDown = (event: KeyboardEvent<HTMLLabelElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div className="relative min-w-0">
      <Input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          onFileSelected(event.target.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />
      <Label
        htmlFor={inputId}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={uploadLabel}
        onKeyDown={handleKeyDown}
        onDragOver={(event) => {
          if (!disabled) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (disabled) {
            return;
          }

          onFileSelected(event.dataTransfer.files?.[0] ?? null);
        }}
        className={cn(
          "group relative flex h-40 cursor-pointer overflow-hidden rounded-lg border border-border bg-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          !hasImage && "border-dashed bg-muted/40 hover:bg-muted",
          hasImage && "hover:border-primary/60",
          disabled && "pointer-events-none cursor-not-allowed opacity-60",
        )}
      >
        {hasImage && imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- previews use object URLs or protected API image URLs.
          <img
            src={imageUrl}
            alt={alt}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
            <ImagePlusIcon
              className="size-7 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-foreground">
              {addLabel}
            </span>
            {formatsLabel ? (
              <span className="text-xs text-muted-foreground">
                {formatsLabel}
              </span>
            ) : null}
          </span>
        )}

        <span className="absolute left-2 top-2">
          <Badge variant={hasImage ? "secondary" : "outline"} className="gap-1">
            {hasImage ? (
              <CheckIcon className="size-3" aria-hidden="true" />
            ) : null}
            {hasImage ? slotLabel : missingLabel}
          </Badge>
        </span>

        {hasImage ? (
          <span className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 rounded-md bg-background/95 px-2 py-1 text-xs font-medium text-foreground shadow-sm">
            <span className="min-w-0 truncate">{replaceLabel}</span>
            <PencilIcon
              className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
              aria-hidden="true"
            />
          </span>
        ) : null}
      </Label>
      {action ? <div className="absolute right-2 top-2">{action}</div> : null}
    </div>
  );
}
