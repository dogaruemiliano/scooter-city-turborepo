import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaViewer, type MediaItem } from "@repo/ui/components/media-viewer";
import {
  MediaCollection,
  useMediaCollection,
  type MediaCollectionItem,
} from "@repo/ui/components/media-collection";
import { loadPdf } from "@repo/ui/lib/pdf";

vi.mock("@repo/ui/components/image-editor", () => ({
  ImageEditor: ({
    onCancel,
    onSave,
  }: {
    onCancel: () => void;
    onSave: (file: File) => void;
  }) => (
    <div role="dialog" aria-label="Crop editor">
      <button onClick={onCancel}>Cancel crop</button>
      <button
        onClick={() =>
          onSave(new File(["cropped"], "cropped.png", { type: "image/png" }))
        }
      >
        Apply crop
      </button>
    </div>
  ),
}));

const labels = {
  title: "Documents",
  imageAlt: "Document",
  closeLabel: "Close",
  actionsLabel: "Actions",
  openFileLabel: "Open file",
  cropLabel: "Crop image",
  removeLabel: "Remove",
  saveLabel: "Confirm changes",
  pdfLabels: {
    error: "Preview failed",
    retry: "Retry preview",
    previousPage: "Previous",
    nextPage: "Next",
    pagePosition: (page: number, total: number) => `Page ${page} of ${total}`,
  },
  zoomLabels: {
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    resetZoom: "Reset zoom",
  },
  collectionLabels: {
    previous: "Previous",
    next: "Next",
    position: (index: number, total: number) => `Doc. ${index} of ${total}`,
  },
  imageLabels: {
    loadingLabel: "Loading",
    errorLabel: "Image failed",
    retryLabel: "Retry image",
  },
};
const items: MediaItem[] = [
  {
    id: "first",
    fileName: "first.png",
    contentType: "image/png",
    src: "/first.png",
  },
  {
    id: "pdf",
    fileName: "two.pdf",
    contentType: "application/pdf",
    src: "/two.pdf",
  },
  {
    id: "last",
    fileName: "last.png",
    contentType: "image/png",
    src: "/last.png",
  },
];
function Viewer({
  initial = "first",
  values = items,
}: {
  initial?: string;
  values?: MediaItem[];
}) {
  const [id, setId] = useState(initial);
  return (
    <MediaViewer
      {...labels}
      open
      onOpenChange={() => {}}
      items={values}
      activeId={id}
      onActiveIdChange={setId}
    />
  );
}
function Open({ id, name = id }: { id: string; name?: string }) {
  const collection = useMediaCollection();
  return <button onClick={() => collection?.open(id)}>{name}</button>;
}
const button = (name: string) =>
  within(screen.getByRole("dialog")).getByRole("button", { name });
const viewport = () =>
  screen
    .getByRole("dialog")
    .querySelector('[data-slot="document-zoom-viewport"]')!;
