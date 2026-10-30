import { aspectRatio, semanticBlur, softFade } from "@repo/theme";
import { DocumentPreview } from "@repo/ui/components/document-preview";
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

const labels = {
  error: "Preview unavailable",
  previousPage: "Previous page",
  nextPage: "Next page",
};
const props = {
  src: "blob:first",
  contentType: "application/pdf",
  fileName: "CIV.pdf",
  label: "CIV",
  triggerLabel: "Preview CIV",
  imageAlt: "CIV",
  title: "CIV.pdf",
  closeLabel: "Close",
  openFileLabel: "Open file",
  actionsLabel: "Document actions",
  pdfLabels: labels,
  zoomLabels: {
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    resetZoom: "Reset zoom",
  },
  open: false,
  onOpenChange: vi.fn(),
};
let renderPage: ReturnType<typeof vi.fn>;
let destroy: ReturnType<typeof vi.fn>;
let cancel: ReturnType<typeof vi.fn>;
let getDocument: ReturnType<typeof vi.fn>;
let disconnect: ReturnType<typeof vi.fn>;
let resolveDocument: (value: unknown) => void;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/jpeg;base64,preview",
  );
  cancel = vi.fn();
  disconnect = vi.fn();
  destroy = vi.fn().mockResolvedValue(undefined);
  renderPage = vi.fn(() => ({ promise: Promise.resolve(), cancel }));
  const pdf = {
    numPages: 3,
    getPage: vi.fn().mockResolvedValue({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
      }),
      render: renderPage,
    }),
  };
  getDocument = vi.fn(() => ({ promise: Promise.resolve(pdf), destroy }));
  vi.mocked(loadPdf).mockResolvedValue({ getDocument } as unknown as Awaited<
    ReturnType<typeof loadPdf>
  >);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ target, contentRect: { width: 300 } }] as ResizeObserverEntry[],
          this as unknown as ResizeObserver,
        );
      }
      unobserve = vi.fn();
      disconnect = disconnect;
    },
  );
  resolveDocument = () => {};
});
afterEach(() => vi.unstubAllGlobals());

