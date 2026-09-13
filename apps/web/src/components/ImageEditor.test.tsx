import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ImageEditor,
  type ImageEditorProps,
} from "@repo/ui/components/image-editor";
import { DEFAULT_IMAGE_CROP } from "@repo/ui/lib/crop-image";

const { cropImage, rotateImage } = vi.hoisted(() => ({
  cropImage: vi.fn<typeof import("@repo/ui/lib/crop-image").cropImage>(),
  rotateImage: vi.fn<typeof import("@repo/ui/lib/crop-image").rotateImage>(),
}));

vi.mock("@repo/ui/lib/crop-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/ui/lib/crop-image")>()),
  cropImage,
  rotateImage,
}));

const original = new File(["original pixels"], "document.png", {
  type: "image/png",
});
const rotated = new File(["quarter-turn preview"], "rotated.jpg", {
  type: "image/jpeg",
});
const output = new File(["edited pixels"], "document.jpg", {
  type: "image/jpeg",
});

beforeEach(() => {
  cropImage.mockReset().mockResolvedValue(output);
  rotateImage.mockReset().mockResolvedValue(rotated);
  vi.spyOn(URL, "createObjectURL").mockImplementation((file) =>
    file === original ? "blob:original" : "blob:rotated",
  );
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("shared ImageEditor", () => {
  it("uses the entire viewport beneath floating controls and enlarges the default crop on mobile", async () => {
    let bottomControlsHeight = 180;
    const measure = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.dataset.slot === "crop-available-space")
          return {
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 390,
            bottom: 844,
            width: 390,
            height: 844,
            toJSON() {},
          };
        if (
          this.tagName === "HEADER" ||
          this.dataset.slot === "image-editor-controls"
        )
          return {
            ...measure.call(this),
            height: this.tagName === "HEADER" ? 72 : bottomControlsHeight,
          };
        return measure.call(this);
      },
    );
    await renderEditor();
    loadImage();
    const viewport = document.querySelector(
      '[data-slot="image-editor-viewport"]',
    )!;
    const frame = document.querySelector<HTMLElement>(
      '[data-slot="receipt-crop-frame"]',
    )!;
    const controls = document.querySelector(
      '[data-slot="image-editor-controls"]',
    )!;
    expect(viewport).toHaveClass("absolute", "inset-0");
    expect(controls).toHaveClass("absolute", "bottom-0", "z-raised");
    expect(controls).not.toHaveClass("bg-background");
    expect(document.querySelector("header")).toHaveClass("absolute", "top-0");
    const cropLeft = () =>
      Number.parseFloat(frame.style.left) +
      Number.parseFloat(frame.style.width) * DEFAULT_IMAGE_CROP.x;
    expect(cropLeft()).toBeCloseTo(12);
    expect(
      Number.parseFloat(frame.style.width) * DEFAULT_IMAGE_CROP.width,
    ).toBeCloseTo(366);
    const initialTop = Number.parseFloat(frame.style.top);
    bottomControlsHeight = 220;
    fireEvent(window, new Event("resize"));
    expect(Number.parseFloat(frame.style.top)).toBeCloseTo(initialTop - 20);
    expect(cropLeft()).toBeCloseTo(12);
    const mask = document.querySelector('[data-slot="crop-outside-mask"]')!;
    expect(mask.children[0]).toHaveStyle({
      height: "100dvh",
      left: "-100vw",
      right: "-100vw",
    });
    expect(mask.children[2]).toHaveStyle({ width: "100vw" });
    // Corrections move the image beneath the selection, even after resizing it.
    for (const resized of [false, true]) {
      if (resized) resizeCrop();
      const frameStyle = frame.style.cssText;
      const image = screen.getByRole<HTMLImageElement>("img", {
        name: "Selected photo",
      });
      for (const axis of [
        "Straighten",
        "Vertical perspective",
        "Horizontal perspective",
      ]) {
        for (const key of ["End", "Home"]) {
          const transform = image.style.transform;
          adjustAxis(axis, key);
          expect(frame.style.cssText).toBe(frameStyle);
          expect(image.style.transform).not.toBe(transform);
        }
      }
    }
    expect(cropImage).not.toHaveBeenCalled();
  });

  it("keeps the header to cancel, primary reset, and quarter-turn controls", async () => {
    await renderEditor();
    const dialog = screen.getByRole("dialog", { name: "Edit photo" });
    const header = dialog.querySelector("header")!;
    expect(
      within(header)
        .getAllByRole("button")
        .map(
          (button) => button.getAttribute("aria-label") ?? button.textContent,
        ),
    ).toEqual(["Cancel editing", "Reset", "Rotate photo 90°"]);
    expect(within(header).getByRole("button", { name: "Reset" })).toHaveClass(
      "text-primary",
    );
    expect(within(header).queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit photo" })).toHaveClass(
      "sr-only",
    );
    expect(
      within(header).getByRole("button", { name: "Cancel editing" }),
    ).toHaveTextContent("");
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
  });

  it("orders the straighten, vertical, and horizontal perspective symbols", async () => {
    await renderEditor();
    const axes = screen.getByRole("group", { name: "Edit photo" });
    const buttons = within(axes).getAllByRole("button");
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Straighten",
      "Vertical perspective",
      "Horizontal perspective",
    ]);
    expect(
      [...axes.querySelectorAll("svg")].map((icon) =>
        icon.getAttribute("data-axis"),
      ),
    ).toEqual(["z", "x", "y"]);
    // The requested symbols distinguish the three axes without a visible label.
    expect(buttons[0]!.querySelector("circle")).toHaveAttribute("r", "8");
    expect(buttons[0]!.querySelector("path")).toHaveAttribute("d", "M2 12h20");
    expect(
      [...buttons[1]!.querySelectorAll("path")].map((path) =>
        path.getAttribute("d"),
      ),
    ).toEqual(["M8 4h8l5 16H3Z", "M12 2v20"]);
    expect(
      [...buttons[2]!.querySelectorAll("path")].map((path) =>
        path.getAttribute("d"),
      ),
    ).toEqual(["M20 8v8L4 21V3Z", "M2 12h20"]);
    for (const button of buttons)
      expect(button.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
  });

  it("keeps each axis independent and immediately projects the original preview", async () => {
    const { onSave } = await renderEditor();
    const image = loadImage();
    const initialTransform = image.style.transform;
    adjustAxis("Straighten", "End");
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "15");
    expect(image.style.transform).not.toBe(initialTransform);
    const straightened = image.style.transform;
    adjustAxis("Vertical perspective", "End");
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuemax", "45");
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "45");
    expect(image.style.transform).not.toBe(straightened);
    adjustAxis("Horizontal perspective", "Home");
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuemin", "-45");
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "-45");
    for (const [axis, value] of [
      ["Straighten", "15"],
      ["Vertical perspective", "45"],
      ["Horizontal perspective", "-45"],
    ]) {
      fireEvent.click(screen.getByRole("button", { name: axis }));
      expect(screen.getByRole("slider")).toHaveAttribute(
        "aria-valuenow",
        value,
      );
      expect(screen.getByRole("button", { name: axis })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
    expect(image).toHaveAttribute("src", "blob:original");
    expect(
      document.querySelector('[data-slot="crop-alignment-grid"]'),
    ).toBeInTheDocument();
    expect(cropImage).not.toHaveBeenCalled();
    expect(rotateImage).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("exports from the original once with the crop, quarter-turn, and every axis", async () => {
    const { onSave } = await renderEditor({ maxEdge: 4096, quality: 0.92 });
    await quarterTurn();
    expect(rotateImage).toHaveBeenCalledWith(original, 1, { quality: 0.92 });
    expect(screen.getByRole("img", { name: "Selected photo" })).toHaveAttribute(
      "src",
      "blob:rotated",
    );
    adjustAxis("Straighten", "PageUp");
    adjustAxis("Vertical perspective", "End");
    adjustAxis("Horizontal perspective", "PageDown");
    resizeCrop();
    expect(cropImage).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(output, { originalFile: original }),
    );
    expect(cropImage).toHaveBeenCalledOnce();
    const [file, crop, options] = cropImage.mock.calls[0]!;
    expect(file).toBe(original);
    expect(crop.x).toBeCloseTo(DEFAULT_IMAGE_CROP.x + 0.01);
    expect(crop.width).toBeCloseTo(DEFAULT_IMAGE_CROP.width - 0.01);
    expect(crop.y).toBe(DEFAULT_IMAGE_CROP.y);
    expect(crop.height).toBe(DEFAULT_IMAGE_CROP.height);
    expect(options).toEqual({
      quarterTurns: 1,
      tiltDegrees: 1,
      rotationX: 45,
      rotationY: -1,
      fixedFrame: true,
      maxEdge: 4096,
      quality: 0.92,
    });
  });

  it("resets the crop, quarter-turn, all axes, and the selected ruler together", async () => {
    const { onSave } = await renderEditor();
    await quarterTurn();
    loadImage();
    resizeCrop();
    adjustAxis("Straighten", "PageUp");
    adjustAxis("Vertical perspective", "PageUp");
    adjustAxis("Horizontal perspective", "PageDown");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: "Selected photo" }),
      ).toHaveAttribute("src", "blob:original"),
    );
    expect(screen.getByRole("button", { name: "Straighten" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("slider", { name: "Straighten photo" }),
    ).toHaveAttribute("aria-valuenow", "0");
    for (const axis of ["Vertical perspective", "Horizontal perspective"]) {
      fireEvent.click(screen.getByRole("button", { name: axis }));
      expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "0");
    }
    expect(
      document.querySelector('[data-slot="crop-alignment-grid"]'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show entire photo" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(cropImage).toHaveBeenCalledWith(original, DEFAULT_IMAGE_CROP, {
      quarterTurns: 0,
      tiltDegrees: 0,
      rotationX: 0,
      rotationY: 0,
      fixedFrame: true,
      maxEdge: undefined,
      quality: undefined,
    });
  });

  it.each(["button", "Escape"])(
    "cancels through %s without exporting or saving edits",
    async (method) => {
      const { onCancel, onSave } = await renderEditor();
      adjustAxis("Vertical perspective", "End");
      resizeCrop();
      if (method === "button")
        fireEvent.click(screen.getByRole("button", { name: "Cancel editing" }));
      else await userEvent.keyboard("{Escape}");
      expect(onCancel).toHaveBeenCalledOnce();
      expect(onSave).not.toHaveBeenCalled();
      expect(cropImage).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
    },
  );

  it("blocks cancellation and duplicate saves until the async save settles, then allows retry", async () => {
    const pending = deferred<void>();
    const onSave = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(undefined);
    const { onCancel } = await renderEditor({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-busy", "true");
    for (const name of [
      "Cancel editing",
      "Reset",
      "Rotate photo 90°",
      "Straighten",
      "Vertical perspective",
      "Horizontal perspective",
      "Saving…",
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(screen.getByRole("slider")).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
    expect(cropImage).toHaveBeenCalledOnce();
    await act(async () => {
      pending.reject(new Error("Upload unavailable"));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Upload unavailable",
    );
    expect(dialog).toHaveAttribute("aria-busy", "false");
    expect(
      screen.getByRole("button", { name: "Cancel editing" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the editor open when image processing fails before save", async () => {
    cropImage.mockRejectedValueOnce(new Error("Could not decode the image"));
    const { onCancel, onSave } = await renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not decode the image",
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "false");
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("keeps buttons opaque, the ruler transparent, and exposed corners in the editor theme", async () => {
    await renderEditor();
    loadImage();
    adjustAxis("Vertical perspective", "PageUp");
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("bg-background", "text-foreground");
    expect(dialog.querySelector("header")).not.toHaveClass("bg-background");
    expect(dialog.querySelector("footer")).not.toHaveClass("bg-background");
    expect(screen.getByRole("slider")).not.toHaveClass("bg-background");
    for (const name of [
      "Cancel editing",
      "Rotate photo 90°",
      "Straighten",
      "Vertical perspective",
      "Horizontal perspective",
    ]) {
      expect(screen.getByRole("button", { name })).toHaveClass("bg-background");
    }
    expect(
      document.querySelector('[data-slot="receipt-crop-frame"]'),
    ).toHaveClass("bg-background");
    expect(dialog.querySelector(".bg-mist-0")).not.toBeInTheDocument();
    const mask = document.querySelector('[data-slot="crop-outside-mask"]')!;
    for (const region of mask.children)
      expect(region).toHaveClass("bg-background/60");
  });
});

async function renderEditor(overrides: Partial<ImageEditorProps> = {}) {
  const onCancel = overrides.onCancel ?? vi.fn();
  const onSave = overrides.onSave ?? vi.fn();
  function Harness() {
    const [open, setOpen] = useState(true);
    return open ? (
      <ImageEditor
        file={original}
        {...overrides}
        onCancel={() => {
          onCancel();
          setOpen(false);
        }}
        onSave={onSave}
      />
    ) : null;
  }
  render(<Harness />);
  await screen.findByRole("img", { name: "Selected photo" });
  return { onCancel, onSave };
}

function loadImage() {
  const image = screen.getByRole<HTMLImageElement>("img", {
    name: "Selected photo",
  });
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: 1200 },
    naturalHeight: { configurable: true, value: 800 },
  });
  fireEvent.load(image);
  return image;
}

function adjustAxis(axis: string, key: string) {
  fireEvent.click(screen.getByRole("button", { name: axis }));
  fireEvent.keyDown(screen.getByRole("slider"), { key });
}

function resizeCrop() {
  const corner = screen.getByRole("button", {
    name: "Resize north-west corner",
  });
  fireEvent.keyDown(corner, { key: "ArrowRight" });
  fireEvent.keyUp(corner, { key: "ArrowRight" });
}

async function quarterTurn() {
  fireEvent.click(screen.getByRole("button", { name: "Rotate photo 90°" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Rotate photo 90°" }),
    ).toBeEnabled(),
  );
  // The rotated object URL is committed after the rotation promise completes.
  await waitFor(() =>
    expect(screen.getByRole("img", { name: "Selected photo" })).toHaveAttribute(
      "src",
      "blob:rotated",
    ),
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
