import { documentJobFailureDetails } from "./document-job-lifecycle";

describe("document worker failure diagnostics", () => {
  it("reports connection errors inside empty AggregateError messages", () => {
    const refused = Object.assign(new Error("private connection information"), {
      code: "ECONNREFUSED",
    });
    expect(
      documentJobFailureDetails(new AggregateError([refused, refused], "")),
    ).toEqual({
      errorName: "AggregateError",
      errorCodes: ["ECONNREFUSED"],
    });
  });
  it("preserves Prisma and driver codes without query values, credentials or raw metadata", () => {
    const error = Object.assign(
      new Error("postgresql://user:secret@host/db; private VIN"),
      {
        code: "P2010",
        meta: {
          query: "private document",
          driverAdapterError: { cause: { originalCode: "53100" } },
        },
      },
    );
    expect(documentJobFailureDetails(error)).toEqual({
      errorName: "Error",
      errorCodes: ["P2010", "53100"],
    });
    expect(JSON.stringify(documentJobFailureDetails(error))).not.toMatch(
      /secret|private|postgresql/,
    );
  });
  it("handles cyclic causes and unknown thrown values without hiding the original failure", () => {
    const cyclic: { code: string; cause?: unknown } = { code: "ECONNRESET" };
    cyclic.cause = cyclic;
    expect(documentJobFailureDetails(cyclic).errorCodes).toEqual([
      "ECONNRESET",
    ]);
    expect(documentJobFailureDetails(null)).toEqual({
      errorName: "UnknownError",
      errorCodes: [],
    });
  });
});