describe("shared PDF previews", () => {
  it("uses the shared soft curve for both paper-card overlays", () => {
    render(
      <DocumentPreview
        {...props}
        contentType="image/jpeg"
        layout="paper"
        headerOverlay={<span>Document title</span>}
        bottomOverlay={<span>Document status</span>}
      />,
    );
    expect(screen.getByText("Document title").parentElement).toHaveStyle({
      backgroundImage: softFade.toTop,
    });
    expect(screen.getByText("Document status").parentElement).toHaveStyle({
      backgroundImage: softFade.toBottom,
    });
  });

  it.each([
    [1200, 600],
    [600, 800],
    [300, 1200],
  ])(
    "keeps %s × %s images centered in a fixed A4 frame over a decorative fill",
    (width, height) => {
      const view = render(
        <DocumentPreview {...props} layout="paper" contentType="image/jpeg" />,
      );
      const image = screen.getByAltText("CIV");
      Object.defineProperties(image, {
        naturalWidth: { value: width },
        naturalHeight: { value: height },
      });
      fireEvent.load(image);
      expect(
        view.container.querySelector('[data-slot="document-preview-card"]'),
      ).toHaveStyle({ aspectRatio: String(aspectRatio.documentA4Portrait) });
      expect(image).toHaveClass(
        "object-contain",
        "object-center",
        "h-full",
        "w-full",
      );
      const backdrop = view.container.querySelector(
        '[data-slot="document-preview-backdrop"]',
      )!;
      expect(backdrop).toHaveAttribute("aria-hidden", "true");
      expect(backdrop.querySelector("img")).toHaveAttribute("src", props.src);
      expect(backdrop.querySelector("img")).toHaveClass("object-cover");
      expect(backdrop.firstElementChild).toHaveStyle({
        filter: `blur(${semanticBlur.documentPreview}px)`,
      });
      expect(backdrop.lastElementChild).toHaveClass("bg-media-scrim");
      view.rerender(
        <DocumentPreview
          {...props}
          src="blob:replacement"
          layout="paper"
          contentType="image/jpeg"
        />,
      );
      expect(
        view.container.querySelector('[data-slot="document-preview-card"]'),
      ).toHaveStyle({ aspectRatio: String(aspectRatio.documentA4Portrait) });
      expect(
        view.container.querySelector(
          '[data-slot="document-preview-backdrop"] img',
        ),
      ).toHaveAttribute("src", "blob:replacement");
    },
  );
  it("keeps PDF cards A4 and reuses the rendered page for the decorative fill", async () => {
    const view = render(<DocumentPreview {...props} layout="paper" />);
    await waitFor(() =>
      expect(
        view.container.querySelector('[data-slot="document-preview-card"]'),
      ).toHaveStyle({ aspectRatio: String(aspectRatio.documentA4Portrait) }),
    );
    await waitFor(() =>
      expect(
        view.container.querySelector(
          '[data-slot="document-preview-backdrop"] img',
        ),
      ).toHaveAttribute("src", "data:image/jpeg;base64,preview"),
    );
    expect(screen.getByRole("img", { name: "CIV.pdf (1/3)" })).toHaveClass(
      "object-contain",
      "object-center",
    );
    expect(renderPage).toHaveBeenCalledTimes(1);
    expect(getDocument).toHaveBeenCalledTimes(1);
  });

  it("keeps the landscape preview free of the paper-card backdrop", () => {
    const view = render(
      <DocumentPreview {...props} contentType="image/jpeg" />,
    );
    expect(screen.getByRole("button", { name: "Preview CIV" })).toHaveStyle({
      aspectRatio: String(aspectRatio.documentLandscape),
    });
    expect(
      view.container.querySelector('[data-slot="document-preview-backdrop"]'),
    ).toBeNull();
  });

  it.each(["image/png", "application/pdf"])(
    "places the filename and working close button inside the %s preview overlay",
    (contentType) => {
      render(<DocumentPreview {...props} contentType={contentType} open />);
      const dialog = screen.getByRole("dialog", { name: "CIV.pdf" });
      const header = dialog.querySelector(
        '[data-slot="document-preview-header"]',
      )!;
      expect(header.closest('[data-slot="document-zoom"]')).not.toBeNull();
      expect(
        within(header as HTMLElement).getByText("CIV.pdf"),
      ).toBeInTheDocument();
      fireEvent.click(
        within(header as HTMLElement).getByRole("button", { name: "Close" }),
      );
      expect(props.onOpenChange).toHaveBeenCalledWith(false);
    },
  );

  it("reuses the card document and shows its thumbnail while the fullscreen page renders", async () => {
    const { rerender, unmount } = render(<DocumentPreview {...props} />);
    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: "CIV.pdf (1/3)" }),
      ).toHaveAttribute("data-rendered", "true"),
    );
    let finishRender!: () => void;
    renderPage.mockImplementationOnce(() => ({
      promise: new Promise<void>((resolve) => {
        finishRender = resolve;
      }),
      cancel,
    }));
    rerender(<DocumentPreview {...props} open />);
    const dialog = screen.getByRole("dialog");
    await waitFor(() =>
      expect(
        dialog.querySelector('[data-slot="pdf-instant-preview"]'),
      ).toHaveAttribute("src", "data:image/jpeg;base64,preview"),
    );
    expect(getDocument).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(finishRender).toBeTypeOf("function"));
    await act(async () => finishRender());
    expect(
      dialog.querySelector('[data-slot="pdf-instant-preview"]'),
    ).not.toBeInTheDocument();
    rerender(<DocumentPreview {...props} />);
    expect(destroy).not.toHaveBeenCalled();
    rerender(<DocumentPreview {...props} open />);
    expect(getDocument).toHaveBeenCalledTimes(1);
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps upload progress confined to the bottom-right corner", () => {
    render(
      <DocumentPreview {...props} contentType="image/png" status="Uploading" />,
    );
    const indicator = screen.getByRole("status");
    expect(indicator).toHaveClass(
      "right-0",
      "bottom-0",
      "size-16",
      "bg-linear-to-tl",
      "pointer-events-none",
    );
    expect(indicator).not.toHaveClass("inset-0", "bg-popover/80");
    expect(screen.getByRole("button", { name: "Preview CIV" })).toBeEnabled();
  });

  it("renders the first page in the card, sends credentials, and keeps the card clickable", async () => {
    render(<DocumentPreview {...props} />);
    const card = screen.getByRole("button", { name: "Preview CIV" });
    await waitFor(() =>
      expect(
        within(card).getByRole("img", { name: "CIV.pdf (1/3)" }),
      ).toHaveAttribute("data-rendered", "true"),
    );
    expect(getDocument).toHaveBeenCalledWith({
      url: "blob:first",
      withCredentials: true,
    });
    expect(renderPage).toHaveBeenCalledWith(
      expect.objectContaining({ canvas: expect.any(HTMLCanvasElement) }),
    );
    fireEvent.click(card);
    expect(props.onOpenChange).toHaveBeenCalledWith(true);
  });

  it("renders each selected page and respects pagination boundaries", async () => {
    render(<DocumentPreview {...props} open />);
    const dialog = screen.getByRole("dialog");
    const previous = await within(dialog).findByRole("button", {
      name: "Previous page",
    });
    const next = within(dialog).getByRole("button", { name: "Next page" });
    expect(previous).toBeDisabled();
    fireEvent.click(next);
    await waitFor(() =>
      expect(
        within(dialog).getByRole("img", { name: "CIV.pdf (2/3)" }),
      ).toHaveAttribute("data-rendered", "true"),
    );
    expect(previous).toBeEnabled();
    fireEvent.click(next);
    await waitFor(() =>
      expect(
        within(dialog).getByRole("img", { name: "CIV.pdf (3/3)" }),
      ).toHaveAttribute("data-rendered", "true"),
    );
    expect(next).toBeDisabled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Document actions" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Open file" }),
    ).toHaveAttribute("href", "blob:first");
  });

  it("resets the preview for a replaced file and releases document/render resources", async () => {
    const { rerender, unmount } = render(<DocumentPreview {...props} />);
    await waitFor(() => expect(renderPage).toHaveBeenCalled());
    rerender(<DocumentPreview {...props} src="blob:replacement" />);
    await waitFor(() =>
      expect(getDocument).toHaveBeenCalledWith({
        url: "blob:replacement",
        withCredentials: true,
      }),
    );
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalled();
    unmount();
    expect(destroy).toHaveBeenCalledTimes(2);
    expect(disconnect).toHaveBeenCalled();
  });

  it("keeps an open-file fallback when a PDF is corrupt or password protected", async () => {
    getDocument.mockReturnValue({
      promise: Promise.reject(new Error("Invalid PDF")),
      destroy,
    });
    render(<DocumentPreview {...props} open />);
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText(labels.error)).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Document actions" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Open file" }),
    ).toHaveAttribute("href", "blob:first");
  });

  it("shows page-render errors instead of a blank preview", async () => {
    renderPage.mockImplementation(() => ({
      promise: Promise.reject(new Error("Render failed")),
      cancel,
    }));
    render(<DocumentPreview {...props} />);
    expect(await screen.findByText(labels.error)).toBeInTheDocument();
  });

  it("destroys an in-flight load when removed without rendering its late result", async () => {
    getDocument.mockImplementation(() => ({
      promise: new Promise((resolve) => {
        resolveDocument = resolve;
      }),
      destroy,
    }));
    const { unmount } = render(<DocumentPreview {...props} />);
    await waitFor(() => expect(getDocument).toHaveBeenCalled());
    unmount();
    await act(async () => resolveDocument({ numPages: 1 }));
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(renderPage).not.toHaveBeenCalled();
  });
});
