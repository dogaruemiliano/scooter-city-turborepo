"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@repo/ui/components";
import { ProfileImage } from "@repo/ui/components/profile-image";
import { useObjectUrl } from "@repo/ui/hooks/use-object-url";
import { userAvatarSrc } from "@/lib/user-avatar";

/** Undefined leaves the saved picture alone; null stages its removal. */
export type ProfilePictureChange = File | null | undefined;

export function ProfilePictureEditor({
  name,
  assetId,
  value,
  onChange,
  disabled = false,
}: {
  name: string;
  assetId?: string | null;
  value: ProfilePictureChange;
  onChange: (value: ProfilePictureChange) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("auth.avatar");
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = useObjectUrl(value instanceof File ? value : null);
  const src = value === null ? undefined : (preview ?? userAvatarSrc(assetId));

  return (
    <div className="flex flex-col items-center gap-4">
      <ProfileImage
        name={name}
        src={src}
        onEdit={() => input.current?.click()}
        addLabel={t("add")}
        editLabel={t("change")}
        disabled={disabled}
        removeLabel={t("remove")}
        onRemove={
          src || value instanceof File
            ? () => {
                setError(null);
                onChange(assetId ? null : undefined);
                if (input.current) input.current.value = "";
              }
            : undefined
        }
      />
      <Label className="sr-only" htmlFor={id}>
        {t("choose")}
      </Label>
      <input
        className="sr-only"
        tabIndex={-1}
        ref={input}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (
            !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
            file.size > 5 * 1024 * 1024 ||
            file.size === 0
          ) {
            setError(t("invalid"));
            event.target.value = "";
            return;
          }
          setError(null);
          onChange(file);
          event.target.value = "";
        }}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
