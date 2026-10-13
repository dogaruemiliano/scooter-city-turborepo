import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
  showToCustomers: false,
  internalCover: id === "one",
  customerCover: false,
  position: id === "one" ? 0 : 1,
  contentUrl: `/v1/scooters/scooter-1/photos/${id}/content`,
  createdAt: "2026-10-13T10:00:00Z",
  ...extra,
});
const routes = v1.scooters.ROUTES.photos;

function renderGallery(editable = true, locale: "en" | "ro" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ScooterPhotoGallery scooterId="scooter-1" editable={editable} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mocks.fetch
    .mockReset()
    .mockResolvedValue([photo("one"), photo("two", { showToCustomers: true })]);
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("Scooter photo gallery", () => {
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
            showToCustomers: false,
            internalCover: true,
            customerCover: false,
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
    expect(first.parentElement).toContainElement(
      screen.getByText("Internal cover"),
    );
    expect(
      screen.queryByText(/customer gallery isn’t live yet/),
    ).not.toBeInTheDocument();
    await user.click(first);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
    expect(cover).toHaveClass("border-2", "border-dashed", "bg-transparent");
    expect(cover.parentElement?.children).toHaveLength(1);
    const picker = screen.getByLabelText("Upload photos", {
      selector: "input",
    });
    await user.click(cover);
    expect(picker).not.toHaveAttribute("multiple");
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
