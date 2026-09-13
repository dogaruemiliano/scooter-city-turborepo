import { useState } from "react";
import {
  ImageCapture,
  type ImageCaptureProps,
} from "@repo/ui/components/image-capture";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalMediaDevices = Object.getOwnPropertyDescriptor(
  navigator,
  "mediaDevices",
);
const originalInnerWidth = Object.getOwnPropertyDescriptor(
  window,
  "innerWidth",
);
const getUserMedia = vi.fn();
const stopTrack = vi.fn();
const drawImage = vi.fn();
const setTransform = vi.fn();
const fillRect = vi.fn();
const bitmapClose = vi.fn();
const createImageBitmapMock = vi.fn();
const createObjectURL = vi.fn(() => "blob:captured-photo");
const revokeObjectURL = vi.fn();
const track = Object.assign(new EventTarget(), { stop: stopTrack });
const stream = { getTracks: () => [track] } as unknown as MediaStream;

beforeEach(() => {
  getUserMedia.mockReset().mockResolvedValue(stream);
  stopTrack.mockReset();
  drawImage.mockReset();
  setTransform.mockReset();
  fillRect.mockReset();
  bitmapClose.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  createImageBitmapMock
    .mockReset()
    .mockResolvedValue({ width: 640, height: 480, close: bitmapClose });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1280,
  });
  vi.stubGlobal("createImageBitmap", createImageBitmapMock);
  vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(
    640,
  );
  vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(
    480,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
    setTransform,
    fillRect,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback) => {
      callback(new Blob(["camera-frame"], { type: "image/jpeg" }));
    },
  );
  vi.spyOn(URL, "createObjectURL").mockImplementation(createObjectURL);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(revokeObjectURL);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  restoreProperty(navigator, "mediaDevices", originalMediaDevices);
  restoreProperty(window, "innerWidth", originalInnerWidth);
});

