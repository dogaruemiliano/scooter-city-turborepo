"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import { webApi } from "@/lib/api";

/** Prepare binary files before the tap: native sharing requires user activation. */
export function useShareClientDocuments(
  scooter: v1.scooters.Scooter,
  canRead: boolean,
) {
  const t = useTranslations("scooters.sharing");
  const [menuOpen, setMenuOpen] = useState(false);
  const [prepared, setPrepared] = useState<{
    key: string;
    files: File[];
  } | null>(null);
  const [preparationError, setPreparationError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const sharing = useRef(false);
  const [busy, setBusy] = useState(false);
  const documents = scooter.documents ?? [];
  // The server knows whether this scooter needs ITP copies. Without that summary,
  // require the full set rather than assuming an exemption.
  const missing =
    Boolean(scooter.missingClientDocuments?.length) ||
    v1.scooters.missingScooterClientDocuments(
      documents,
      scooter.missingClientDocuments === undefined,
    ).length > 0;
  const copies = [
    ...new Map(
      v1.scooters
        .scooterDocumentDisplayEntries(documents)
        .filter(
          (entry) =>
            entry.clientCopy &&
            !entry.archived &&
            v1.scooters.scooterDocumentState(
              entry.document,
              undefined,
              entry.type,
            ) === "current",
        )
        .map((entry) => [entry.document.id, entry.document.clientCopy!]),
    ).values(),
  ];
  const key = JSON.stringify(copies);
  const eligible = canRead && !missing && copies.length > 0;

  useEffect(() => {
    if (!menuOpen || !eligible) return;
    const controller = new AbortController();
    const filesToLoad: NonNullable<
      v1.scooters.ScooterDocument["clientCopy"]
    >[] = JSON.parse(key);
    async function prepare() {
      try {
        if (
          typeof navigator.share !== "function" ||
          typeof navigator.canShare !== "function"
        ) {
          setPreparationError({ key, message: t("unsupported") });
          return;
        }
        // Match authenticated binary downloads, including access-token refresh.
        await webApi.fetch(v1.auth.ROUTES.me, v1.auth.sessionUserSchema, {
          cache: "no-store",
          signal: controller.signal,
        });
        const files = await Promise.all(
          filesToLoad.map(async (copy) => {
            const response = await fetch(webApi.url(copy.contentUrl), {
              credentials: "include",
              cache: "no-store",
              signal: controller.signal,
            });
            if (!response.ok) throw new Error("Document download failed");
            const blob = await response.blob();
            if (!blob.size) throw new Error("Empty document");
            return new File([blob], copy.fileName, { type: copy.contentType });
          }),
        );
        if (controller.signal.aborted) return;
        if (!navigator.canShare({ files })) {
          setPreparationError({ key, message: t("unsupported") });
          return;
        }
        setPrepared({ key, files });
      } catch {
        if (!controller.signal.aborted)
          setPreparationError({ key, message: t("loadError") });
      }
    }
    void prepare();
    return () => controller.abort();
  }, [menuOpen, eligible, key, t]);

  async function share() {
    if (!eligible || prepared?.key !== key || sharing.current) return;
    sharing.current = true;
    setBusy(true);
    setShareError(null);
    try {
      // No asynchronous work before this call: preserve the tap's activation.
      await navigator.share({
        files: prepared.files,
        title: v1.scooters.scooterDisplayCode(scooter),
      });
    } catch (error) {
      if (
        !(
          typeof error === "object" &&
          error !== null &&
          "name" in error &&
          error.name === "AbortError"
        )
      )
        setShareError(t("shareError"));
    } finally {
      sharing.current = false;
      setBusy(false);
    }
  }

  return {
    onMenuOpenChange: (open: boolean) => {
      setMenuOpen(open);
      if (!open) {
        setPrepared(null);
        setPreparationError(null);
      }
    },
    disabled: !eligible || busy || prepared?.key !== key,
    description: missing
      ? t("missing")
      : ((preparationError?.key === key
          ? preparationError.message
          : undefined) ?? (prepared?.key !== key ? t("preparing") : undefined)),
    share: () => void share(),
    shareError,
  };
}
