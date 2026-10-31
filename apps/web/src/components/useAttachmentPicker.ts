"use client";

import { useTranslations } from "next-intl";
import type { AttachmentPickerLabels } from "@repo/ui/components/attachment-picker";
import { useMediaViewerLabels } from "./useMediaViewerLabels";

export function useAttachmentPicker() {
  const t = useTranslations("shared.attachments");
  const viewerProps = useMediaViewerLabels();
  return {
    viewerProps,
    labels: {
      title: t("title"),
      close: t("close"),
      takePhoto: t("takePhoto"),
      gallery: t("gallery"),
      files: t("files"),
      addMore: t("addMore"),
      review: t("review"),
      replace: t("replace"),
      remove: t("remove"),
      preview: t("preview"),
      moveEarlier: t("moveEarlier"),
      moveLater: t("moveLater"),
      empty: t("empty"),
      confirming: t("confirming"),
      confirmed: t("confirmed"),
      invalidFile: t("invalidFile"),
      fileTooLarge: t("fileTooLarge"),
      tooManyFiles: (max) => t("tooManyFiles", { max }),
      selectedCount: (count, max) => t("selectedCount", { count, max }),
      confirm: (count) => t("confirm", { count }),
    } satisfies AttachmentPickerLabels,
  };
}