async function menu(name: string) {
  fireEvent.click(button("Actions"));
  fireEvent.click(await screen.findByRole("menuitem", { name }));
}
function wheel(deltaX: number, timeStamp: number, deltaY = 0) {
  const event = new WheelEvent("wheel", { bubbles: true, deltaX, deltaY });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  fireEvent(viewport(), event);
}
beforeEach(() => {
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
      static revokeObjectURL = vi.fn();
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/png;base64,preview",
  );
  vi.mocked(loadPdf).mockResolvedValue({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 2,
        getPage: vi.fn().mockResolvedValue({
          getViewport: () => ({ width: 600, height: 800 }),
          render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        }),
      }),
      destroy: vi.fn().mockResolvedValue(undefined),
    }),
  } as unknown as Awaited<ReturnType<typeof loadPdf>>);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("unified media viewer", () => {
  it("uses one navigation sequence for images, PDF pages, and PDF boundaries in both directions", async () => {
    render(<Viewer />);
    expect(button("Previous")).toBeDisabled();
    fireEvent.click(button("Next"));
    await screen.findByText("Page 1 of 2");
    const header = screen
      .getByRole("dialog")
      .querySelector('[data-slot="document-preview-header"]')!;
    const controls = screen
      .getByRole("dialog")
      .querySelector('[data-slot="document-zoom-controls"]')!;
    expect(
      within(header as HTMLElement).getByText("Doc. 2 of 3"),
    ).toBeInTheDocument();
    expect(controls).toHaveTextContent("Page 1 of 2");
    expect(controls).not.toHaveTextContent("Doc.");

    fireEvent.click(button("Zoom in"));
    fireEvent.click(button("Next"));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(button("Reset zoom")).toHaveTextContent("100%");
    expect(button("Next")).toBeEnabled();
    fireEvent.click(button("Next"));
    expect(screen.getByRole("img", { name: "last.png" })).toBeInTheDocument();
    expect(button("Next")).toBeDisabled();
    fireEvent.keyDown(viewport(), { key: "ArrowLeft" });
    await screen.findByText("Page 2 of 2");
    expect(screen.getByText("Doc. 2 of 3")).toBeInTheDocument();
    fireEvent.click(button("Previous"));
    fireEvent.click(button("Previous"));
    expect(screen.getByRole("img", { name: "first.png" })).toBeInTheDocument();
  });
  it("consumes wheel momentum only once even when changing asset, and leaves vertical scrolling alone", async () => {
    render(<Viewer />);
    wheel(90, 100);
    await screen.findByText("Page 1 of 2");
    wheel(90, 120);
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    wheel(0, 400, 100);
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    wheel(90, 700);
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    wheel(90, 1000);
    expect(screen.getByRole("img", { name: "last.png" })).toBeInTheDocument();
  });
  it("pans zoomed content instead of navigating on horizontal scroll", () => {
    render(<Viewer />);
    fireEvent.click(button("Zoom in"));
    wheel(100, 100);
    expect(screen.getByRole("img", { name: "first.png" })).toBeInTheDocument();
    expect(button("Reset zoom")).not.toHaveTextContent("100%");
  });
  it("never crosses from one list to another, even if their item IDs match", () => {
    render(
      <>
        <MediaCollection {...labels} items={[items[0]!]}>
          <Open id="first" name="Open document list" />
        </MediaCollection>
        <MediaCollection {...labels} items={[{ ...items[2]!, id: "first" }]}>
          <Open id="first" name="Open photo list" />
        </MediaCollection>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open document list" }));
    expect(screen.getByRole("img", { name: "first.png" })).toBeInTheDocument();
    fireEvent.keyDown(viewport(), { key: "ArrowRight" });
    expect(
      screen.queryByRole("img", { name: "last.png" }),
    ).not.toBeInTheDocument();
    fireEvent.click(button("Close"));
    fireEvent.click(screen.getByRole("button", { name: "Open photo list" }));
    expect(screen.getByRole("img", { name: "last.png" })).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
  it("allows leaving a broken PDF through the same next control", async () => {
    vi.mocked(loadPdf).mockRejectedValue(new Error("Corrupt PDF"));
    render(<Viewer initial="pdf" />);
    await screen.findByText("Preview failed");
    fireEvent.click(button("Next"));
    expect(screen.getByRole("img", { name: "last.png" })).toBeInTheDocument();
  });
  it("offers crop only for editable images, never for PDFs", async () => {
    const crop = vi.fn();
    const fixture = render(
      <MediaViewer
        {...labels}
        open
        onOpenChange={() => {}}
        src="/photo.png"
        contentType="image/png"
        onCrop={crop}
      />,
    );
    fireEvent.click(button("Actions"));
    expect(
      await screen.findByRole("menuitem", { name: "Crop image" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    fixture.rerender(
      <MediaViewer
        {...labels}
        open
        onOpenChange={() => {}}
        src="/two.pdf"
        contentType="application/pdf"
        onCrop={crop}
      />,
    );
    fireEvent.click(button("Actions"));
    expect(
      screen.queryByRole("menuitem", { name: "Crop image" }),
    ).not.toBeInTheDocument();
  });
  it("keeps cropped edits while navigating, discards them on close, and commits only on confirmation", async () => {
    const replace = vi.fn();
    const values = [
      {
        ...items[0]!,
        file: new File(["original"], "first.png", { type: "image/png" }),
        onReplace: replace,
      },
      items[2]!,
    ];
    render(
      <MediaCollection {...labels} items={values}>
        <Open id="first" />
      </MediaCollection>,
    );
    fireEvent.click(screen.getByRole("button", { name: "first" }));
    await menu("Crop image");
    fireEvent.click(screen.getByRole("button", { name: "Apply crop" }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "cropped.png" })).toHaveAttribute(
        "src",
        "blob:cropped.png",
      ),
    );
    fireEvent.click(button("Next"));
    fireEvent.click(button("Previous"));
    expect(
      screen.getByRole("img", { name: "cropped.png" }),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(button("Close"));
    fireEvent.click(screen.getByRole("button", { name: "first" }));
    expect(screen.getByRole("img", { name: "first.png" })).toBeInTheDocument();
    await menu("Crop image");
    fireEvent.click(screen.getByRole("button", { name: "Apply crop" }));
    await screen.findByRole("button", { name: "Confirm changes" });
    fireEvent.click(button("Confirm changes"));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(replace).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: "cropped.png" }),
    );
  });
  it("blocks duplicate confirmation while pending and preserves cropped edits after failure", async () => {
    let reject!: (error: Error) => void;
    const replace = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, fail) => {
            reject = fail;
          }),
      )
      .mockResolvedValue(undefined);
    render(
      <MediaCollection
        {...labels}
        items={[
          {
            ...items[0]!,
            file: new File(["original"], "first.png", { type: "image/png" }),
            onReplace: replace,
          },
        ]}
      >
        <Open id="first" />
      </MediaCollection>,
    );
    fireEvent.click(screen.getByRole("button", { name: "first" }));
    await menu("Crop image");
    fireEvent.click(screen.getByRole("button", { name: "Apply crop" }));
    await screen.findByRole("button", { name: "Confirm changes" });
    fireEvent.click(button("Confirm changes"));
    expect(button("Confirm changes")).toBeDisabled();
    fireEvent.click(button("Confirm changes"));
    expect(replace).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error("Upload failed")));
    expect(screen.getByRole("alert")).toHaveTextContent("Upload failed");
    expect(button("Confirm changes")).toBeEnabled();
    expect(
      screen.getByRole("img", { name: "cropped.png" }),
    ).toBeInTheDocument();
    fireEvent.click(button("Confirm changes"));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(replace).toHaveBeenCalledTimes(2);
  });
  it("uses a token-sized desktop modal and a full-screen mobile surface", () => {
    render(<Viewer />);
    expect(screen.getByRole("dialog")).toHaveClass(
      "bg-popover",
      "h-dvh",
      "md:h-(--container-media-viewer-height)",
      "md:max-w-(--container-media-viewer-max)",
      "md:rounded-2xl",
    );
    expect(screen.getByRole("dialog")).not.toHaveClass("bg-background");
  });
  it("loads restored files on demand, keeps failures retryable, and does not loop requests", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValue(
        new File(["image"], "restored.png", { type: "image/png" }),
      );
    render(
      <MediaCollection
        {...labels}
        items={[
          {
            id: "restored",
            fileName: "restored.png",
            contentType: "image/png",
            load,
          },
          items[2]!,
        ]}
      >
        <Open id="restored" />
      </MediaCollection>,
    );
    fireEvent.click(screen.getByRole("button", { name: "restored" }));
    await screen.findByRole("alert");
    expect(load).toHaveBeenCalledTimes(1);
    fireEvent.click(button("Retry preview"));
    await screen.findByRole("img", { name: "restored.png" });
    expect(load).toHaveBeenCalledTimes(2);
    fireEvent.click(button("Next"));
    expect(screen.getByRole("img", { name: "last.png" })).toBeInTheDocument();
  });
  it("selects the next remaining item after removal and closes after the final item", async () => {
    function Removable() {
      const [values, setValues] = useState([items[0]!, items[2]!]);
      const files: MediaCollectionItem[] = values.map((item) => ({
        ...item,
        onRemove: () =>
          setValues((current) => current.filter((file) => file.id !== item.id)),
      }));
      return (
        <MediaCollection {...labels} items={files}>
          <Open id="first" />
        </MediaCollection>
      );
    }
    render(<Removable />);
    fireEvent.click(screen.getByRole("button", { name: "first" }));
    await menu("Remove");
    await screen.findByRole("img", { name: "last.png" });
    await menu("Remove");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
