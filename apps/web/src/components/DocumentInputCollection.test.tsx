import { useState } from "react";
import {
  DocumentInput,
  type DocumentCollectionLabels,
  type DocumentInputItem,
} from "@repo/ui/components/document-input";
import { loadPdf } from "@repo/ui/lib/pdf";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const labels: DocumentCollectionLabels = {
  label: "Import",
  add: "Add import document",
  addAction: "Add",
  preview: "Preview import documents",
  title: "Import documents",
  imageAlt: "Import document",
  close: "Close",
  change: "Change document",
  save: "Save",
  openFile: "Open file",
  actions: "Document actions",
  remove: "Delete document",
  retry: "Retry upload",
  error: "Preview unavailable",
  previousPage: "Previous page",
  nextPage: "Next page",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetZoom: "Reset zoom",
  addMore: "Add more documents",
  previousDocument: "Previous document",
  nextDocument: "Next document",
  documentCount: (count) => `${count} documents`,
  documentPosition: (index, total) => `Document ${index} of ${total}`,
  tooManyFiles: (max) => `Maximum ${max} documents`,
};

const image = (name: string) =>
  new File(["image"], name, { type: "image/png" });
const existing: DocumentInputItem[] = [
  {
    id: "saved-1",
    fileName: "first.png",
    contentType: "image/png",
    src: "/documents/first",
    uploaded: true,
  },
  {
    id: "draft-2",
    fileName: "second.png",
    contentType: "image/png",
    file: image("second.png"),
    uploaded: true,
  },
];

function Harness({
  initial = [],
  maxFiles,
  validate = () => null,
  confirm = vi.fn(),
  replace = vi.fn(),
  remove = vi.fn(),
}: {
  initial?: DocumentInputItem[];
  maxFiles?: number;
  validate?: (file: File) => string | null;
  confirm?: (files: File[]) => void;
  replace?: (id: string, file: File) => void;
  remove?: (id: string) => void;
}) {
  const [values, setValues] = useState(initial);
  return (
    <DocumentInput
      multiple
      values={values}
      labels={labels}
      accept="image/*,application/pdf"
      maxFiles={maxFiles}
      validate={validate}
      onConfirm={(files) => {
        confirm(files);
        setValues((current) => [
          ...current,
          ...files.map((file) => ({
            id: file.name,
            file,
            fileName: file.name,
            contentType: file.type,
          })),
        ]);
      }}
      onReplace={(id, file) => {
        replace(id, file);
        setValues((current) =>
          current.map((item) =>
            item.id === id
              ? { id, file, fileName: file.name, contentType: file.type }
              : item,
          ),
        );
      }}
      onRemove={(id) => {
        remove(id);
        setValues((current) => current.filter((item) => item.id !== id));
      }}
    />
  );
}

function select(files: File[]) {
  const input = document.querySelector<HTMLInputElement>(
    'input[type="file"][multiple]',
  )!;
  fireEvent.change(input, { target: { files } });
}

