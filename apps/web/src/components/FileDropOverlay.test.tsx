import { FileDropZone } from "@repo/ui/components/file-drop-zone";
import {
  DocumentInput,
  type DocumentCollectionLabels,
} from "@repo/ui/components/document-input";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const labels: DocumentCollectionLabels = {
  label: "Document",
  add: "Drop documents",
  preview: "Preview",
  title: "Documents",
  imageAlt: "Document",
  close: "Close",
  change: "Change",
  save: "Save",
  openFile: "Open",
  actions: "Actions",
  remove: "Remove",
  retry: "Retry",
  error: "Failed",
  previousPage: "Previous page",
  nextPage: "Next page",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetZoom: "Reset",
  addMore: "Add more",
  previousDocument: "Previous document",
  nextDocument: "Next document",
  documentCount: (count) => `${count} documents`,
  documentPosition: (index, count) => `${index}/${count}`,
  tooManyFiles: (max) => `Maximum ${max} files`,
};
function setup(kind: "zone" | "single" | "collection", disabled = false) {
  const files = vi.fn();
  const view = render(
    kind === "zone" ? (
      <FileDropZone
        label="Drop documents"
        browseLabel="Browse"
        hint="PDF or image"
        accept="image/*"
        disabled={disabled}
        onFiles={files}
      />
    ) : kind === "single" ? (
      <DocumentInput
        accept="image/*"
        disabled={disabled}
        labels={labels}
        validate={() => null}
        onConfirm={files}
      />
    ) : (
      <DocumentInput
        multiple
        values={[]}
        accept="image/*"
        disabled={disabled}
        labels={labels}
        validate={() => null}
        onConfirm={files}
        onReplace={() => {}}
        onRemove={() => {}}
      />
    ),
  );
  const target =
    kind === "zone"
      ? screen.getByRole("button")
      : view.container.querySelector<HTMLElement>(
          '[data-slot="document-input"]',
        )!;
  return { ...view, target, files };
}
const transfer = {
  types: ["Files"],
  files: [new File(["image"], "document.png", { type: "image/png" })],
};

describe("shared file drop overlay", () => {
  it.each(["zone", "single", "collection"] as const)(
    "shows the shared translucent overlay for %s and tracks nested file drags",
    (kind) => {
      const { target } = setup(kind);
      fireEvent.dragEnter(target, { dataTransfer: transfer });
      const overlay = document.querySelector(
        '[data-slot="file-drop-overlay"]',
      )!;
      expect(overlay).toHaveClass(
        "bg-file-drop-overlay",
        "backdrop-blur-file-drop",
        "pointer-events-none",
      );
      expect(overlay).toHaveTextContent("Drop documents");
      fireEvent.dragEnter(target.firstElementChild!, {
        dataTransfer: transfer,
      });
      fireEvent.dragLeave(target.firstElementChild!, {
        dataTransfer: transfer,
      });
      expect(overlay).toBeInTheDocument();
      fireEvent.dragLeave(target, { dataTransfer: transfer });
      expect(
        document.querySelector('[data-slot="file-drop-overlay"]'),
      ).toBeNull();
    },
  );
  it.each(["zone", "single", "collection"] as const)(
    "ignores reorder drags and disabled file drags for %s",
    (kind) => {
      const { target, files } = setup(kind, true);
      fireEvent.dragEnter(target, {
        dataTransfer: { types: ["text/plain"], files: [] },
      });
      expect(
        document.querySelector('[data-slot="file-drop-overlay"]'),
      ).toBeNull();
      fireEvent.dragEnter(target, { dataTransfer: transfer });
      expect(
        document.querySelector('[data-slot="file-drop-overlay"]'),
      ).toBeNull();
      fireEvent.drop(target, { dataTransfer: transfer });
      expect(files).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );
  it.each(["zone", "single", "collection"] as const)(
    "clears the overlay on drop and preserves the %s acquisition flow",
    (kind) => {
      const { target, files } = setup(kind);
      fireEvent.dragEnter(target, { dataTransfer: transfer });
      fireEvent.drop(target, { dataTransfer: transfer });
      expect(
        document.querySelector('[data-slot="file-drop-overlay"]'),
      ).toBeNull();
      if (kind === "zone")
        expect(files).toHaveBeenCalledExactlyOnceWith(transfer.files);
      else {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(files).not.toHaveBeenCalled();
      }
    },
  );
});
