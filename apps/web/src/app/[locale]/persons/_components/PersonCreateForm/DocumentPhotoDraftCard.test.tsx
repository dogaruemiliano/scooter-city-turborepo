import { messages } from "@repo/i18n";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentPhotoDraftCard } from "./DocumentPhotoDraftCard";
import type {
  PersonDocumentPhotoDraftUpload,
  SetPersonDocumentPhoto,
} from "./types";

const originalMediaDevices = Object.getOwnPropertyDescriptor(
  navigator,
  "mediaDevices",
);
const originalPointerEvent = Object.getOwnPropertyDescriptor(
  window,
  "PointerEvent",
);
const originalSrcObject = Object.getOwnPropertyDescriptor(
  HTMLMediaElement.prototype,
  "srcObject",
);

const getUserMedia = vi.fn();
const stopTrack = vi.fn();
const drawImage = vi.fn();
const createObjectURL = vi.fn(() => "blob:document-photo");
const revokeObjectURL = vi.fn();
const stream = {
  getTracks: () => [{ stop: stopTrack }],
} as unknown as MediaStream;

beforeEach(() => {
  getUserMedia.mockReset();
  getUserMedia.mockResolvedValue(stream);
  stopTrack.mockReset();
  drawImage.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    get() {
      return (this as HTMLMediaElement & { __stream?: MediaStream | null })
        .__stream;
    },
    set(value: MediaStream | null) {
      (this as HTMLMediaElement & { __stream?: MediaStream | null }).__stream =
        value;
    },
  });

  vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(
    640,
  );
  vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(
    480,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback) => {
      callback(new Blob(["captured-jpeg"], { type: "image/jpeg" }));
    },
  );
  vi.spyOn(URL, "createObjectURL").mockImplementation(createObjectURL);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(revokeObjectURL);
});

afterEach(() => {
  vi.restoreAllMocks();
  restoreProperty(window, "PointerEvent", originalPointerEvent);
  restoreProperty(navigator, "mediaDevices", originalMediaDevices);
  restoreProperty(HTMLMediaElement.prototype, "srcObject", originalSrcObject);
});

