"use client";

import { useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import { FormActions } from "@repo/ui/components/form-actions";
import { SaveButton } from "@repo/ui/components/save-button";
import {
  ProfilePictureEditor,
  type ProfilePictureChange,
} from "@/components/ProfilePictureEditor";
import { useSession } from "@/components/auth/SessionProvider";
import { useFormAction } from "@/lib/form/use-form-action";
import { webApi } from "@/lib/api";

export function AvatarSettings({
  user,
  onChange,
}: {
  user: v1.auth.SessionUser;
  onChange: (user: v1.auth.SessionUser) => void;
}) {
  const { setUser } = useSession();
  const t = useTranslations("auth.avatar");
  const formAction = useFormAction();
  const [picture, setPicture] = useState<ProfilePictureChange>(undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy.current || picture === undefined) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const body = new FormData();
      if (picture) body.append("file", picture);
      const updated = await webApi.fetch(
        v1.auth.ROUTES.avatar,
        v1.auth.sessionUserSchema,
        picture ? { method: "POST", body } : { method: "DELETE" },
      );
      onChange(updated);
      setUser(updated);
      setPicture(undefined);
    } catch {
      setError(t("failed"));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email.slice(0, 2);
  return (
    <form
      aria-label={t("title")}
      aria-busy={pending}
      onSubmit={(event) => void save(event)}
      className="flex flex-col gap-6"
    >
      <ProfilePictureEditor
        name={name}
        assetId={user.avatarAssetId}
        value={picture}
        onChange={setPicture}
        disabled={pending}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {picture !== undefined || pending ? (
        <FormActions ready pending={pending}>
          <SaveButton
            type="submit"
            disabled={pending}
            {...formAction("save", { pending, error })}
          />
        </FormActions>
      ) : null}
    </form>
  );
}
