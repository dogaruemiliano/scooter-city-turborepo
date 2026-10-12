import { degrees, PDFDocument, rgb } from "pdf-lib";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { renderScooterPdfDetails } from "../scooter-document-extraction/scooter-document-pdf-details";
import { normalizeDocumentAnalysisPdf } from "./document-analysis-pdf";

const limit = 15 * 1024 * 1024;
const signal = () => new AbortController().signal;

it("preserves every corner and cropped page across all scanner rotations without rasterizing", async () => {
  const pdf = await PDFDocument.create();
  for (const rotation of [0, 90, 180, 270]) {
    const page = pdf.addPage([240, 340]);
    page.setCropBox(20, 20, 200, 300);
    page.setRotation(degrees(rotation));
    for (const [index, color] of [
      rgb(1, 0, 0),
      rgb(0, 1, 0),
      rgb(0, 0, 1),
      rgb(1, 1, 0),
    ].entries())
      page.drawRectangle({
        x: 20 + (index % 2) * 100,
        y: 20 + Math.floor(index / 2) * 150,
        width: 100,
        height: 150,
        color,
      });
  }
  const original = Buffer.from(await pdf.save());
  const copy = Buffer.from(original);
  const prepared = await normalizeDocumentAnalysisPdf(
    original,
    limit,
    signal(),
  );
  expect(original).toEqual(copy);
  const result = await PDFDocument.load(prepared);
  expect(result.getPageCount()).toBe(4);
  expect(result.getPages().map((page) => page.getRotation().angle)).toEqual([
    0, 0, 0, 0,
  ]);
  expect(result.getPages().map((page) => page.getSize())).toEqual([
    { width: 200, height: 300 },
    { width: 300, height: 200 },
    { width: 200, height: 300 },
    { width: 300, height: 200 },
  ]);
  const before = await renderScooterPdfDetails(original, signal());
  const after = await renderScooterPdfDetails(prepared, signal());
  expect(after).toHaveLength(before.length);
  const samples = async (bytes: Uint8Array) => {
    const image = await loadImage(Buffer.from(bytes));
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const values = [image.width, image.height];
    for (const x of [0.25, 0.75])
      for (const y of [0.25, 0.75])
        values.push(
          ...context.getImageData(image.width * x, image.height * y, 1, 1).data,
        );
    return values;
  };
  for (let i = 0; i < before.length; i++)
    expect(await samples(after[i].bytes)).toEqual(
      await samples(before[i].bytes),
    );
});

it("preserves unrotated PDFs and annotation appearances unchanged", async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  let bytes = Buffer.from(await pdf.save());
  expect(await normalizeDocumentAnalysisPdf(bytes, limit, signal())).toBe(
    bytes,
  );
  page.setRotation(degrees(90));
  const field = pdf.getForm().createTextField("synthetic");
  field.setText("Visible annotation");
  field.addToPage(page);
  bytes = Buffer.from(await pdf.save());
  expect(await normalizeDocumentAnalysisPdf(bytes, limit, signal())).toBe(
    bytes,
  );
});

it("honors cancellation and checks the prepared file size", async () => {
  await expect(
    normalizeDocumentAnalysisPdf(Buffer.alloc(0), limit, AbortSignal.abort()),
  ).rejects.toMatchObject({ name: "AbortError" });
  const pdf = await PDFDocument.create();
  pdf.addPage().setRotation(degrees(90));
  await expect(
    normalizeDocumentAnalysisPdf(Buffer.from(await pdf.save()), 1, signal()),
  ).rejects.toMatchObject({ code: "DOCUMENT_EXTRACTION_TOO_LARGE" });
});