async function menuAction(name: string) {
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: labels.actions,
    }),
  );
  fireEvent.click(await screen.findByRole("menuitem", { name }));
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("shared multiple document input", () => {
  it("previews a native multiple selection before saving it as one counted card with a compact plus", async () => {
    const confirm = vi.fn();
    const files = [image("one.png"), image("two.png")];
    render(<Harness confirm={confirm} />);
    select(files);
    const dialog = await screen.findByRole("dialog");
    expect(confirm).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Document 1 of 2")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: labels.previousDocument }),
    ).toBeDisabled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: labels.nextDocument }),
    );
    expect(
      within(dialog).getByRole("heading", { name: "two.png" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: labels.nextDocument }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: labels.zoomIn }),
    ).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("button", { name: labels.save }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(confirm).toHaveBeenCalledWith(files);
    expect(screen.getByText("2 documents")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: labels.preview }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: labels.addMore }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: labels.add }),
    ).not.toBeInTheDocument();
  });

  it("discards the entire provisional selection on close and releases its object URLs", async () => {
    const confirm = vi.fn();
    render(<Harness initial={existing} confirm={confirm} />);
    select([image("unsaved-one.png"), image("unsaved-two.png")]);
    await waitFor(() =>
      expect(
        within(screen.getByRole("dialog")).getByRole("img", {
          name: "unsaved-one.png",
        }),
      ).toHaveAttribute("src", "blob:unsaved-one.png"),
    );
    fireEvent.click(screen.getByRole("button", { name: labels.close }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByText("2 documents")).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:unsaved-one.png");
    fireEvent.click(screen.getByRole("button", { name: labels.preview }));
    expect(
      within(screen.getByRole("dialog")).getByText("Document 1 of 2"),
    ).toBeInTheDocument();
  });

  it("removes individual provisional files and saves only the remaining selection", async () => {
    const confirm = vi.fn();
    const remove = vi.fn();
    const keep = image("keep.png");
    render(<Harness confirm={confirm} remove={remove} />);
    select([image("remove.png"), keep]);
    await menuAction(labels.remove);
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "keep.png" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Document 1 of 1")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: labels.save }));
    expect(confirm).toHaveBeenCalledWith([keep]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("navigates saved and local files, deletes the active attachment, and closes after deleting the last one", async () => {
    const remove = vi.fn();
    render(<Harness initial={existing} remove={remove} />);
    fireEvent.click(screen.getByRole("button", { name: labels.preview }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("img", { name: "first.png" }),
    ).toHaveAttribute("src", "/documents/first");
    fireEvent.click(
      within(dialog).getByRole("button", { name: labels.nextDocument }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("img", { name: "second.png" }),
      ).toHaveAttribute("src", "blob:second.png"),
    );
    await menuAction(labels.remove);
    expect(remove).toHaveBeenLastCalledWith("draft-2");
    expect(
      within(screen.getByRole("dialog")).getByRole("heading", {
        name: "first.png",
      }),
    ).toBeInTheDocument();
    await menuAction(labels.remove);
    expect(remove).toHaveBeenLastCalledWith("saved-1");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: labels.add }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: labels.addMore }),
    ).not.toBeInTheDocument();
  });

  it("stages replacement of the active file and commits it only on Save, even at capacity", async () => {
    const replace = vi.fn();
    render(<Harness initial={existing} maxFiles={2} replace={replace} />);
    fireEvent.click(screen.getByRole("button", { name: labels.preview }));
    await menuAction(labels.change);
    fireEvent.change(
      document.querySelector('input[type="file"]:not([multiple])')!,
      { target: { files: [image("discard.png")] } },
    );
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: labels.close }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: labels.preview }));
    expect(
      within(screen.getByRole("dialog")).getByRole("heading", {
        name: "first.png",
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: labels.nextDocument }));
    await menuAction(labels.change);
    const replacement = image("replace.png");
    fireEvent.change(
      document.querySelector('input[type="file"]:not([multiple])')!,
      { target: { files: [replacement] } },
    );
    fireEvent.click(screen.getByRole("button", { name: labels.save }));
    expect(replace).toHaveBeenCalledExactlyOnceWith("draft-2", replacement);
  });

  it("rejects an entire batch when any file is invalid or the count exceeds capacity", () => {
    const confirm = vi.fn();
    render(
      <Harness
        initial={[existing[0]!]}
        maxFiles={3}
        confirm={confirm}
        validate={(file) =>
          file.name === "bad.exe" ? "Unsupported format" : null
        }
      />,
    );
    select([image("good.png"), new File(["bad"], "bad.exe")]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "bad.exe: Unsupported format",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    select([image("one.png"), image("two.png"), image("three.png")]);
    expect(screen.getByRole("alert")).toHaveTextContent("Maximum 3 documents");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByText("1 documents")).toBeInTheDocument();
  });

  it("validates the whole pending batch again before saving", () => {
    const confirm = vi.fn();
    const validate = vi
      .fn<(_file: File) => string | null>()
      .mockReturnValue(null);
    render(<Harness confirm={confirm} validate={validate} />);
    select([image("first.png"), image("last.png")]);
    validate.mockImplementation((file) =>
      file.name === "last.png" ? "Too large" : null,
    );
    fireEvent.click(screen.getByRole("button", { name: labels.save }));
    expect(
      within(screen.getByRole("dialog")).getByRole("alert"),
    ).toHaveTextContent("last.png: Too large");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("keeps full-screen collection surfaces on the popover theme without swipe dismissal", () => {
    render(<Harness initial={existing} />);
    fireEvent.click(screen.getByRole("button", { name: labels.preview }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("bg-popover", "p-0", "h-dvh");
    expect(dialog).not.toHaveClass("bg-background");
    expect(
      dialog.querySelector('[data-slot="document-viewer-body"]'),
    ).not.toHaveClass("bg-background");
    expect(
      dialog.querySelector('[data-slot="document-navigation"]')?.parentElement,
    ).toHaveClass("bg-popover");
    fireEvent.touchStart(dialog, { touches: [{ clientY: 50, clientX: 50 }] });
    fireEvent.touchMove(dialog, { touches: [{ clientY: 500, clientX: 50 }] });
    fireEvent.touchEnd(dialog);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("swipes through PDF pages and documents, returning to the last PDF page", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,preview",
    );
    const pdf = {
      numPages: 2,
      getPage: vi.fn().mockResolvedValue({
        getViewport: () => ({ width: 600, height: 800 }),
        render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
      }),
    };
    vi.mocked(loadPdf).mockResolvedValue({
      getDocument: () => ({
        promise: Promise.resolve(pdf),
        destroy: vi.fn().mockResolvedValue(undefined),
      }),
    } as unknown as Awaited<ReturnType<typeof loadPdf>>);
    render(
      <Harness
        initial={[
          {
            id: "pdf",
            fileName: "two-pages.pdf",
            contentType: "application/pdf",
            src: "/documents/two-pages",
          },
          existing[0]!,
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: labels.preview }));
    const dialog = screen.getByRole("dialog");
    const swipe = (from: number, to: number) => {
      const viewport = dialog.querySelector(
        '[data-slot="document-zoom-viewport"]',
      )!;
      for (const [type, clientX] of [
        ["pointerdown", from],
        ["pointermove", to],
        ["pointerup", to],
      ] as const) {
        const event = new MouseEvent(type, {
          bubbles: true,
          clientX,
          clientY: 100,
        });
        Object.defineProperties(event, {
          pointerId: { value: 1 },
          pointerType: { value: "touch" },
        });
        fireEvent(viewport, event);
      }
    };

    await within(dialog).findByRole("button", { name: labels.nextPage });
    swipe(250, 100);
    await waitFor(() =>
      expect(
        within(dialog).getByRole("img", { name: "two-pages.pdf (2/2)" }),
      ).toBeInTheDocument(),
    );
    expect(within(dialog).getByText("Document 1 of 2")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: labels.zoomIn }),
    ).toBeEnabled();
    swipe(250, 100);
    expect(
      within(dialog).getByRole("img", { name: "first.png" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: labels.nextPage }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: labels.zoomIn }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: labels.resetZoom }),
    );
    swipe(100, 250);
    await act(async () => {});
    expect(
      within(dialog).getByRole("button", { name: labels.previousPage }),
    ).toBeEnabled();
    expect(within(dialog).getByText("Document 1 of 2")).toBeInTheDocument();
    expect(within(dialog).getByText("2 / 2")).toBeInTheDocument();
  });

  it("leaves the person form single-file contract unchanged", async () => {
    const confirm = vi.fn();
    const file = image("identity.png");
    render(
      <DocumentInput
        onConfirm={confirm}
        validate={() => null}
        labels={labels}
        accept="image/*"
      />,
    );
    expect(document.querySelector('input[type="file"]')).not.toHaveAttribute(
      "multiple",
    );
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    expect(
      screen.queryByRole("button", { name: labels.nextDocument }),
    ).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: labels.save }));
    expect(confirm).toHaveBeenCalledExactlyOnceWith(file);
  });
});
