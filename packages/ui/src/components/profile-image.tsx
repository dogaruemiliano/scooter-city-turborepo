"use client";

import { CameraIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "./button";
import { UserAvatar } from "./user-avatar";

type ProfileImageProps = {
  name: string;
  src?: string;
  onRemove?: () => void;
  removeLabel?: string;
} & (
  | { onEdit?: never; addLabel?: never; editLabel?: never; disabled?: never }
  | {
      onEdit: () => void;
      addLabel: string;
      editLabel: string;
      disabled?: boolean;
    }
);

/** Large fixed-size portrait. Image selection and saving belong to the caller. */
export function ProfileImage({
  name,
  src,
  onEdit,
  addLabel,
  editLabel,
  disabled,
  onRemove,
  removeLabel,
}: ProfileImageProps) {
  return (
    <div
      data-slot="profile-image"
      className="relative size-70 min-h-70 min-w-70 shrink-0"
    >
      {onEdit && !src ? (
        <Button
          type="button"
          variant="outline"
          className="size-full flex-col gap-2 rounded-full border-dashed text-muted-foreground"
          disabled={disabled}
          onClick={onEdit}
        >
          <span
            aria-hidden="true"
            className="relative inline-flex size-10 items-center justify-center"
          >
            <CameraIcon className="size-8" />
            <PlusIcon className="absolute top-0 end-0 size-4 rounded-full bg-control" />
          </span>
          <span className="text-sm font-medium">{addLabel}</span>
        </Button>
      ) : (
        <>
          <UserAvatar
            size="profile"
            className="data-[size=profile]:size-full"
            name={name}
            src={src}
            role="img"
            aria-label={name}
          />
          {onEdit ? (
            <Button
              type="button"
              size="icon"
              className="absolute bottom-4 end-4 rounded-full"
              aria-label={editLabel}
              disabled={disabled}
              onClick={onEdit}
            >
              <PencilIcon aria-hidden="true" className="size-5" />
            </Button>
          ) : null}
        </>
      )}
      {onRemove ? (
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="absolute top-4 end-4 rounded-full"
          aria-label={removeLabel}
          disabled={disabled}
          onClick={onRemove}
        >
          <XIcon aria-hidden="true" className="size-5" />
        </Button>
      ) : null}
    </div>
  );
}
