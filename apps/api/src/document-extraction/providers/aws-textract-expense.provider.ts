import {
  AnalyzeExpenseCommand,
  TextractClient,
  type AnalyzeExpenseCommandOutput,
  type ExpenseDetection,
  type ExpenseDocument,
  type ExpenseField,
  type Geometry,
} from "@aws-sdk/client-textract";

import { TEXTRACT_SYNC_MAX_BYTES } from "../document-extraction.constants";
import { DocumentExtractionError } from "../document-extraction.errors";
import type {
  AnalyzeExpenseInput,
  DocumentExtractionProvider,
  ExpenseAnalysisDocument,
  ExpenseAnalysisField,
  ExpenseAnalysisResult,
  ExtractionBoundingBox,
  ExtractionDetection,
} from "../document-extraction.types";

export interface TextractExpenseClient {
  send(command: AnalyzeExpenseCommand): Promise<AnalyzeExpenseCommandOutput>;
}

export class AwsTextractExpenseProvider implements DocumentExtractionProvider {
  readonly name = "aws-textract";

  constructor(private readonly client: TextractExpenseClient) {}

  static create(region: string): AwsTextractExpenseProvider {
    return new AwsTextractExpenseProvider(new TextractClient({ region }));
  }

  async analyzeExpense(
    input: AnalyzeExpenseInput,
  ): Promise<ExpenseAnalysisResult> {
    if (
      input.source.kind === "bytes" &&
      input.source.bytes.byteLength > TEXTRACT_SYNC_MAX_BYTES
    ) {
      throw new DocumentExtractionError(
        "DOCUMENT_EXTRACTION_TOO_LARGE",
        "The document exceeds the synchronous extraction size limit.",
        false,
      );
    }

    try {
      const response = await this.client.send(
        new AnalyzeExpenseCommand({
          Document:
            input.source.kind === "bytes"
              ? { Bytes: input.source.bytes }
              : {
                  S3Object: {
                    Bucket: input.source.bucket,
                    Name: input.source.key,
                    ...(input.source.version
                      ? { Version: input.source.version }
                      : {}),
                  },
                },
        }),
      );

      return mapResponse(response, this.name);
    } catch (error) {
      if (error instanceof DocumentExtractionError) throw error;
      throw mapTextractError(error);
    }
  }
}

export function mapTextractError(error: unknown): DocumentExtractionError {
  const name = errorName(error);
  const cause = error instanceof Error ? error : undefined;

  switch (name) {
    case "BadDocumentException":
      return extractionError(
        "DOCUMENT_EXTRACTION_BAD_DOCUMENT",
        "Textract could not read the document.",
        false,
        cause,
      );
    case "DocumentTooLargeException":
      return extractionError(
        "DOCUMENT_EXTRACTION_TOO_LARGE",
        "The document exceeds the synchronous extraction size limit.",
        false,
        cause,
      );
    case "UnsupportedDocumentException":
      return extractionError(
        "DOCUMENT_EXTRACTION_UNSUPPORTED_DOCUMENT",
        "Textract does not support this document format.",
        false,
        cause,
      );
    case "AccessDeniedException":
      return extractionError(
        "DOCUMENT_EXTRACTION_ACCESS_DENIED",
        "Textract access is not configured correctly.",
        false,
        cause,
      );
    case "InvalidParameterException":
    case "InvalidS3ObjectException":
      return extractionError(
        "DOCUMENT_EXTRACTION_INVALID_SOURCE",
        "Textract could not access the document source.",
        false,
        cause,
      );
    case "ProvisionedThroughputExceededException":
    case "ThrottlingException":
      return extractionError(
        "DOCUMENT_EXTRACTION_THROTTLED",
        "Textract is temporarily rate limited.",
        true,
        cause,
      );
    case "InternalServerError":
      return extractionError(
        "DOCUMENT_EXTRACTION_UNAVAILABLE",
        "Textract is temporarily unavailable.",
        true,
        cause,
      );
    default:
      return extractionError(
        "DOCUMENT_EXTRACTION_FAILED",
        "Document extraction failed.",
        false,
        cause,
      );
  }
}

