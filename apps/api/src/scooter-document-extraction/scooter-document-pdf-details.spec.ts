import { createCanvas, loadImage } from "@napi-rs/canvas";
import { degrees, PDFDocument, rgb } from "pdf-lib";
import {
  detailRegions,
  renderScooterPdfDetails,
} from "./scooter-document-pdf-details";

async function pixel(bytes: Uint8Array): Promise<number[]> {
  const image = await loadImage(Buffer.from(bytes));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return Array.from(
    context.getImageData(image.width / 4, image.height / 4, 1, 1).data,
  );
}

describe("scooter PDF magnified views", () => {
  it("renders all pages with their rotation, original pixels and overlapping coverage", async () => {
    const pdf = await PDFDocument.create();
    for (const rotation of [0, 90]) {
      const page = pdf.addPage([300, 200]);
      page.setRotation(degrees(rotation));
      page.drawRectangle({
        x: 0,
        y: 100,
        width: 150,
        height: 100,
        color: rgb(0, 1, 0),
      });
      page.drawRectangle({
        x: 150,
        y: 100,
        width: 150,
        height: 100,
        color: rgb(1, 1, 0),
      });
      page.drawRectangle({
        x: 0,
        y: 0,
        width: 150,
        height: 100,
        color: rgb(1, 0, 0),
      });
      page.drawRectangle({
        x: 150,
        y: 0,
        width: 150,
        height: 100,
        color: rgb(0, 0, 1),
      });
    }
    const bytes = await pdf.save();
    const original = Uint8Array.from(bytes);
    const images = await renderScooterPdfDetails(
      bytes,
      new AbortController().signal,
    );
    expect(bytes).toEqual(original);
    expect(images.map((image) => image.page)).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
    const dimensions = await loadImage(Buffer.from(images[0].bytes));
    expect([dimensions.width, dimensions.height]).toEqual([750, 500]);
    const rotated = await loadImage(Buffer.from(images[4].bytes));
    expect([rotated.width, rotated.height]).toEqual([500, 750]);
    const expected = [
      [0, 255, 0],
      [255, 255, 0],
      [255, 0, 0],
      [0, 0, 255],
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0],
    ];
    for (const [index, image] of images.entries()) {
      const actual = await pixel(image.bytes);
      for (let channel = 0; channel < 3; channel++)
        expect(
          Math.abs(actual[channel] - expected[index][channel]),
        ).toBeLessThan(5);
    }
  });

  it("keeps every edge covered at odd pixel dimensions", () => {
    const regions = detailRegions(1001, 707);
    expect(regions[0]).toMatchObject({ x: 0, y: 0 });
    expect(regions[3].x + regions[3].width).toBe(1001);
    expect(regions[3].y + regions[3].height).toBe(707);
    expect(regions[0].width - regions[1].x).toBeGreaterThanOrEqual(200);
    expect(regions[0].height - regions[2].y).toBeGreaterThanOrEqual(140);
  });

  it("rejects more than ten pages without dropping later pages", async () => {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < 11; i++) pdf.addPage([20, 20]);
    await expect(
      renderScooterPdfDetails(await pdf.save(), new AbortController().signal),
    ).rejects.toMatchObject({ code: "DOCUMENT_EXTRACTION_TOO_MANY_PAGES" });
  });

  it("does not begin rendering an aborted request", async () => {
    await expect(
      renderScooterPdfDetails(new Uint8Array(), AbortSignal.abort()),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
