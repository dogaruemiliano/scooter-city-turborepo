import {
  AnalyzeExpenseCommand,
  type AnalyzeExpenseCommandOutput,
} from "@aws-sdk/client-textract";

import { TEXTRACT_SYNC_MAX_BYTES } from "../document-extraction.constants";
import {
  AwsTextractExpenseProvider,
  mapTextractError,
  type TextractExpenseClient,
} from "./aws-textract-expense.provider";

type SendMock = jest.Mock<
  Promise<AnalyzeExpenseCommandOutput>,
  [AnalyzeExpenseCommand]
>;

function createProvider(response = textractResponse()): {
  provider: AwsTextractExpenseProvider;
  send: SendMock;
} {
  const send: SendMock = jest.fn((command: AnalyzeExpenseCommand) => {
    void command;
    return Promise.resolve(response);
  });
  return {
    provider: new AwsTextractExpenseProvider({
      send,
    } satisfies TextractExpenseClient),
    send,
  };
}

describe("AwsTextractExpenseProvider", () => {
  it("uses AnalyzeExpense and maps fields, line items, and OCR lines", async () => {
    const { provider, send } = createProvider();
    const bytes = new Uint8Array([1, 2, 3]);

    const result = await provider.analyzeExpense({
      source: { kind: "bytes", bytes },
    });

    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(AnalyzeExpenseCommand);
    expect(command?.input.Document).toEqual({ Bytes: bytes });
    expect(result).toEqual({
      provider: "aws-textract",
      providerRequestId: "request-123",
      pages: 1,
      documents: [
        {
          index: 1,
          summaryFields: [
            {
              type: { text: "TOTAL", confidence: 99.9 },
              label: { text: "Total", confidence: 98.1 },
              value: {
                text: "123,45 RON",
                confidence: 97.5,
                boundingBox: {
                  width: 0.2,
                  height: 0.03,
                  left: 0.6,
                  top: 0.8,
                },
              },
              pageNumber: 1,
              currency: { code: "RON", confidence: 91 },
              groups: [{ id: "summary-1", types: ["SUMMARY"] }],
            },
          ],
          lineItemGroups: [
            {
              index: 1,
              items: [
                {
                  fields: [
                    {
                      type: { text: "ITEM", confidence: 96 },
                      value: { text: "Helmet", confidence: 95 },
                      groups: [],
                    },
                  ],
                },
              ],
            },
          ],
          textLines: [
            { text: "TOTAL 123,45 RON", confidence: 96, pageNumber: 1 },
          ],
        },
      ],
    });
  });

  it("uses an S3 source without exposing storage details in output", async () => {
    const { provider, send } = createProvider();

    const result = await provider.analyzeExpense({
      source: {
        kind: "s3",
        bucket: "private-bucket",
        key: "finance/receipt.jpg",
        version: "v1",
      },
    });

    expect(send.mock.calls[0]?.[0].input.Document).toEqual({
      S3Object: {
        Bucket: "private-bucket",
        Name: "finance/receipt.jpg",
        Version: "v1",
      },
    });
    expect(JSON.stringify(result)).not.toContain("private-bucket");
    expect(JSON.stringify(result)).not.toContain("finance/receipt.jpg");
  });

  it("rejects oversized byte input before calling AWS", async () => {
    const { provider, send } = createProvider();

    await expect(
      provider.analyzeExpense({
        source: {
          kind: "bytes",
          bytes: new Uint8Array(TEXTRACT_SYNC_MAX_BYTES + 1),
        },
      }),
    ).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_TOO_LARGE",
      retryable: false,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["BadDocumentException", "DOCUMENT_EXTRACTION_BAD_DOCUMENT", false],
    ["DocumentTooLargeException", "DOCUMENT_EXTRACTION_TOO_LARGE", false],
    [
      "UnsupportedDocumentException",
      "DOCUMENT_EXTRACTION_UNSUPPORTED_DOCUMENT",
      false,
    ],
    ["AccessDeniedException", "DOCUMENT_EXTRACTION_ACCESS_DENIED", false],
    ["InvalidParameterException", "DOCUMENT_EXTRACTION_INVALID_SOURCE", false],
    ["InvalidS3ObjectException", "DOCUMENT_EXTRACTION_INVALID_SOURCE", false],
    [
      "ProvisionedThroughputExceededException",
      "DOCUMENT_EXTRACTION_THROTTLED",
      true,
    ],
    ["ThrottlingException", "DOCUMENT_EXTRACTION_THROTTLED", true],
    ["InternalServerError", "DOCUMENT_EXTRACTION_UNAVAILABLE", true],
    ["CredentialsProviderError", "DOCUMENT_EXTRACTION_FAILED", false],
  ] as const)(
    "maps %s to a stable application error",
    (name, code, retryable) => {
      const providerError = new Error(
        "provider detail that must not be exposed",
      );
      providerError.name = name;
      const mapped = mapTextractError(providerError);

      expect(mapped).toMatchObject({ code, retryable });
      expect(mapped.message).not.toContain("provider detail");
    },
  );
});

function textractResponse(): AnalyzeExpenseCommandOutput {
  return {
    $metadata: { requestId: "request-123" },
    DocumentMetadata: { Pages: 1 },
    ExpenseDocuments: [
      {
        ExpenseIndex: 1,
        SummaryFields: [
          {
            Type: { Text: "TOTAL", Confidence: 99.9 },
            LabelDetection: { Text: "Total", Confidence: 98.1 },
            ValueDetection: {
              Text: "123,45 RON",
              Confidence: 97.5,
              Geometry: {
                BoundingBox: {
                  Width: 0.2,
                  Height: 0.03,
                  Left: 0.6,
                  Top: 0.8,
                },
              },
            },
            PageNumber: 1,
            Currency: { Code: "RON", Confidence: 91 },
            GroupProperties: [{ Id: "summary-1", Types: ["SUMMARY"] }],
          },
        ],
        LineItemGroups: [
          {
            LineItemGroupIndex: 1,
            LineItems: [
              {
                LineItemExpenseFields: [
                  {
                    Type: { Text: "ITEM", Confidence: 96 },
                    ValueDetection: { Text: "Helmet", Confidence: 95 },
                  },
                ],
              },
            ],
          },
        ],
        Blocks: [
          {
            BlockType: "LINE",
            Text: "TOTAL 123,45 RON",
            Confidence: 96,
            Page: 1,
          },
          { BlockType: "WORD", Text: "TOTAL", Confidence: 99, Page: 1 },
        ],
      },
    ],
  };
}
