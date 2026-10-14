import { aspectRatio } from "@repo/theme";
import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import {
  act,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { ScooterPhotoGallery } from "./ScooterPhotos";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.fetch,
    url: (path: string) => `http://localhost:3000${path}`,
  },
}));
const photo = (
  id: string,
  extra: Partial<v1.scooters.ScooterPhoto> = {},
): v1.scooters.ScooterPhoto => ({
  id,
  fileName: `${id}.jpg`,
  caption: null,
  isPublic: false,
  type: id === "one" ? "GALLERY_COVER" : "GALLERY",

  position: id === "one" ? 0 : 1,
  contentUrl: `/v1/scooters/scooter-1/photos/${id}/content`,
  createdAt: "2026-10-13T10:00:00Z",
  ...extra,
});
const routes = v1.scooters.ROUTES.photos;

function renderGallery(
  editable = true,
  locale: "en" | "ro" = "en",
  onSaved?: () => void,
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ScooterPhotoGallery
        scooterId="scooter-1"
        editable={editable}
        onSaved={onSaved}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mocks.fetch
    .mockReset()
    .mockResolvedValue([photo("one"), photo("two", { isPublic: true })]);
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Scooter photo gallery", () => {
  it("shows one Cover badge independently of public visibility", async () => {
    mocks.fetch.mockResolvedValue([
      photo("one", { isPublic: true }),
      photo("two"),
    ]);
    renderGallery(false);
    const image = await screen.findByAltText("one.jpg");
    const item = image.closest('[data-sortable-id="one"]')!;
    expect(item).toContainElement(screen.getByText("Cover"));
    expect(item).toContainElement(screen.getByText("Public"));
    expect(screen.getAllByText("Cover")).toHaveLength(1);
    expect(screen.queryByText("Internal cover")).toBeNull();
    expect(screen.queryByText("Customer cover")).toBeNull();
  });

  it.each([true, false])(
    "deletes through the existing API and retains photos on failure (success: %s)",
    async (success) => {
      mocks.fetch.mockImplementation(async (_path, _schema, options) => {
        if (options?.method === "DELETE") {
          if (!success) throw new Error("Delete failed");
          return [photo("one")];
        }
        return [photo("one"), photo("two")];
      });
      Object.defineProperty(Element.prototype, "getAnimations", {
        configurable: true,
        value: () => [],
      });
      Object.defineProperty(Element.prototype, "animate", {
        configurable: true,
        value: () => ({
          finished: Promise.resolve(),
          cancel() {},
          finish() {},
          addEventListener() {},
          removeEventListener() {},
        }),
      });
      Object.defineProperty(document, "getAnimations", {
        configurable: true,
        value: () => [],
      });
      vi.stubGlobal(
        "IntersectionObserver",
        class {
          observe() {}
          unobserve() {}
          disconnect() {}
          takeRecords() {
            return [];
          }
        },
      );
      vi.spyOn(
        HTMLElement.prototype,
        "getBoundingClientRect",
      ).mockImplementation(function (this: HTMLElement) {
        if (this.dataset.slot === "sortable-delete-reveal")
          return DOMRect.fromRect({ x: 0, y: 284, width: 240, height: 96 });
        if (this.dataset.slot === "sortable-delete-area")
          return DOMRect.fromRect({ x: 0, y: 300, width: 240, height: 80 });
        const index = Array.from(
          document.querySelectorAll("[data-sortable-id]"),
        ).indexOf(this);
        return DOMRect.fromRect({
          x: index >= 0 ? index * 120 : 0,
          y: 0,
          width: index >= 0 ? 100 : 240,
          height: index >= 0 ? 100 : 240,
        });
      });
      const onSaved = vi.fn();
      renderGallery(true, "en", onSaved);
      const card = await screen.findByRole("button", {
        name: "Open photo: two.jpg",
      });
      card.focus();
      fireEvent.keyDown(card, { key: " ", code: "Space" });
      await waitFor(() => expect(card).toHaveAttribute("aria-pressed", "true"));
      fireEvent.keyDown(card, { key: "ArrowDown", code: "ArrowDown" });
      await screen.findByText("Release to delete this photo");
      fireEvent.keyDown(card, { key: " ", code: "Space" });
      await waitFor(() =>
        expect(mocks.fetch).toHaveBeenCalledWith(
          routes.photo("scooter-1", "two"),
          expect.anything(),
          expect.objectContaining({ method: "DELETE" }),
        ),
      );
      if (success)
        await waitFor(() =>
          expect(screen.queryByAltText("two.jpg")).toBeNull(),
        );
      else {
        expect(await screen.findByRole("alert")).toHaveTextContent(
          "The change couldn’t be saved",
        );
        expect(screen.getByAltText("two.jpg")).toBeInTheDocument();
      }
      expect(onSaved).toHaveBeenCalledTimes(success ? 1 : 0);
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  it.each([true, false])(
    "opens photos and navigates in the shared viewer (editable: %s)",
    async (editable) => {
      const user = userEvent.setup();
      renderGallery(editable);
      await user.click(
        await screen.findByRole("button", { name: "Open photo: two.jpg" }),
      );
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("data-slot", "image-viewer");
      expect(dialog.querySelector("img")).toHaveAttribute(
        "src",
        "http://localhost:3000/v1/scooters/scooter-1/photos/two/content",
      );
      await user.click(screen.getByRole("button", { name: "Previous photo" }));
      expect(dialog.querySelector("img")).toHaveAttribute("alt", "one.jpg");
      await user.click(screen.getByRole("button", { name: "Close photo" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    },
  );

  it("uploads create-form photos privately and keeps their settings until submission", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:draft-preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    class UploadRequest {
      upload = {};
      status = 200;
      onload: (() => void) | null = null;
      onloadend: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      abort() {}
      send() {
        this.onload?.();
        this.onloadend?.();
      }
    }
    vi.stubGlobal("XMLHttpRequest", UploadRequest);
    mocks.fetch.mockResolvedValue({
      uploadUrl: "https://uploads.example/private",
      uploadToken: "draft-token",
      headers: {},
      maxBytes: 1000,
    });
    const onDraftsChange = vi.fn();
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterPhotoGallery
          editable
          number={2}
          onDraftsChange={onDraftsChange}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("heading", { name: /02.*Photos/ }),
    ).toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
    const file = new File(["image"], "draft.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new TextEncoder().encode("image").buffer,
    });
    await user.upload(
      screen.getByLabelText("Upload photos", { selector: "input" }),
      file,
    );
    await waitFor(() =>
      expect(onDraftsChange).toHaveBeenLastCalledWith(
        [
          {
            uploadToken: "draft-token",
            fileName: "draft.jpg",
            caption: null,
            isPublic: false,
            type: "GALLERY_COVER",
          },
        ],
        false,
      ),
    );
    expect(screen.getByAltText("draft.jpg")).toHaveAttribute(
      "src",
      "blob:draft-preview",
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0]?.[0]).toBe(routes.draftUpload);
  });

  it("keeps upload and processing progress inside the fixed-size image preview", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:upload-preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const requests: UploadRequest[] = [];
    let attach!: (photos: v1.scooters.ScooterPhoto[]) => void;
    class UploadRequest {
      upload = {
        onprogress: null as
          | null
          | ((event: {
              lengthComputable: boolean;
              loaded: number;
              total: number;
            }) => void),
      };
      status = 200;
      onload: (() => void) | null = null;
      onloadend: (() => void) | null = null;
      constructor() {
        requests.push(this);
      }
      open() {}
      setRequestHeader() {}
      abort() {}
      send() {}
    }
    vi.stubGlobal("XMLHttpRequest", UploadRequest);
    mocks.fetch.mockImplementation(
      async (path: string, _schema: unknown, options?: { method?: string }) => {
        if (path.endsWith("/upload-url"))
          return {
            uploadUrl: "https://uploads.example/photo",
            uploadToken: "token",
            headers: {},
            maxBytes: 1000,
          };
        if (options?.method === "POST")
          return new Promise<v1.scooters.ScooterPhoto[]>((resolve) => {
            attach = resolve;
          });
        return [];
      },
    );
    const onSaved = vi.fn();
    renderGallery(true, "en", onSaved);
    await screen.findByRole("button", { name: "Cover photo" });
    const file = new File(["image"], "upload.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new TextEncoder().encode("image").buffer,
    });
    await userEvent
      .setup()
      .upload(
        screen.getByLabelText("Upload photos", { selector: "input" }),
        file,
      );
    await waitFor(() => expect(requests).toHaveLength(1));
    const request = requests[0]!;
    const preview = (await screen.findByAltText("upload.jpg")).closest(
      '[data-slot="photo-upload-preview"]',
    )!;
    const overlay = preview.querySelector(
      '[data-slot="photo-upload-overlay"]',
    )!;
    expect(preview).toHaveStyle({ aspectRatio: aspectRatio.scooterPhoto });
    expect(overlay).toHaveClass("absolute", "inset-2");
    await act(async () => {
      request.upload.onprogress?.({
        lengthComputable: true,
        loaded: 5,
        total: 10,
      });
    });
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
    expect(overlay).toContainElement(screen.getByRole("progressbar"));
    await act(async () => {
      request.onload?.();
      request.onloadend?.();
    });
    expect(await screen.findByText("Saving photo…")).toBeInTheDocument();
    expect(overlay).toContainElement(screen.getByText("Saving photo…"));
    expect(preview).toHaveStyle({ aspectRatio: aspectRatio.scooterPhoto });
    expect(onSaved).not.toHaveBeenCalled();
    await act(async () => attach([photo("one")]));
    expect(await screen.findByAltText("one.jpg")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("keeps failed upload previews and retries the attachment without reuploading bytes", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo-preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const send = vi.fn();
    class UploadRequest {
      upload = {
        onprogress: null as
          | null
          | ((event: {
              lengthComputable: boolean;
              loaded: number;
              total: number;
            }) => void),
      };
      status = 200;
      timeout = 0;
      onload: (() => void) | null = null;
      onloadend: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      abort() {}
      send() {
        send();
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: 5,
          total: 10,
        });
        this.onload?.();
        this.onloadend?.();
      }
    }
    vi.stubGlobal("XMLHttpRequest", UploadRequest);
    let attachments = 0;
    mocks.fetch.mockImplementation(
      async (path: string, _schema: unknown, options?: { method?: string }) => {
        if (path.endsWith("/upload-url"))
          return {
            uploadUrl: "https://uploads.example/photo",
            uploadToken: "token",
            headers: {},
            maxBytes: 1000,
          };
        if (options?.method === "POST") {
          if (++attachments === 1) throw new Error("Lost attachment response");
          return [photo("one")];
        }
        return [];
      },
    );
    const user = userEvent.setup();
    renderGallery();
    await screen.findByRole("button", { name: "Cover photo" });
    const file = new File(["image"], "scooter.jpg", { type: "image/jpeg" });
    // jsdom's File does not expose arrayBuffer yet.
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new TextEncoder().encode("image").buffer,
    });
    await user.upload(
      screen.getByLabelText("Upload photos", { selector: "input" }),
      file,
    );
    expect(
      await screen.findByText(
        "Photo wasn’t saved. Retry the upload or remove it.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByAltText("scooter.jpg")).toHaveAttribute(
      "src",
      "blob:photo-preview",
    );
    const failedPreview = screen
      .getByAltText("scooter.jpg")
      .closest('[data-slot="photo-upload-preview"]')!;
    expect(failedPreview).toHaveStyle({
      aspectRatio: aspectRatio.scooterPhoto,
    });
    expect(
      failedPreview.querySelector('[data-slot="photo-upload-overlay"]'),
    ).toContainElement(screen.getByRole("button", { name: "Retry" }));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByAltText("one.jpg");
    expect(send).toHaveBeenCalledTimes(1);
    expect(attachments).toBe(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo-preview");
  });

  it("uses two mobile columns and three desktop columns with the upload card after photos", async () => {
    const user = userEvent.setup();
    renderGallery();
    const first = await screen.findByAltText("one.jpg");
    const second = screen.getByAltText("two.jpg");
    const add = screen.getByRole("button", { name: "Add photos" });
    const grid = add.parentElement!;
    expect(grid).toHaveClass("grid-cols-2", "lg:grid-cols-3");
    expect(grid.children).toHaveLength(3);
    expect(grid.children[0]).toContainElement(first);
    expect(grid.children[1]).toContainElement(second);
    expect(grid.children[2]).toBe(add);
    expect(first.parentElement).toContainElement(screen.getByText("Cover"));
    expect(
      screen.queryByText(/customer gallery isn’t live yet/),
    ).not.toBeInTheDocument();
    await user.click(first);
    expect(screen.getByRole("dialog")).toHaveAttribute(
      "data-slot",
      "image-viewer",
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("shows only the cover upload card when empty", async () => {
    mocks.fetch.mockResolvedValue([]);
    const user = userEvent.setup();
    renderGallery();
    const cover = await screen.findByRole("button", { name: "Cover photo" });
    expect(
      screen.queryByRole("button", { name: "Add other photos" }),
    ).not.toBeInTheDocument();
    expect(cover).toHaveClass(
      "rounded-dashed-surface",
      "border-(length:--dashed-surface-border-width)",
      "border-dashed",
      "bg-transparent",
    );
    expect(cover.parentElement?.children).toHaveLength(1);
    const picker = screen.getByLabelText("Upload photos", {
      selector: "input",
    });
    await user.click(cover);
    expect(picker).toHaveAttribute("multiple");
  });

  it("covers the whole grid for external files, survives child crossings, and accepts drops over photos", async () => {
    renderGallery();
    const image = await screen.findByAltText("one.jpg");
    const transfer = {
      types: ["Files"],
      files: [new File(["pdf"], "bad.pdf", { type: "application/pdf" })],
    };
    fireEvent.dragEnter(image, { dataTransfer: transfer });
    const overlay = screen
      .getByText("Drop it like it's hot")
      .closest("[data-slot=file-drop-overlay]")!;
    expect(overlay).toHaveClass("absolute", "inset-0", "pointer-events-none");
    fireEvent.dragEnter(screen.getByAltText("two.jpg"), {
      dataTransfer: transfer,
    });
    fireEvent.dragLeave(image, { dataTransfer: transfer });
    expect(screen.getByText("Drop it like it's hot")).toBeInTheDocument();
    fireEvent.drop(image, { dataTransfer: transfer });
    expect(screen.queryByText("Drop it like it's hot")).not.toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Each must be a JPEG",
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("hides the file overlay on leave and ignores photo reordering drags", async () => {
    renderGallery();
    const image = await screen.findByAltText("one.jpg");
    fireEvent.dragEnter(image, { dataTransfer: { types: ["text/plain"] } });
    expect(screen.queryByText("Drop it like it's hot")).not.toBeInTheDocument();
    fireEvent.dragEnter(image, { dataTransfer: { types: ["Files"] } });
    expect(screen.getByText("Drop it like it's hot")).toBeInTheDocument();
    fireEvent.dragLeave(image, { dataTransfer: { types: ["Files"] } });
    expect(screen.queryByText("Drop it like it's hot")).not.toBeInTheDocument();
  });

  it("accepts dropped files through the add card and validates them", async () => {
    renderGallery();
    const add = await screen.findByRole("button", { name: "Add photos" });
    fireEvent.drop(add, {
      dataTransfer: {
        files: [new File(["pdf"], "bad.pdf", { type: "application/pdf" })],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Each must be a JPEG",
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("hides upload cards for read-only staff", async () => {
    renderGallery(false);
    await screen.findByAltText("one.jpg");
    expect(
      screen.queryByRole("button", { name: "Add photos" }),
    ).not.toBeInTheDocument();
  });

  it("recovers from a failed gallery load", async () => {
    mocks.fetch
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderGallery();
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("button", { name: "Cover photo" }),
    ).toBeInTheDocument();
  });

  it("rejects unsupported files before creating an upload", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderGallery();
    await screen.findByAltText("one.jpg");
    await user.upload(
      screen.getByLabelText("Upload photos", { selector: "input" }),
      new File(["pdf"], "document.pdf", { type: "application/pdf" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Each must be a JPEG",
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("renders Romanian translations", async () => {
    mocks.fetch.mockResolvedValue([]);
    renderGallery(true, "ro");
    expect(
      await screen.findByRole("button", {
        name: messages.ro.scooters.photos.cover,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Adaugă alte fotografii" }),
    ).not.toBeInTheDocument();
  });
});
