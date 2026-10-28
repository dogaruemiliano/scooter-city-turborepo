import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  generateScooterClientCopy,
  overlayCoverRect,
} from "./scooter-client-copy";
const pdf = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("@repo/ui/lib/pdf", () => ({ loadPdf: async () => pdf }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("protected client copies", () => {
  it.each([
    [600, 900],
    [900, 600],
    [300, 300],
  ])("covers %s by %s without distorting the overlay", (width, height) => {
    const rect = overlayCoverRect(width, height, 1536, 1024);
    expect(rect.width / rect.height).toBeCloseTo(1536 / 1024);
    expect(rect.width).toBeGreaterThanOrEqual(width);
    expect(rect.height).toBeGreaterThanOrEqual(height);
    expect(rect.x).toBeCloseTo((width - rect.width) / 2);
    expect(rect.y).toBeCloseTo((height - rect.height) / 2);
  });
  it("protects every PDF page, preserves page sizes, and releases the renderer", async () => {
    const overlayAlphas: number[] = [];
    const drawImage = vi.fn<CanvasRenderingContext2D["drawImage"]>(() => {
      overlayAlphas.push(context.globalAlpha);
    });
    const context = {
      globalAlpha: 1,
      save() {},
      restore() {
        this.globalAlpha = 1;
      },
      drawImage,
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const png = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==",
      ),
      (value) => value.charCodeAt(0),
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(new Blob([png], { type: "image/png" })),
    );
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 1536, height: 1024, close }),
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, blob: async () => new Blob([png]) }),
    );
    const render = vi.fn().mockReturnValue({ promise: Promise.resolve() });
    const destroy = vi.fn();
    pdf.getDocument.mockReturnValue({
      destroy,
      promise: Promise.resolve({
        numPages: 2,
        getPage: async (index: number) => ({
          getViewport: ({ scale }: { scale: number }) => ({
            width: (index === 1 ? 600 : 300) * scale,
            height: (index === 1 ? 300 : 600) * scale,
          }),
          render,
          cleanup: vi.fn(),
        }),
      }),
    });
    const result = await generateScooterClientCopy(
      new File(["source"], "ITP.pdf", { type: "application/pdf" }),
    );
    const output = await PDFDocument.load(await result.arrayBuffer());
    expect(result.name).toBe("ITP-client.pdf");
    expect(output.getPages().map((page) => page.getSize())).toEqual([
      { width: 600, height: 300 },
      { width: 300, height: 600 },
    ]);
    expect(render).toHaveBeenCalledTimes(2);
    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(overlayAlphas).toEqual([0.1, 0.1]);
    expect(context.globalAlpha).toBe(1);
    for (const [, , , width, height] of drawImage.mock.calls)
      expect(width / height).toBeCloseTo(1.5);
    expect(destroy).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
