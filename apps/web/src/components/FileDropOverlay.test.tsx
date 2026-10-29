import { tokens } from "@repo/theme";
import { FileDropZone } from "@repo/ui/components/file-drop-zone";
import {
  DocumentInput,
  type DocumentCollectionLabels,
} from "@repo/ui/components/document-input";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Match responsive hooks to the viewport selected by each test.
beforeEach(() => {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches:
      query === `(width < ${tokens.breakpoints.md}px)` &&
      window.innerWidth < tokens.breakpoints.md,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

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
  it("uses selection-focused mobile copy and opens the existing multiple-file picker", () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 390,
    });
    const files = vi.fn();
    const fixture = render(
      <FileDropZone
        label="Drop documents"
        mobileLabel="Select documents"
        browseLabel="Browse files"
        hint="Drop multiple files"
        requirements="PDF or images, up to 15 MB"
        accept="application/pdf,image/*"
        onFiles={files}
      />,
    );
    try {
      const card = screen.getByRole("button", { name: "Select documents" });
      expect(card).toHaveAccessibleDescription("PDF or images, up to 15 MB");
      fireEvent.dragEnter(card, { dataTransfer: transfer });
      const overlay = card.querySelector('[data-slot="file-drop-overlay"]')!;
      expect(card).toHaveClass("overflow-hidden", "isolate");
      expect(overlay).toHaveClass("rounded-[inherit]", "p-1");
      expect(overlay.firstElementChild).toHaveClass("flex-row", "max-w-full");
      fireEvent.dragLeave(card, { dataTransfer: transfer });
      expect(card.querySelector('[data-slot="file-drop-overlay"]')).toBeNull();
      const input = screen.getByLabelText("Browse files") as HTMLInputElement;
      const click = vi.spyOn(input, "click");
      fireEvent.click(card);
      expect(click).toHaveBeenCalledOnce();
      expect(input).toHaveAttribute("multiple");
      fireEvent.change(input, { target: { files: transfer.files } });
      expect(files).toHaveBeenCalledExactlyOnceWith(transfer.files);
      expect(input.value).toBe("");
    } finally {
      fixture.unmount();
      window.innerWidth = previousWidth;
    }
  });

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

afterEach(() => vi.restoreAllMocks());
