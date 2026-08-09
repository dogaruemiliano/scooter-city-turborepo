import { messages } from "@repo/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
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
  it("requests the camera lazily and commits a captured JPEG only after confirmation", async () => {
    const onSetDocumentPhoto = vi.fn<SetPersonDocumentPhoto>();
    const browser = userEvent.setup();

    renderCard(onSetDocumentPhoto);

    expect(getUserMedia).not.toHaveBeenCalled();
    await browser.click(
      screen.getByRole("button", { name: "Add Front photo" }),
    );

    const sheet = await screen.findByRole("dialog", { name: "Front photo" });
    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalledOnce();
      expect(getUserMedia).toHaveBeenCalledWith({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
    });
    expect(within(sheet).getByLabelText("Front camera preview")).toHaveProperty(
      "srcObject",
      stream,
    );

    expect(
      within(sheet).getByLabelText("Choose from gallery", {
        selector: "input",
      }),
    ).toHaveAttribute("accept", "image/*");
    expect(
      within(sheet).getByLabelText("Choose from files", {
        selector: "input",
      }),
    ).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");

    const takePhoto = within(sheet).getByRole("button", {
      name: "Take photo",
    });
    await waitFor(() => expect(takePhoto).toBeEnabled());
    await browser.click(takePhoto);

    const usePhoto = await within(sheet).findByRole("button", {
      name: "Use photo",
    });
    expect(drawImage).toHaveBeenCalledOnce();
    expect(onSetDocumentPhoto).not.toHaveBeenCalled();
    expect(
      within(sheet).getByRole("img", { name: "Front document photo" }),
    ).toHaveAttribute("src", "blob:document-photo");

    await browser.click(usePhoto);

    expect(onSetDocumentPhoto).toHaveBeenCalledOnce();
    const [documentKey, slot, file] = onSetDocumentPhoto.mock.calls[0]!;
    expect(documentKey).toBe("identity-document");
    expect(slot).toBe("front");
    expect(file).toBeInstanceOf(File);
    expect(file).toMatchObject({ type: "image/jpeg" });
    expect((file as File).name).toMatch(/^document-front-\d+\.jpg$/);
    await waitForSheetToClose();
  });

  it("stops a live camera and does not commit when cancelled", async () => {
    const onSetDocumentPhoto = vi.fn<SetPersonDocumentPhoto>();
    const browser = userEvent.setup();

    renderCard(onSetDocumentPhoto);
    await browser.click(
      screen.getByRole("button", { name: "Add Front photo" }),
    );

    const sheet = await screen.findByRole("dialog", { name: "Front photo" });
    await waitFor(() =>
      expect(
        within(sheet).getByRole("button", { name: "Take photo" }),
      ).toBeEnabled(),
    );
    expect(stopTrack).not.toHaveBeenCalled();

    await browser.click(within(sheet).getByRole("button", { name: "Cancel" }));

    expect(stopTrack).toHaveBeenCalledOnce();
    expect(onSetDocumentPhoto).not.toHaveBeenCalled();
    await waitForSheetToClose();
  });

  it("stops a live camera on unmount without committing", async () => {
    const onSetDocumentPhoto = vi.fn<SetPersonDocumentPhoto>();
    const browser = userEvent.setup();
    const view = renderCard(onSetDocumentPhoto);

    await browser.click(
      screen.getByRole("button", { name: "Add Front photo" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Front photo" });
    await waitFor(() =>
      expect(
        within(sheet).getByRole("button", { name: "Take photo" }),
      ).toBeEnabled(),
    );

    view.unmount();

    expect(stopTrack).toHaveBeenCalledOnce();
    expect(onSetDocumentPhoto).not.toHaveBeenCalled();
  });

  it("shows a centered retry action after an upload failure", async () => {
    const file = new File(["front-image"], "front.png", {
      type: "image/png",
    });
    const upload: PersonDocumentPhotoDraftUpload = {
      id: "failed-upload",
      status: "failed",
      file,
      message: "The upload failed.",
    };
    const onSetDocumentPhoto = vi.fn<SetPersonDocumentPhoto>();
    const browser = userEvent.setup();

    renderCard(onSetDocumentPhoto, upload);

    expect(screen.getByRole("alert")).toHaveTextContent("The upload failed.");
    expect(
      screen.queryByRole("button", { name: "Remove Front photo" }),
    ).not.toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Try again" }));

    expect(onSetDocumentPhoto).toHaveBeenCalledWith(
      "identity-document",
      "front",
      file,
    );
  });

  it("offers removal only after a photo was uploaded", async () => {
    const upload: PersonDocumentPhotoDraftUpload = {
      id: "uploaded-photo",
      status: "uploaded",
      file: new File(["front-image"], "front.png", { type: "image/png" }),
      uploadToken: "upload-token",
    };
    const onSetDocumentPhoto = vi.fn<SetPersonDocumentPhoto>();
    const browser = userEvent.setup();

    renderCard(onSetDocumentPhoto, upload);
    await browser.click(
      screen.getByRole("button", { name: "Change Front photo" }),
    );

    const sheet = await screen.findByRole("dialog", { name: "Front photo" });
    expect(
      within(sheet).getByRole("button", { name: "Remove Front photo" }),
    ).toBeInTheDocument();
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

async function waitForSheetToClose() {
  await waitFor(
    () => {
      expect(
        screen.queryByRole("dialog", { name: "Front photo" }),
      ).not.toBeInTheDocument();
    },
    { timeout: 2_000 },
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