describe("DocumentPhotoDraftCard", () => {
  it("opens existing images at full size without requesting the camera and allows deletion", async () => {
    const onSet = vi.fn<SetPersonDocumentPhoto>();
    const browser = userEvent.setup();
    renderCard(onSet, {
      id: "uploaded",
      status: "uploaded",
      file: new File(["image"], "id.png", { type: "image/png" }),
      uploadToken: "token",
    });
    await browser.click(
      screen.getByRole("button", { name: "Change Front photo" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Front photo" });
    expect(within(dialog).getByRole("img")).toHaveClass("object-contain");
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(
      within(dialog).getByRole("button", { name: "Crop photo" }),
    ).toBeEnabled();
    await browser.click(
      within(dialog).getByRole("button", { name: "Remove Front photo" }),
    );
    expect(onSet).toHaveBeenCalledWith("identity-document", "front", null);
    expect(
      within(dialog).getByRole("button", { name: "Choose from files" }),
    ).toBeEnabled();
  });

  it("offers only files on desktop and commits a selected image after confirmation", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    const onSet = vi.fn<SetPersonDocumentPhoto>();
    const browser = userEvent.setup();
    renderCard(onSet);
    expect(
      screen.getByRole("button", { name: "Add Front photo" }),
    ).toHaveTextContent(/^Front$/);
    await browser.click(
      screen.getByRole("button", { name: "Add Front photo" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Front photo" });
    expect(
      within(dialog).queryByRole("button", { name: "Take photo" }),
    ).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Choose from gallery" }),
    ).toBeNull();
    const file = new File(["image"], "front.png", { type: "image/png" });
    await browser.upload(
      within(dialog).getByLabelText("Choose from files"),
      file,
    );
    expect(onSet).not.toHaveBeenCalled();
    await browser.click(
      within(dialog).getByRole("button", { name: "Use photo" }),
    );
    expect(onSet).toHaveBeenCalledWith(
      "identity-document",
      "front",
      file,
      undefined,
    );
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("starts a full-screen camera only after choosing Take photo and releases it on cancel", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 375,
    });
    const onSet = vi.fn<SetPersonDocumentPhoto>();
    const browser = userEvent.setup();
    renderCard(onSet);
    await browser.click(
      screen.getByRole("button", { name: "Add Front photo" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Front photo" });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(
      within(dialog).getByRole("button", { name: "Choose from gallery" }),
    ).toBeEnabled();
    await browser.click(
      within(dialog).getByRole("button", { name: "Take photo" }),
    );
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    expect(dialog).toHaveClass("h-dvh", "inset-0");
    await waitFor(() =>
      expect(
        within(dialog).getByLabelText("Front camera preview"),
      ).toHaveProperty("srcObject", stream),
    );
    await browser.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(onSet).not.toHaveBeenCalled();
  });

  it("captures into the crop editor without uploading until saved", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 375,
    });
    const onSet = vi.fn<SetPersonDocumentPhoto>();
    const browser = userEvent.setup();
    renderCard(onSet);
    await browser.click(
      screen.getByRole("button", { name: "Add Front photo" }),
    );
    await browser.click(screen.getByRole("button", { name: "Take photo" }));
    const capture = await screen.findByRole("button", {
      name: "Capture photo",
    });
    await waitFor(() => expect(capture).toBeEnabled());
    await browser.click(capture);
    expect(
      await screen.findByRole("dialog", { name: "Crop photo" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Save crop" })).toBeEnabled();
    expect(onSet).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("re-crops from the original file and uploads the new crop", async () => {
    const original = new File(["original"], "original.png", {
      type: "image/png",
    });
    const previous = new File(["cropped"], "cropped.jpg", {
      type: "image/jpeg",
    });
    const onSet = vi.fn<SetPersonDocumentPhoto>();
    const browser = userEvent.setup();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 800, height: 600, close: vi.fn() }),
    );
    renderCard(onSet, {
      id: "uploaded",
      status: "uploaded",
      file: previous,
      originalFile: original,
      uploadToken: "token",
    });
    await browser.click(
      screen.getByRole("button", { name: "Change Front photo" }),
    );
    await browser.click(screen.getByRole("button", { name: "Crop photo" }));
    const corner = screen.getByRole("button", {
      name: "Resize north-west corner",
    });
    corner.focus();
    await browser.keyboard("{ArrowRight}{ArrowDown}");
    await browser.click(screen.getByRole("button", { name: "Save crop" }));
    await waitFor(() => expect(onSet).toHaveBeenCalledOnce());
    expect(createImageBitmap).toHaveBeenCalledWith(
      original,
      expect.any(Object),
    );
    expect(onSet).toHaveBeenCalledWith(
      "identity-document",
      "front",
      expect.objectContaining({ type: "image/jpeg" }),
      original,
    );
    expect(drawImage.mock.calls[0]?.slice(1, 3)).toEqual([8, 6]);
    vi.unstubAllGlobals();
  });

  it("accepts dropped PDFs in identity slots and previews them without cropping", async () => {
    const onSet = vi.fn<SetPersonDocumentPhoto>();
    const browser = userEvent.setup();
    renderCard(onSet);
    const file = new File(["%PDF-document"], "passport.pdf", {
      type: "application/pdf",
    });
    fireEvent.drop(screen.getByRole("button", { name: "Add Front photo" }), {
      dataTransfer: { files: [file] },
    });
    const dialog = await screen.findByRole("dialog", { name: "Front photo" });
    expect(
      within(dialog).getByRole("link", { name: /Open file/ }),
    ).toHaveAttribute("href", "blob:document-photo");
    expect(
      within(dialog).queryByRole("button", { name: "Crop photo" }),
    ).toBeNull();
    await browser.click(
      within(dialog).getByRole("button", { name: "Use file" }),
    );
    expect(onSet).toHaveBeenCalledWith(
      "identity-document",
      "front",
      file,
      undefined,
    );
  });

  it("rejects unsupported and oversized dropped files", async () => {
    const onSet = vi.fn<SetPersonDocumentPhoto>();
    renderCard(onSet);
    fireEvent.drop(screen.getByRole("button", { name: "Add Front photo" }), {
      dataTransfer: {
        files: [new File(["bad"], "bad.svg", { type: "image/svg+xml" })],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a JPEG, PNG, WebP or PDF",
    );
    expect(screen.queryByRole("button", { name: "Use file" })).toBeNull();
    const file = new File(["image"], "large.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 10 * 1024 * 1024 + 1 });
    fireEvent.drop(screen.getByRole("dialog"), {
      dataTransfer: { files: [file] },
    });
    expect(screen.getByRole("alert")).toBeVisible();
    expect(onSet).not.toHaveBeenCalled();
  });

  it("stops late camera streams after the dialog closes", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 375,
    });
    let resolveCamera!: (value: MediaStream) => void;
    getUserMedia.mockReturnValue(
      new Promise<MediaStream>((resolve) => {
        resolveCamera = resolve;
      }),
    );
    const browser = userEvent.setup();
    renderCard(vi.fn());
    await browser.click(
      screen.getByRole("button", { name: "Add Front photo" }),
    );
    await browser.click(screen.getByRole("button", { name: "Take photo" }));
    await browser.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => resolveCamera(stream));
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("keeps all full-screen document surfaces on the popover surface", async () => {
    const browser = userEvent.setup();
    renderCard(vi.fn());
    await browser.click(
      screen.getByRole("button", { name: "Add Front photo" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveClass("bg-popover", "text-popover-foreground");
    expect(
      dialog.querySelector(".bg-background:not(button):not(input)"),
    ).toBeNull();
  });
});

function renderCard(
  onSetDocumentPhoto: SetPersonDocumentPhoto,
  upload?: PersonDocumentPhotoDraftUpload,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <DocumentPhotoDraftCard
        inputId="identity-front"
        documentKey="identity-document"
        slot="front"
        slotLabel="Front"
        upload={upload}
        disabled={false}
        onSetDocumentPhoto={onSetDocumentPhoto}
      />
    </NextIntlClientProvider>,
  );
}

function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
    return;
  }

  Reflect.deleteProperty(target, property);
}
