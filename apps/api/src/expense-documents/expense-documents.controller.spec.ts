import type { Response } from "express";
import { PassThrough, Readable } from "node:stream";

import { ExpenseDocumentsController } from "./expense-documents.controller";
import type { ExpenseDocumentsService } from "./expense-documents.service";

describe("ExpenseDocumentsController content", () => {
  it("forces private PDFs to download with sniffing and script execution disabled", async () => {
    const documents = {
      getContent: jest.fn().mockResolvedValue({
        body: Readable.from([Buffer.from("%PDF-test")]),
        contentType: "application/pdf",
        contentLength: 9,
      }),
    } as unknown as ExpenseDocumentsService;
    const controller = new ExpenseDocumentsController(documents);
    const stream = new PassThrough();
    const setHeader = jest.fn();
    const response = Object.assign(stream, {
      setHeader,
    }) as unknown as Response;

    await controller.content("expense-1", "document-1", "ORIGINAL", response);

    expect(setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store",
    );
    expect(setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
    expect(setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="expense-document.pdf"',
    );
    expect(setHeader).toHaveBeenCalledWith(
      "Content-Security-Policy",
      "sandbox",
    );
    expect(setHeader).toHaveBeenCalledWith("Content-Length", "9");
  });
});
