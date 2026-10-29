"use client";

import { useTranslations } from "next-intl";
import type { MediaViewerProps } from "@repo/ui/components/media-viewer";

/** Runtime localization stays outside the shared UI package. */
export function useMediaViewerLabels() {
  const t = useTranslations("shared.media");
  const editor = useTranslations("persons.documentForm");
  return {
    closeLabel: t("close"),
    openFileLabel: t("openFile"),
    actionsLabel: t("actions"),
    removeLabel: t("remove"),
    cropLabel: t("crop"),
    saveLabel: t("confirm"),
    pendingLabel: t("saving"),
    gridLabel: t("grid"),
    imageLabels: {
      loadingLabel: t("loading"),
      errorLabel: t("error"),
      retryLabel: t("retry"),
    },
    pdfLabels: {
      error: t("error"),
      retry: t("retry"),
      previousPage: t("previous"),
      nextPage: t("next"),
      pagePosition: (page, total) => t("pagePosition", { page, total }),
    },
    zoomLabels: {
      zoomIn: t("zoomIn"),
      zoomOut: t("zoomOut"),
      resetZoom: t("resetZoom"),
    },
    collectionLabels: {
      previous: t("previous"),
      next: t("next"),
      position: (index, total) => t("position", { index, total }),
    },
    editorLabels: {
      title: t("crop"),
      description: editor("cropHelp"),
      cancel: editor("cancelEdit"),
      reset: editor("resetEdits"),
      rotatePhoto: editor("rotatePhoto"),
      rotationZ: editor("straightenPhoto"),
      rotationX: editor("rotationX"),
      rotationY: editor("rotationY"),
      adjustRotationZ: editor("straightenPhoto"),
      adjustRotationX: editor("adjustRotationX"),
      adjustRotationY: editor("adjustRotationY"),
      imageAlt: t("crop"),
      cropCorner: (corner) => editor("cropCorner", { corner }),
      cropEdge: (edge) => editor(`cropEdges.${edge}`),
      showEntirePhoto: editor("showEntirePhoto"),
      save: t("confirm"),
      saving: t("saving"),
      saveFailed: editor("cropFailed"),
      fileTooLarge: editor("invalidFile"),
    },
  } satisfies Partial<MediaViewerProps>;
}
