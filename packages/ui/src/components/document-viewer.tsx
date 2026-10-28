"use client";

import { MediaViewer, type MediaViewerProps } from "./media-viewer";

// Compatibility adapter; all rendering, controls and navigation live in MediaViewer.
export function DocumentViewer(props: MediaViewerProps) {
  return <MediaViewer {...props} slot={props.slot ?? "document-viewer"} />;
}