describe("shared ImageCapture", () => {
  it("keeps the guide inside the full camera frame as the measured viewport changes", async () => {
    let viewport = { width: 390, height: 844 };
    const width = vi
      .spyOn(HTMLVideoElement.prototype, "videoWidth", "get")
      .mockReturnValue(1080);
    const height = vi
      .spyOn(HTMLVideoElement.prototype, "videoHeight", "get")
      .mockReturnValue(1440);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const size =
          this.dataset.slot === "camera-stage"
            ? viewport
            : this.tagName === "HEADER"
              ? { width: viewport.width, height: 80 }
              : this.tagName === "FOOTER"
                ? { width: viewport.width, height: 176 }
                : { width: 0, height: 0 };
        return {
          ...size,
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: size.width,
          bottom: size.height,
          toJSON() {},
        };
      },
    );
    render(<CaptureHarness onCapture={vi.fn()} captureMode="identity-card" />);
    const video = await cameraReady();
    const frame = document.querySelector<HTMLElement>(
      '[data-slot="camera-preview-frame"]',
    )!;
    const guide = document.querySelector<HTMLElement>(
      '[data-slot="identity-card-guide"]',
    )!;
    await waitFor(() =>
      expect(frame).toHaveStyle({ width: "390px", height: "520px" }),
    );
    expect(frame).toContainElement(video);
    expect(frame).toContainElement(guide);
    expect(Number.parseFloat(frame.style.top)).toBeGreaterThanOrEqual(80);
    expect(Number.parseFloat(frame.style.top) + 520).toBeLessThanOrEqual(
      844 - 176,
    );

    viewport = { width: 360, height: 640 };
    width.mockReturnValue(1080);
    height.mockReturnValue(1920);
    fireEvent.resize(video);
    fireEvent(window, new Event("resize"));
    await waitFor(() =>
      expect(frame).toHaveStyle({
        top: "0px",
        width: "360px",
        height: "640px",
      }),
    );
    expect(
      Number.parseFloat(guide.parentElement!.style.top),
    ).toBeGreaterThanOrEqual(80);
    expect(
      Number.parseFloat(guide.parentElement!.style.bottom),
    ).toBeGreaterThanOrEqual(176);
    expect(screen.getByRole("button", { name: "Take photo" })).toBeEnabled();
  });

  it("keeps native camera pixels through capture instead of clipping them to the display", async () => {
    vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(
      3000,
    );
    vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(
      4000,
    );
    const onCapture = vi.fn();
    render(
      <CaptureHarness
        onCapture={onCapture}
        captureMode="identity-card"
        allowCrop={false}
      />,
    );
    const video = await cameraReady();
    await userEvent.click(screen.getByRole("button", { name: "Take photo" }));
    expect(
      await screen.findByRole("dialog", { name: "Review photo" }),
    ).toBeVisible();
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(video, 0, 0, 3000, 4000);
    await userEvent.click(screen.getByRole("button", { name: "Use photo" }));
    expect(onCapture).toHaveBeenCalledOnce();
    expect(createImageBitmapMock).not.toHaveBeenCalled();
  });

  it.each([
    ["identity-card", 4096, 0.92],
    ["photo", 2048, 0.85],
  ] as const)(
    "uses the %s export size and quality when confirming a large image",
    async (captureMode, maximumEdge, quality) => {
      createImageBitmapMock.mockResolvedValue({
        width: 6000,
        height: 4000,
        close: bitmapClose,
      });
      const onCapture = vi.fn();
      const original = new File(["original"], "id.jpg", { type: "image/jpeg" });
      render(
        <CaptureHarness
          onCapture={onCapture}
          initialFile={original}
          captureMode={captureMode}
        />,
      );
      await userEvent.click(screen.getByRole("button", { name: "Use photo" }));
      await waitFor(() => expect(onCapture).toHaveBeenCalledOnce());
      const exportCall = drawImage.mock.calls.at(-1)!;
      expect(Math.max(exportCall[7], exportCall[8])).toBe(maximumEdge);
      expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenLastCalledWith(
        expect.any(Function),
        "image/jpeg",
        quality,
      );
      expect(onCapture).toHaveBeenCalledWith(expect.any(File), {
        originalFile: original,
      });
    },
  );

  it("shows the vertical ID guide only in the live identity-card camera", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 375,
    });
    vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(
      480,
    );
    vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(
      640,
    );
    const { unmount } = render(
      <CaptureHarness onCapture={vi.fn()} captureMode="identity-card" />,
    );
    await cameraReady();
    expect(
      document.querySelector('[data-slot="identity-card-guide"]'),
    ).toBeVisible();
    expect(screen.getByText("Turn the ID, not your phone.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Take photo" }));
    expect(
      await screen.findByRole("dialog", { name: "Crop photo" }),
    ).toBeVisible();
    expect(
      document.querySelector('[data-slot="identity-card-guide"]'),
    ).toBeNull();
    expect(
      screen.queryByText("Turn the ID, not your phone."),
    ).not.toBeInTheDocument();
    unmount();
    render(<CaptureHarness onCapture={vi.fn()} />);
    await cameraReady();
    expect(
      document.querySelector('[data-slot="identity-card-guide"]'),
    ).toBeNull();
  });

  it.each([
    ["desktop with landscape camera", 1280, 640, 480],
    ["desktop with portrait camera", 1280, 480, 640],
    ["phone with landscape camera", 375, 640, 480],
  ])(
    "omits the animated rotation cue for %s",
    async (_, viewportWidth, sourceWidth, sourceHeight) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: viewportWidth,
      });
      vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(
        sourceWidth as number,
      );
      vi.spyOn(
        HTMLVideoElement.prototype,
        "videoHeight",
        "get",
      ).mockReturnValue(sourceHeight as number);
      render(
        <CaptureHarness onCapture={vi.fn()} captureMode="identity-card" />,
      );
      await cameraReady();
      expect(
        document.querySelector('[data-slot="identity-card-guide"]'),
      ).toBeVisible();
      expect(
        document.querySelector('[data-slot="identity-card-orientation-cue"]'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Turn the ID, not your phone."),
      ).not.toBeInTheDocument();
    },
  );

  it("reopens the original directly for crop and rotates from that original before confirming", async () => {
    const original = new File(["original"], "id.jpg", { type: "image/jpeg" });
    const onCapture = vi.fn();
    render(
      <CaptureHarness
        onCapture={onCapture}
        initialFile={original}
        captureMode="identity-card"
      />,
    );
    expect(screen.getByRole("dialog", { name: "Crop photo" })).toBeVisible();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-slot="identity-card-guide"]'),
    ).toBeNull();
    const rotate = screen.getByRole("button", { name: "Rotate photo 90°" });
    await userEvent.click(rotate);
    await waitFor(() => expect(rotate).toBeEnabled());
    await userEvent.click(rotate);
    await waitFor(() => expect(rotate).toBeEnabled());
    expect(
      createImageBitmapMock.mock.calls.slice(0, 2).map((call) => call[0]),
    ).toEqual([original, original]);
    expect(onCapture).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Use photo" }));
    expect(onCapture).toHaveBeenCalledWith(expect.any(File), {
      originalFile: original,
    });
  });

  it("straightens the loaded preview in tenths of a degree without exporting or uploading", async () => {
    const onCapture = vi.fn();
    render(
      <CaptureHarness
        onCapture={onCapture}
        initialFile={
          new File(["original"], "receipt.jpg", { type: "image/jpeg" })
        }
      />,
    );
    loadCropPreview();
    const slider = screen.getByRole("slider", { name: "Straighten photo" });
    expect(slider).toHaveAttribute("aria-valuemin", "-15");
    expect(slider).toHaveAttribute("aria-valuemax", "15");
    expect(slider).toHaveAttribute("aria-valuenow", "0");

    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider).toHaveAttribute("aria-valuenow", "0.1");
    const transformed = document.querySelector<HTMLImageElement>(
      '[data-slot="crop-transformed-image"]',
    )!;
    expect(matrixAngle(transformed.style.transform)).toBeCloseTo(0.1, 6);
    fireEvent.keyDown(slider, { key: "PageUp" });
    expect(slider).toHaveAttribute("aria-valuenow", "1.1");
    expect(matrixAngle(transformed.style.transform)).toBeCloseTo(1.1, 6);
    fireEvent.keyDown(slider, { key: "Home" });
    expect(slider).toHaveAttribute("aria-valuenow", "-15");
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(slider).toHaveAttribute("aria-valuenow", "-15");
    fireEvent.keyDown(slider, { key: "End" });
    expect(slider).toHaveAttribute("aria-valuenow", "15");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider).toHaveAttribute("aria-valuenow", "15");
    expect(createImageBitmapMock).not.toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled();
    expect(onCapture).not.toHaveBeenCalled();
  });

  it("cancels editing directly to the camera without saving and starts fresh on the next import", async () => {
    const original = new File(["original"], "receipt.jpg", {
      type: "image/jpeg",
    });
    const onCapture = vi.fn();
    render(<CaptureHarness onCapture={onCapture} initialFile={original} />);
    fireEvent.keyDown(
      screen.getByRole("slider", { name: "Straighten photo" }),
      { key: "ArrowRight" },
    );
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Resize north-west corner" }),
      { key: "ArrowRight" },
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel editing" }),
    );
    await cameraReady();
    expect(screen.queryByRole("dialog", { name: "Review photo" })).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(onCapture).not.toHaveBeenCalled();
    expect(createImageBitmapMock).not.toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:captured-photo");
    await userEvent.upload(screen.getByLabelText("Files"), original);
    expect(
      screen.getByRole("slider", { name: "Straighten photo" }),
    ).toHaveAttribute("aria-valuenow", "0");
    expect(
      screen.getByRole("button", { name: "Resize north-west corner" }).style
        .left,
    ).toBe("4%");
    await userEvent.click(screen.getByRole("button", { name: "Use photo" }));
    expect(onCapture).toHaveBeenCalledExactlyOnceWith(expect.any(File), {
      originalFile: original,
    });
  });

  it("uses a text reset and restores all edits from the original", async () => {
    const original = new File(["original"], "receipt.jpg", {
      type: "image/jpeg",
    });
    const onCapture = vi.fn();
    render(<CaptureHarness onCapture={onCapture} initialFile={original} />);
    const rotate = screen.getByRole("button", { name: "Rotate photo 90°" });
    const reset = screen.getByRole("button", { name: "Reset" });
    expect(rotate.closest("header")).not.toBeNull();
    expect(reset.closest("header")).not.toBeNull();
    expect(reset).toHaveClass("text-primary");
    expect(reset).toHaveTextContent("Reset");
    expect(reset.querySelector(".lucide-rotate-ccw")).toBeNull();

    await userEvent.click(rotate);
    await waitFor(() => expect(rotate).toBeEnabled());
    const slider = screen.getByRole("slider", { name: "Straighten photo" });
    const corner = screen.getByRole("button", {
      name: "Resize north-west corner",
    });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyDown(corner, { key: "ArrowRight" });
    expect(corner.style.left).toBe("5%");
    createObjectURL.mockClear();
    createImageBitmapMock.mockClear();
    setTransform.mockClear();
    drawImage.mockClear();
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockClear();

    await userEvent.click(reset);
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    expect(
      screen.getByRole("button", { name: "Resize north-west corner" }).style
        .left,
    ).toBe("4%");
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(original));
    expect(createImageBitmapMock).not.toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled();
    expect(onCapture).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Use photo" }));
    await waitFor(() => expect(onCapture).toHaveBeenCalledOnce());
    expect(createImageBitmapMock).toHaveBeenCalledExactlyOnceWith(original, {
      imageOrientation: "from-image",
    });
    expect(setTransform).not.toHaveBeenCalled();
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ width: 640, height: 480 }),
      26,
      19,
      589,
      442,
      0,
      0,
      589,
      442,
    );
  });

  it("fits the selection after release and resets framing before exporting the crop", async () => {
    const originalBounds = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (
          this.dataset.slot !== "crop-available-space" &&
          this.dataset.slot !== "receipt-crop-frame"
        ) {
          return originalBounds.call(this);
        }
        const available = this.dataset.slot === "crop-available-space";
        const width = available
          ? 400
          : Number.parseFloat(this.style.width) || 0;
        const height = available
          ? 600
          : Number.parseFloat(this.style.height) || 0;
        const left = available ? 0 : Number.parseFloat(this.style.left) || 0;
        const top = available ? 0 : Number.parseFloat(this.style.top) || 0;
        return {
          x: left,
          y: top,
          left,
          top,
          width,
          height,
          right: left + width,
          bottom: top + height,
          toJSON() {},
        };
      },
    );
    const onCapture = vi.fn();
    render(
      <CaptureHarness
        onCapture={onCapture}
        initialFile={
          new File(["original"], "receipt.jpg", { type: "image/jpeg" })
        }
      />,
    );
    loadCropPreview();
    const frame = document.querySelector<HTMLElement>(
      '[data-slot="receipt-crop-frame"]',
    )!;
    const initialWidth = Number.parseFloat(frame.style.width);
    const zoomOut = screen.getByRole("button", { name: "Show entire photo" });
    expect(zoomOut.closest("footer")).toBe(
      screen.getByRole("button", { name: "Use photo" }).closest("footer"),
    );
    expect(zoomOut).not.toHaveClass("absolute");
    let corner = screen.getByRole("button", {
      name: "Resize north-west corner",
    });
    fireEvent.keyDown(corner, { key: "ArrowRight" });
    expect(Number.parseFloat(frame.style.width)).toBe(initialWidth);
    fireEvent.keyUp(corner, { key: "ArrowRight" });
    expect(Number.parseFloat(frame.style.width)).toBeGreaterThan(initialWidth);
    expect(corner.style.left).toBe("5%");

    fireEvent.keyDown(corner, { key: "ArrowRight" });
    fireEvent.keyUp(corner, { key: "ArrowRight" });
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(
      screen.getByRole("button", { name: "Show entire photo" }),
    ).toBeVisible();
    expect(Number.parseFloat(frame.style.width)).toBe(initialWidth);
    corner = screen.getByRole("button", { name: "Resize north-west corner" });
    expect(corner.style.left).toBe("4%");

    fireEvent.keyDown(corner, { key: "ArrowRight" });
    fireEvent.keyUp(corner, { key: "ArrowRight" });
    const zoomedWidth = Number.parseFloat(frame.style.width);
    await userEvent.click(
      screen.getByRole("button", { name: "Show entire photo" }),
    );
    expect(Number.parseFloat(frame.style.width)).toBeLessThan(zoomedWidth);
    expect(corner.style.left).toBe("5%");
    expect(onCapture).not.toHaveBeenCalled();
    expect(createImageBitmapMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Use photo" }));
    await waitFor(() => expect(onCapture).toHaveBeenCalledOnce());
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ width: 640, height: 480 }),
      32,
      19,
      582,
      442,
      0,
      0,
      582,
      442,
    );
  });

  it("combines retained tilt with a quarter-turn when exporting the original only on confirmation", async () => {
    const original = new File(["original"], "receipt.jpg", {
      type: "image/jpeg",
    });
    const onCapture = vi.fn();
    render(<CaptureHarness onCapture={onCapture} initialFile={original} />);
    const slider = screen.getByRole("slider", { name: "Straighten photo" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    const rotate = screen.getByRole("button", { name: "Rotate photo 90°" });
    await userEvent.click(rotate);
    await waitFor(() => expect(rotate).toBeEnabled());
    expect(slider).toHaveAttribute("aria-valuenow", "0.1");
    expect(onCapture).not.toHaveBeenCalled();

    setTransform.mockClear();
    drawImage.mockClear();
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Use photo" }));
    await waitFor(() => expect(onCapture).toHaveBeenCalledOnce());
    expect(createImageBitmapMock.mock.calls.map((call) => call[0])).toEqual([
      original,
      original,
    ]);
    expect(setTransform).toHaveBeenCalledOnce();
    const [a, b] = setTransform.mock.calls[0]! as number[];
    expect((Math.atan2(b!, a!) * 180) / Math.PI).toBeCloseTo(90.1, 6);
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ width: 640, height: 480 }),
      0,
      0,
    );
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledOnce();
    expect(onCapture).toHaveBeenCalledWith(expect.any(File), {
      originalFile: original,
    });
  });

  it("starts fresh tilt for a replacement file and after retaking a photo", async () => {
    render(
      <CaptureHarness
        onCapture={vi.fn()}
        initialFile={
          new File(["original"], "receipt.jpg", { type: "image/jpeg" })
        }
      />,
    );
    const firstSlider = screen.getByRole("slider", {
      name: "Straighten photo",
    });
    fireEvent.keyDown(firstSlider, { key: "ArrowRight" });
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel editing" }),
    );
    fireEvent.drop(screen.getByRole("dialog"), {
      dataTransfer: {
        files: [
          new File(["replacement"], "replacement.jpg", { type: "image/jpeg" }),
        ],
      },
    });
    const replacementSlider = screen.getByRole("slider", {
      name: "Straighten photo",
    });
    expect(replacementSlider).toHaveAttribute("aria-valuenow", "0");
    fireEvent.keyDown(replacementSlider, { key: "ArrowLeft" });
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel editing" }),
    );
    await cameraReady();
    await userEvent.click(screen.getByRole("button", { name: "Take photo" }));
    expect(
      await screen.findByRole("slider", { name: "Straighten photo" }),
    ).toHaveAttribute("aria-valuenow", "0");
  });

  it("ignores initial files when only live photos are permitted", async () => {
    render(
      <CaptureHarness
        onCapture={vi.fn()}
        allowGallery={false}
        initialFile={new File(["existing"], "id.jpg", { type: "image/jpeg" })}
      />,
    );
    await cameraReady();
    expect(screen.getByRole("button", { name: "Take photo" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Use photo" }),
    ).not.toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("does not request a camera until opened, and closes its stream with the close button", async () => {
    const onCapture = vi.fn();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <CaptureHarness initialOpen={false} onCapture={onCapture} />,
    );
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(
      <CaptureHarness
        key="open"
        onCapture={onCapture}
        onOpenChange={onOpenChange}
      />,
    );
    await cameraReady();
    expect(screen.getByRole("dialog")).toHaveClass("h-dvh", "w-full");
    await userEvent.click(screen.getByRole("button", { name: "Close camera" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(onCapture).not.toHaveBeenCalled();
  });

  it("blocks every import path when gallery access is disabled", async () => {
    const onCapture = vi.fn();
    render(<CaptureHarness onCapture={onCapture} allowGallery={false} />);
    await cameraReady();
    expect(
      screen.queryByRole("button", { name: "Choose from gallery or files" }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    fireEvent.drop(screen.getByRole("dialog"), {
      dataTransfer: {
        files: [new File(["photo"], "existing.jpg", { type: "image/jpeg" })],
      },
    });
    expect(screen.getByRole("button", { name: "Take photo" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Use photo" }),
    ).not.toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(onCapture).not.toHaveBeenCalled();
  });

  it("offers files on desktop and gallery plus files on mobile", async () => {
    const { unmount } = render(<CaptureHarness onCapture={vi.fn()} />);
    const openPicker = vi.spyOn(screen.getByLabelText("Files"), "click");
    expect(screen.getByRole("button", { name: "Files" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Files" }));
    expect(openPicker).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Gallery" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Gallery")).not.toBeInTheDocument();
    unmount();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 375,
    });
    render(
      <CaptureHarness
        onCapture={vi.fn()}
        accept="image/jpeg,image/png,application/pdf"
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Choose from gallery or files" }),
    );
    expect(screen.getByRole("button", { name: "Gallery" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Files" })).toBeEnabled();
    expect(screen.getByLabelText("Gallery")).toHaveAttribute(
      "accept",
      "image/jpeg,image/png",
    );
    expect(screen.getByLabelText("Files")).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,application/pdf",
    );
  });

  it("rejects unsupported and oversized imports before opening a preview", async () => {
    const onCapture = vi.fn();
    render(<CaptureHarness onCapture={onCapture} maxFileSize={8} />);
    await cameraReady();
    const dialog = screen.getByRole("dialog");
    fireEvent.drop(dialog, {
      dataTransfer: {
        files: [new File(["pdf"], "document.pdf", { type: "application/pdf" })],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This file format is not supported.",
    );
    fireEvent.change(screen.getByLabelText("Files"), {
      target: {
        files: [
          new File(["too-large-photo"], "large.png", { type: "image/png" }),
        ],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This file is too large.",
    );
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(onCapture).not.toHaveBeenCalled();
    expect(stopTrack).not.toHaveBeenCalled();
  });

  it("accepts an allowed PDF by drop and returns the unchanged file without cropping", async () => {
    const onCapture = vi.fn();
    const file = new File(["pdf"], "document.pdf", { type: "application/pdf" });
    render(
      <CaptureHarness onCapture={onCapture} accept="image/*,application/pdf" />,
    );
    await cameraReady();
    fireEvent.drop(screen.getByRole("dialog"), {
      dataTransfer: { files: [file] },
    });
    expect(screen.getByTitle("document.pdf")).toHaveAttribute(
      "src",
      "blob:captured-photo",
    );
    expect(
      screen.queryByRole("button", { name: "Resize north-west corner" }),
    ).not.toBeInTheDocument();
    expect(onCapture).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("slider", { name: "Straighten photo" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset tilt" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Use file" }));
    expect(onCapture).toHaveBeenCalledExactlyOnceWith(file, {
      originalFile: file,
    });
    expect(createImageBitmapMock).not.toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:captured-photo");
  });

  it("captures into the crop editor, applies corner changes, and only submits on confirmation", async () => {
    const onCapture = vi.fn();
    render(<CaptureHarness onCapture={onCapture} />);
    await cameraReady();
    await userEvent.click(screen.getByRole("button", { name: "Take photo" }));
    expect(
      await screen.findByRole("dialog", { name: "Crop photo" }),
    ).toBeVisible();
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(onCapture).not.toHaveBeenCalled();
    const corner = screen.getByRole("button", {
      name: "Resize north-west corner",
    });
    fireEvent.keyDown(corner, { key: "ArrowRight" });
    fireEvent.keyDown(corner, { key: "ArrowDown" });
    await userEvent.click(screen.getByRole("button", { name: "Use photo" }));
    expect(onCapture).toHaveBeenCalledOnce();
    const captured = onCapture.mock.calls[0]?.[0] as File;
    expect(captured).toBeInstanceOf(File);
    expect(captured.type).toBe("image/jpeg");
    expect(captured.name).toMatch(/^photo-\d+-cropped\.jpg$/);
    expect(drawImage).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 640, height: 480 }),
      32,
      24,
      582,
      437,
      0,
      0,
      582,
      437,
    );
    expect(bitmapClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("bypasses the crop editor when allowCrop is false", async () => {
    const onCapture = vi.fn();
    render(<CaptureHarness onCapture={onCapture} allowCrop={false} />);
    await cameraReady();
    await userEvent.click(screen.getByRole("button", { name: "Take photo" }));
    expect(
      await screen.findByRole("dialog", { name: "Review photo" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Resize north-west corner" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Selected photo" })).toBeVisible();
    expect(
      screen.queryByRole("slider", { name: "Straighten photo" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset tilt" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Use photo" }));
    expect(onCapture).toHaveBeenCalledOnce();
    expect(onCapture.mock.calls[0]?.[0].name).toMatch(/^photo-\d+\.jpg$/);
    expect(createImageBitmapMock).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "retakes a photo with a new stream and releases the previous preview (allowCrop=%s)",
    async (allowCrop) => {
      const onCapture = vi.fn();
      render(<CaptureHarness onCapture={onCapture} allowCrop={allowCrop} />);
      await cameraReady();
      await userEvent.click(screen.getByRole("button", { name: "Take photo" }));
      await userEvent.click(
        await screen.findByRole("button", {
          name: allowCrop ? "Cancel editing" : "Retake",
        }),
      );
      await cameraReady();
      expect(getUserMedia).toHaveBeenCalledTimes(2);
      expect(stopTrack).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:captured-photo");
      expect(onCapture).not.toHaveBeenCalled();
    },
  );

  it("keeps a failed save open and allows the same file to be retried", async () => {
    const onCapture = vi
      .fn()
      .mockRejectedValueOnce(new Error("Upload unavailable"))
      .mockResolvedValueOnce(undefined);
    const file = new File(["photo"], "photo.png", { type: "image/png" });
    render(<CaptureHarness onCapture={onCapture} allowCrop={false} />);
    await cameraReady();
    await userEvent.upload(screen.getByLabelText("Files"), file);
    await userEvent.click(screen.getByRole("button", { name: "Use photo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Upload unavailable",
    );
    expect(screen.getByRole("button", { name: "Use photo" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Use photo" }));
    expect(onCapture).toHaveBeenNthCalledWith(1, file, { originalFile: file });
    expect(onCapture).toHaveBeenNthCalledWith(2, file, { originalFile: file });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stops a camera granted after the component was closed", async () => {
    let grantCamera!: (stream: MediaStream) => void;
    getUserMedia.mockReturnValue(
      new Promise<MediaStream>((resolve) => {
        grantCamera = resolve;
      }),
    );
    render(<CaptureHarness onCapture={vi.fn()} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    await userEvent.click(screen.getByRole("button", { name: "Close camera" }));
    await act(async () => {
      grantCamera(stream);
    });
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stops an active camera if its parent unmounts", async () => {
    const { unmount } = render(<CaptureHarness onCapture={vi.fn()} />);
    const video = await cameraReady();
    unmount();
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(video.isConnected).toBe(false);
  });

  it("disables the shutter when a camera disconnects while keeping file import available", async () => {
    render(<CaptureHarness onCapture={vi.fn()} />);
    await cameraReady();
    act(() => {
      track.dispatchEvent(new Event("ended"));
    });
    expect(screen.getByRole("button", { name: "Take photo" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Camera unavailable");
    expect(screen.getByRole("button", { name: "Files" })).toBeEnabled();
  });
});

function loadCropPreview() {
  const image = screen.getByRole("img", { name: "Selected photo" });
  Object.defineProperties(image, {
    naturalWidth: { value: 640, configurable: true },
    naturalHeight: { value: 480, configurable: true },
  });
  fireEvent.load(image);
}

function matrixAngle(transform: string) {
  const values = transform
    .match(/matrix(?:3d)?\(([^)]+)\)/)?.[1]
    ?.split(",")
    .map(Number);
  if (!values)
    throw new Error(`Expected a preview transform matrix, got ${transform}`);
  return (Math.atan2(values[1]!, values[0]!) * 180) / Math.PI;
}

async function cameraReady() {
  const video = await screen.findByLabelText<HTMLVideoElement>("Add a photo", {
    selector: "video",
  });
  await waitFor(() => expect(video.srcObject).toBe(stream));
  fireEvent.loadedData(video);
  expect(screen.getByRole("button", { name: "Take photo" })).toBeEnabled();
  return video;
}

function CaptureHarness({
  initialOpen = true,
  onOpenChange,
  ...props
}: Omit<ImageCaptureProps, "open" | "onOpenChange"> & {
  initialOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <ImageCapture
      {...props}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
      }}
    />
  );
}

function restoreProperty(
  target: object,
  name: string,
  descriptor?: PropertyDescriptor,
) {
  if (descriptor) Object.defineProperty(target, name, descriptor);
  else Reflect.deleteProperty(target, name);
}