function mapResponse(
  response: AnalyzeExpenseCommandOutput,
  provider: string,
): ExpenseAnalysisResult {
  return {
    provider,
    ...(response.$metadata.requestId
      ? { providerRequestId: response.$metadata.requestId }
      : {}),
    ...(response.DocumentMetadata?.Pages !== undefined
      ? { pages: response.DocumentMetadata.Pages }
      : {}),
    documents: (response.ExpenseDocuments ?? []).map(mapDocument),
  };
}

function mapDocument(document: ExpenseDocument): ExpenseAnalysisDocument {
  return {
    ...(document.ExpenseIndex !== undefined
      ? { index: document.ExpenseIndex }
      : {}),
    summaryFields: (document.SummaryFields ?? []).map(mapField),
    lineItemGroups: (document.LineItemGroups ?? []).map((group) => ({
      ...(group.LineItemGroupIndex !== undefined
        ? { index: group.LineItemGroupIndex }
        : {}),
      items: (group.LineItems ?? []).map((item) => ({
        fields: (item.LineItemExpenseFields ?? []).map(mapField),
      })),
    })),
    textLines: (document.Blocks ?? [])
      .filter((block) => block.BlockType === "LINE" && Boolean(block.Text))
      .map((block) => ({
        text: block.Text as string,
        ...(block.Confidence !== undefined
          ? { confidence: block.Confidence }
          : {}),
        ...(block.Page !== undefined ? { pageNumber: block.Page } : {}),
        ...boundingBoxProperty(block.Geometry),
      })),
  };
}

function mapField(field: ExpenseField): ExpenseAnalysisField {
  return {
    ...(field.Type
      ? {
          type: {
            ...(field.Type.Text ? { text: field.Type.Text } : {}),
            ...(field.Type.Confidence !== undefined
              ? { confidence: field.Type.Confidence }
              : {}),
          },
        }
      : {}),
    ...(field.LabelDetection
      ? { label: mapDetection(field.LabelDetection) }
      : {}),
    ...(field.ValueDetection
      ? { value: mapDetection(field.ValueDetection) }
      : {}),
    ...(field.PageNumber !== undefined ? { pageNumber: field.PageNumber } : {}),
    ...(field.Currency
      ? {
          currency: {
            ...(field.Currency.Code ? { code: field.Currency.Code } : {}),
            ...(field.Currency.Confidence !== undefined
              ? { confidence: field.Currency.Confidence }
              : {}),
          },
        }
      : {}),
    groups: (field.GroupProperties ?? []).map((group) => ({
      ...(group.Id ? { id: group.Id } : {}),
      types: group.Types ?? [],
    })),
  };
}

function mapDetection(detection: ExpenseDetection): ExtractionDetection {
  return {
    ...(detection.Text ? { text: detection.Text } : {}),
    ...(detection.Confidence !== undefined
      ? { confidence: detection.Confidence }
      : {}),
    ...boundingBoxProperty(detection.Geometry),
  };
}

function boundingBoxProperty(geometry: Geometry | undefined): {
  boundingBox?: ExtractionBoundingBox;
} {
  const box = geometry?.BoundingBox;
  if (
    box?.Width === undefined ||
    box.Height === undefined ||
    box.Left === undefined ||
    box.Top === undefined
  ) {
    return {};
  }

  return {
    boundingBox: {
      width: box.Width,
      height: box.Height,
      left: box.Left,
      top: box.Top,
    },
  };
}

function errorName(error: unknown): string | undefined {
  if (error instanceof Error) return error.name;
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
  ) {
    return error.name;
  }
  return undefined;
}

function extractionError(
  code: ConstructorParameters<typeof DocumentExtractionError>[0],
  message: string,
  retryable: boolean,
  cause?: Error,
): DocumentExtractionError {
  return new DocumentExtractionError(code, message, retryable, { cause });
}
