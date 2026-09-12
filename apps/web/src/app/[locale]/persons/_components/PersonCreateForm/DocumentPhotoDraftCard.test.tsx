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
  getTracks: () => [
    {
      stop: stopTrack,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  ],
} as unknown as MediaStream;

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1280,
  });
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 800, height: 600, close: vi.fn() }),
  );
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  restoreProperty(window, "PointerEvent", originalPointerEvent);
  restoreProperty(navigator, "mediaDevices", originalMediaDevices);
  restoreProperty(HTMLMediaElement.prototype, "srcObject", originalSrcObject);
});

describe("DocumentPhotoDraftCard", () => {
  it("opens uploaded images without the camera and allows deletion", async () => {
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
    fireEvent.drop(dialog, {
      dataTransfer: {
        files: [new File(["unsupported"], "id.svg", { type: "image/svg+xml" })],
      },
    });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Choose a JPEG, PNG, WebP or PDF",
    );
    expect(onSet).not.toHaveBeenCalled();
    await browser.click(
      within(dialog).getByRole("button", { name: "Remove Front photo" }),
    );
    expect(onSet).toHaveBeenCalledWith("identity-document", "front", null);
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  it("opens the shared camera directly and offers file imports on desktop", async () => {
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
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    expect(dialog).toHaveClass("h-dvh", "w-full", "max-w-none");
    await browser.click(
      within(dialog).getByRole("button", {
        name: "Choose from gallery or files",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Choose from files" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Choose from gallery" }),
    ).not.toBeInTheDocument();
    await browser.click(
      screen.getByRole("button", { name: "Choose from files" }),
    );
    const original = new File(["image"], "front.png", { type: "image/png" });
    await browser.upload(
      within(dialog).getByLabelText("Choose from files"),
      original,
    );
    expect(onSet).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("dialog", { name: "Crop photo" }),
    ).toBeVisible();
    await browser.click(screen.getByRole("button", { name: "Use photo" }));
    await waitFor(() =>
      expect(onSet).toHaveBeenCalledWith(
        "identity-document",
        "front",
        expect.objectContaining({ type: "image/jpeg" }),
        original,
      ),
    );
  });

  it("offers mobile gallery and files from the camera popup", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 375,
    });
    const browser = userEvent.setup();
    renderCard(vi.fn());
    await browser.click(
      screen.getByRole("button", { name: "Add Front photo" }),
    );
    await browser.click(
      screen.getByRole("button", { name: "Choose from gallery or files" }),
    );
    expect(
      screen.getByRole("button", { name: "Choose from gallery" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Choose from files" }),
    ).toBeEnabled();
  });

  it("captures into crop review without uploading until confirmation", async () => {
    const onSet = vi.fn<SetPersonDocumentPhoto>();
    const browser = userEvent.setup();
    renderCard(onSet);
    await browser.click(
      screen.getByRole("button", { name: "Add Front photo" }),
    );
    await readyCamera();
    await browser.click(screen.getByRole("button", { name: "Capture photo" }));
    expect(
      await screen.findByRole("dialog", { name: "Crop photo" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Rotate photo 90°" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Use photo" })).toBeEnabled();
    expect(onSet).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("re-crops the original upload without starting the camera", async () => {
    const original = new File(["original"], "original.png", {
      type: "image/png",
    });
    const previous = new File(["cropped"], "cropped.jpg", {
      type: "image/jpeg",
    });
    const onSet = vi.fn<SetPersonDocumentPhoto>();
    const browser = userEvent.setup();
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
    expect(
      await screen.findByRole("dialog", { name: "Crop photo" }),
    ).toBeVisible();
    const corner = screen.getByRole("button", {
      name: "Resize north-west corner",
    });
    corner.focus();
    await browser.keyboard("{ArrowRight}{ArrowDown}");
    await browser.click(screen.getByRole("button", { name: "Use photo" }));
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
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("accepts dropped PDFs without starting a camera or offering crop", async () => {
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
    expect(within(dialog).getByTitle("passport.pdf")).toHaveAttribute(
      "src",
      "blob:document-photo",
    );
    expect(
      within(dialog).queryByRole("button", { name: "Rotate photo" }),
    ).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
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

  it("rejects unsupported and oversized dropped files without opening the camera", async () => {
    const onSet = vi.fn<SetPersonDocumentPhoto>();
    renderCard(onSet);
    const card = screen.getByRole("button", { name: "Add Front photo" });
    fireEvent.drop(card, {
      dataTransfer: {
        files: [new File(["bad"], "bad.svg", { type: "image/svg+xml" })],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a JPEG, PNG, WebP or PDF",
    );
    const file = new File(["image"], "large.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 10 * 1024 * 1024 + 1 });
    fireEvent.drop(card, { dataTransfer: { files: [file] } });
    expect(screen.getByRole("alert")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(onSet).not.toHaveBeenCalled();
  });

  it.each([
    "romanian-classic-national-id",
    "romanian-electronic-national-id",
    "driver-license",
    "foreign-residence-permit",
  ])("shows the identity-card guide for %s", async (documentKey) => {
    const browser = userEvent.setup();
    renderCard(vi.fn(), undefined, documentKey);
    await browser.click(
      screen.getByRole("button", { name: "Add Front photo" }),
    );
    await readyCamera();
    expect(
      document.querySelector('[data-slot="identity-card-guide"]'),
    ).toBeVisible();
  });

  it.each([
    "romanian-proof-of-address",
    "foreign-passport",
    "foreign-visa",
    "unknown-document",
  ])("keeps the ordinary camera for %s", async (documentKey) => {
    const browser = userEvent.setup();
    renderCard(vi.fn(), undefined, documentKey);
    await browser.click(
      screen.getByRole("button", { name: "Add Front photo" }),
    );
    await readyCamera();
    expect(
      document.querySelector('[data-slot="identity-card-guide"]'),
    ).not.toBeInTheDocument();
  });

  it("stops late camera streams after closing capture", async () => {
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
    await browser.click(screen.getByRole("button", { name: "Close camera" }));
    await act(async () => resolveCamera(stream));
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("retries uploads using both the confirmed file and its original", async () => {
    const onSet = vi.fn<SetPersonDocumentPhoto>();
    const file = new File(["cropped"], "crop.jpg", { type: "image/jpeg" });
    const original = new File(["original"], "original.png", {
      type: "image/png",
    });
    const browser = userEvent.setup();
    renderCard(onSet, {
      id: "failed",
      status: "failed",
      file,
      originalFile: original,
      message: "Upload failed",
    });
    await browser.click(screen.getByRole("button", { name: "Try again" }));
    expect(onSet).toHaveBeenCalledWith(
      "identity-document",
      "front",
      file,
      original,
    );
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("keeps the uploaded document preview on the popover surface", async () => {
    const browser = userEvent.setup();
    renderCard(vi.fn(), {
      id: "uploaded",
      status: "uploaded",
      file: new File(["image"], "id.png", { type: "image/png" }),
      uploadToken: "token",
    });
    await browser.click(
      screen.getByRole("button", { name: "Change Front photo" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveClass("bg-popover", "text-popover-foreground");
    expect(
      dialog.querySelector(".bg-background:not(button):not(input)"),
    ).toBeNull();
  });
});

async function readyCamera() {
  const video = document.querySelector("video");
  expect(video).not.toBeNull();
  await waitFor(() => expect(video).toHaveProperty("srcObject", stream));
  fireEvent.loadedData(video!);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Capture photo" })).toBeEnabled(),
  );
}

function renderCard(
  onSetDocumentPhoto: SetPersonDocumentPhoto,
  upload?: PersonDocumentPhotoDraftUpload,
  documentKey = "identity-document",
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <DocumentPhotoDraftCard
        inputId="identity-front"
        documentKey={documentKey}
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
