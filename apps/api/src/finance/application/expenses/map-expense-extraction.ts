import { v1 } from "@repo/api-shared";

import type {
  ExpenseAnalysisField,
  ExpenseAnalysisResult,
} from "../../../document-extraction/document-extraction.types";

export const EXPENSE_EXTRACTION_PARSER_VERSION = "expense-v11";

export interface LegalIdentityForMatching {
  legalName: string;
  taxIdentifier: string;
  nameAliases: readonly string[];
}

type Evidence = v1.finance.ExtractionEvidence;
type StringCandidate = v1.finance.NormalizedExpenseExtraction["supplierName"];
type TextLine = ExpenseAnalysisResult["documents"][number]["textLines"][number];

const FIELD_TYPES = {
  amount: ["TOTAL", "AMOUNT_DUE"],
  date: ["INVOICE_RECEIPT_DATE"],
  currency: ["CURRENCY"],
  supplierName: ["VENDOR_NAME"],
  supplierTax: ["VENDOR_VAT_NUMBER", "VENDOR_TAX_ID"],
  invoiceTaxPayer: ["TAX_PAYER_ID"],
  customerName: ["RECEIVER_NAME", "CUSTOMER_NAME"],
  customerTax: ["RECEIVER_VAT_NUMBER", "CUSTOMER_TAX_ID"],
  documentNumber: ["INVOICE_RECEIPT_ID"],
} as const;

export function mapExpenseAnalysis(
  analysis: ExpenseAnalysisResult,
  company: LegalIdentityForMatching | null,
): v1.finance.NormalizedExpenseExtraction {
  const fields = analysis.documents.flatMap((document) =>
    document.summaryFields.map((field) => ({ field, page: field.pageNumber })),
  );
  const lines = analysis.documents.flatMap((document) => document.textLines);

  // TOTAL is the value of the expense. AMOUNT_DUE is only a fallback for
  // documents where Textract did not find a total; tendered cash, change, and
  // AMOUNT_PAID must never replace it.
  const amountText = selectFieldByTypePriority(fields, FIELD_TYPES.amount);
  const extractedDate = selectField(fields, FIELD_TYPES.date);
  const date = candidate(
    extractedDate.value ? normalizeReceiptDate(extractedDate.value) : null,
    extractedDate.confidence,
    extractedDate.evidence,
  );
  const explicitCurrency = selectField(fields, FIELD_TYPES.currency);
  const supplierName = selectField(fields, FIELD_TYPES.supplierName);
  const extractedCustomerName = selectField(fields, FIELD_TYPES.customerName);
  const customerTaxField = selectField(fields, FIELD_TYPES.customerTax);
  const customerTax = customerTaxField.value
    ? customerTaxField
    : extractRomanianBuyerTaxIdentifier(lines);
  const supplierTaxField = correctSupplierTaxCandidate(
    selectField(fields, FIELD_TYPES.supplierTax),
  );
  const invoiceTaxPayerField = correctSupplierTaxCandidate(
    selectField(
      fields.filter(({ field }) => !belongsToReceiver(field)),
      FIELD_TYPES.invoiceTaxPayer,
    ),
  );
  const supplierTax = supplierTaxField.value
    ? supplierTaxField
    : invoiceTaxPayerField.value &&
        (!customerTax.value ||
          normalizeTaxIdentifier(invoiceTaxPayerField.value) !==
            normalizeTaxIdentifier(customerTax.value))
      ? invoiceTaxPayerField
      : firstCandidate(
          analysis.documents.map((document) =>
            extractRomanianSupplierTaxIdentifier(
              document.textLines,
              customerTax.value,
            ),
          ),
        );
  const documentType = detectDocumentType(lines);
  const documentIdentifier = extractDocumentIdentifier(
    fields,
    lines,
    documentType.type,
  );
  const amountMinor = amountText.value
    ? parseReceiptAmountMinor(amountText.value)
    : null;
  const amountField = findField(fields, FIELD_TYPES.amount);
  const currencyFromAmount = amountField?.field.currency?.code ?? null;
  const currency = explicitCurrency.value
    ? explicitCurrency
    : candidate(
        currencyFromAmount,
        amountField?.field.currency?.confidence ?? null,
        currencyFromAmount && amountField
          ? [fieldEvidence(amountField.field, amountField.page)]
          : [],
      );
  const companyMatch = matchCompany(
    company,
    customerTax,
    extractedCustomerName,
  );
  const customerName = resolveCustomerName(
    extractedCustomerName,
    company,
    companyMatch,
  );
  const payment = detectPaymentMethod(lines);
  const category = detectCategory(analysis);
  const suggestedBookType = suggestBookType(company, companyMatch);
  const suggestedCategoryCode = suggestCategoryCode(
    category.code,
    suggestedBookType,
  );
  const suggestedAllocationType =
    suggestedBookType === "ASSOCIATE_POOL" || payment.method === "CARD"
      ? "COMMON"
      : null;
  const explanations: string[] = [];

  if (companyMatch.status === "MATCHED") {
    explanations.push(`COMPANY_MATCH:${companyMatch.matchedBy}`);
  } else if (companyMatch.status === "MISMATCHED") {
    explanations.push("COMPANY_MISMATCH");
  } else {
    explanations.push("COMPANY_UNKNOWN");
  }
  if (payment.method) explanations.push(`PAYMENT_METHOD:${payment.method}`);
  explanations.push(
    `DOCUMENT_TYPE:${documentType.type}:${documentType.evidence.length > 0 ? "OCR_TEXT" : "FALLBACK"}`,
  );
  if (suggestedAllocationType) {
    explanations.push(
      suggestedBookType === "ASSOCIATE_POOL"
        ? `ALLOCATION:${suggestedAllocationType}:ASSOCIATE_POOL_RULE`
        : `ALLOCATION:${suggestedAllocationType}:CARD_RULE`,
    );
  }
  if (suggestedCategoryCode) {
    explanations.push(
      suggestedCategoryCode === "OTHER" ||
        suggestedCategoryCode === "POOL_OTHER"
        ? `CATEGORY:${suggestedCategoryCode}:FALLBACK`
        : `CATEGORY:${suggestedCategoryCode}:LINE_ITEM_RULE`,
    );
  }

  return {
    amountMinor: candidate(
      amountMinor,
      amountText.confidence,
      amountText.evidence,
    ),
    occurredAt: date,
    currency,
    supplierName,
    supplierTaxIdentifier: supplierTax,
    customerName,
    customerTaxIdentifier: customerTax,
    documentSeries: documentIdentifier.series,
    documentNumber: documentIdentifier.number,
    companyMatch,
    suggestedBookType,
    suggestedDocumentType: documentType.type,
    suggestedPaymentMethod: payment.method,
    suggestedAllocationType,
    suggestedCategoryCode,
    suggestionEvidence: {
      bookType: companyMatch.evidence,
      documentType: documentType.evidence,
      paymentMethod: payment.evidence,
      allocationType:
        suggestedBookType === "ASSOCIATE_POOL"
          ? companyMatch.evidence
          : suggestedAllocationType === "COMMON"
            ? payment.evidence
            : [],
      categoryCode: category.evidence,
    },
    explanations,
  };
}

type DocumentIdentifier = {
  series: StringCandidate;
  number: StringCandidate;
};

/**
 * Textract exposes a single standardized invoice/receipt ID, even when an
 * invoice prints its series separately. Romanian invoices commonly expose a
 * key/value pair such as `Seria VL nr.` -> `639013079`, so prefer that
 * invoice-specific identity and fall back to the equivalent OCR header line.
 *
 * Both patterns are anchored at the start of the label/line. That guard is
 * important because invoices can also contain unrelated values such as
 * `CI seria VX nr. 854291` for a delegate's identity card.
 */
function extractDocumentIdentifier(
  fields: Array<{ field: ExpenseAnalysisField; page?: number }>,
  lines: TextLine[],
  documentType: v1.finance.FinancialDocumentType,
): DocumentIdentifier {
  const standardizedNumber = selectField(fields, FIELD_TYPES.documentNumber);
  if (documentType !== "INVOICE") {
    return {
      series: candidate(null, null, []),
      number: standardizedNumber,
    };
  }

  const summaryIdentifier = extractInvoiceIdentifierFromSummary(fields);
  if (summaryIdentifier) return summaryIdentifier;

  const ocrIdentifier = extractInvoiceIdentifierFromLines(lines);
  if (ocrIdentifier) return ocrIdentifier;

  return {
    series: candidate(null, null, []),
    number: standardizedNumber,
  };
}

function extractInvoiceIdentifierFromSummary(
  fields: Array<{ field: ExpenseAnalysisField; page?: number }>,
): DocumentIdentifier | null {
  for (const { field, page } of fields) {
    const label = field.label;
    const valueText = field.value?.text?.trim();
    if (!label?.text || !valueText) continue;
    const labelText = label.text.trim();

    const labelMatch = INVOICE_SERIES_LABEL_PATTERN.exec(
      normalizeFiscalText(labelText).trim(),
    );
    const numberMatch = DOCUMENT_NUMBER_VALUE_PATTERN.exec(valueText);
    if (!labelMatch?.groups?.series || !numberMatch?.groups?.number) continue;

    const series = cleanDocumentIdentifierToken(labelMatch.groups.series);
    const number = cleanDocumentIdentifierToken(numberMatch.groups.number);
    if (!series || !number) continue;

    return {
      series: candidate(series, label.confidence ?? null, [
        detectionEvidence(label, page),
      ]),
      number: candidate(number, field.value?.confidence ?? null, [
        fieldEvidence(field, page),
      ]),
    };
  }

  return null;
}

function extractInvoiceIdentifierFromLines(
  lines: TextLine[],
): DocumentIdentifier | null {
  for (const line of lines) {
    const match = INVOICE_SERIES_NUMBER_PATTERN.exec(
      normalizeFiscalText(line.text).trim(),
    );
    const series = match?.groups?.series
      ? cleanDocumentIdentifierToken(match.groups.series)
      : null;
    const number = match?.groups?.number
      ? cleanDocumentIdentifierToken(match.groups.number)
      : null;
    if (!series || !number) continue;

    const evidence = [lineEvidence(line)];
    return {
      series: candidate(series, line.confidence ?? null, evidence),
      number: candidate(number, line.confidence ?? null, evidence),
    };
  }

  return null;
}

const INVOICE_SERIES_LABEL_PATTERN =
  /^(?:(?:FACTURA|INVOICE|BILL)\s*[:.#-]?\s*)?(?:SERIA|SERIE|SERIES)\s*[:.-]?\s*(?<series>[A-Z0-9][A-Z0-9./-]{0,31})\s+(?:NR|NUMAR(?:UL)?|NO|NUMBER)\s*[.\-:#]?\s*$/;
const INVOICE_SERIES_NUMBER_PATTERN =
  /^(?:(?:FACTURA|INVOICE|BILL)\s*[:.#-]?\s*)?(?:SERIA|SERIE|SERIES)\s*[:.-]?\s*(?<series>[A-Z0-9][A-Z0-9./-]{0,31})\s+(?:NR|NUMAR(?:UL)?|NO|NUMBER)\s*[.\-:#]?\s*(?<number>[A-Z0-9][A-Z0-9./-]{0,63})(?:\s+(?:DIN|DATA)\b.*)?$/;
const DOCUMENT_NUMBER_VALUE_PATTERN =
  /^\s*(?<number>[A-Za-z0-9][A-Za-z0-9./-]{0,63})\s*$/;

function cleanDocumentIdentifierToken(value: string): string {
  return value.trim().replace(/^[.\-:/#]+|[.\-:/#]+$/g, "");
}

function detectDocumentType(lines: TextLine[]): {
  type: v1.finance.FinancialDocumentType;
  evidence: Evidence[];
} {
  const invoiceLines = lines.filter((line) =>
    /\b(?:FACTURA|INVOICE|BILL)\b/.test(normalizeFiscalText(line.text)),
  );
  if (invoiceLines.length > 0) {
    return { type: "INVOICE", evidence: invoiceLines.map(lineEvidence) };
  }

  const receiptLines = lines.filter((line) =>
    /\b(?:BON(?:UL)?\s+FISCAL|RECEIPT|CHITANTA)\b/.test(
      normalizeFiscalText(line.text),
    ),
  );
  return { type: "RECEIPT", evidence: receiptLines.map(lineEvidence) };
}

function suggestBookType(
  company: LegalIdentityForMatching | null,
  companyMatch: v1.finance.NormalizedExpenseExtraction["companyMatch"],
): v1.finance.FinanceBookType | null {
  if (!company) return null;
  return companyMatch.status === "MATCHED" ? "COMPANY" : "ASSOCIATE_POOL";
}

function suggestCategoryCode(
  detectedCode: string | null,
  bookType: v1.finance.FinanceBookType | null,
): string | null {
  if (bookType !== "ASSOCIATE_POOL") return detectedCode;
  return detectedCode === "OTHER" || detectedCode === null
    ? "POOL_OTHER"
    : "POOL_SHARED_COST";
}

export function normalizeTaxIdentifier(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^(CODFISCAL|CUI|CIF|VAT|CF)/, "")
    .replace(/^RO(?=\d)/, "")
    .replace(/[^A-Z0-9]/g, "");
}

function correctSupplierTaxCandidate(value: StringCandidate): StringCandidate {
  if (!value.value) return value;
  return {
    ...value,
    value: correctSupplierTaxIdentifierOcrPrefix(value.value),
  };
}

function correctSupplierTaxIdentifierOcrPrefix(value: string): string {
  return value.replace(/^(\s*)R0(?=[\s.:-]*\d)/i, "$1RO");
}

export function normalizeLegalName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function parseReceiptAmountMinor(value: string): number | null {
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(/^-/, "");
  if (!cleaned) return null;
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  const decimalIndex = Math.max(comma, dot);
  const decimalDigits =
    decimalIndex >= 0 ? cleaned.length - decimalIndex - 1 : 0;
  const normalized =
    decimalIndex >= 0 && decimalDigits > 0 && decimalDigits <= 2
      ? `${cleaned.slice(0, decimalIndex).replace(/[^\d]/g, "")}.${cleaned
          .slice(decimalIndex + 1)
          .replace(/[^\d]/g, "")}`
      : cleaned.replace(/[^\d]/g, "");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export function normalizeReceiptDate(value: string): string | null {
  const trimmed = value.trim();
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(trimmed);
  if (iso) return validDateOnly(iso[1], iso[2], iso[3]);
  const european = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(trimmed);
  if (european) return validDateOnly(european[3], european[2], european[1]);
  return null;
}

/**
 * Romanian fiscal receipts commonly print the buyer only as an OCR line such
 * as `INFO.CLIENT: C.I.F. 54842598`. AnalyzeExpense does not consistently map
 * that text to CUSTOMER_TAX_ID, so use this narrow fallback after standardized
 * fields have been checked. Requiring both the CLIENT marker and a fiscal-ID
 * label prevents the seller's standalone `C.F. RO ...` line from being used.
 */
export function extractRomanianBuyerTaxIdentifier(
  lines: ExpenseAnalysisResult["documents"][number]["textLines"],
): StringCandidate {
  const spatialCandidate =
    extractSpatialRomanianTaxIdentifiers(lines).BUYER ?? null;
  if (spatialCandidate?.value) return spatialCandidate;

  for (const [index, line] of lines.entries()) {
    const nextLine = lines[index + 1];
    const attempts = [
      { text: line.text, evidenceLines: [line] },
      ...(nextLine &&
      sameOcrPage(line, nextLine) &&
      ROMANIAN_CLIENT_MARKER_PATTERN.test(line.text)
        ? [
            {
              text: `${line.text} ${nextLine.text}`,
              evidenceLines: [line, nextLine],
            },
          ]
        : []),
    ];

    for (const attempt of attempts) {
      const match = ROMANIAN_BUYER_TAX_PATTERN.exec(attempt.text);
      const digits = match?.groups?.digits?.replace(/\D/g, "") ?? "";
      if (digits.length < 6 || digits.length > 10) continue;

      const prefix = match?.groups?.prefix ? "RO" : "";
      const confidences = attempt.evidenceLines.flatMap((evidenceLine) =>
        evidenceLine.confidence === undefined ? [] : [evidenceLine.confidence],
      );
      return candidate(
        `${prefix}${digits}`,
        confidences.length > 0 ? Math.min(...confidences) : null,
        attempt.evidenceLines.map(lineEvidence),
      );
    }
  }

  return candidate(null, null, []);
}

/**
 * AnalyzeExpense sometimes leaves Romanian seller fiscal identifiers only in
 * OCR lines, even though the value is clearly printed as `C.F.`, `CIF`, or
 * `CUI`. Keep track of seller and buyer sections so a customer's identifier is
 * never reused as the supplier's, and only accept explicitly labelled values.
 */
export function extractRomanianSupplierTaxIdentifier(
  lines: ExpenseAnalysisResult["documents"][number]["textLines"],
  buyerTaxIdentifier: string | null = null,
): StringCandidate {
  const spatialCandidate =
    extractSpatialRomanianTaxIdentifiers(lines).SUPPLIER ?? null;
  if (
    spatialCandidate?.value &&
    (!buyerTaxIdentifier ||
      normalizeTaxIdentifier(spatialCandidate.value) !==
        normalizeTaxIdentifier(buyerTaxIdentifier))
  ) {
    return spatialCandidate;
  }

  let activeRole: FiscalPartyRole | null = null;
  let supplierCandidate: StringCandidate | null = null;
  let unscopedHeaderCandidate: StringCandidate | null = null;

  for (const [index, line] of lines.entries()) {
    const roleText = normalizeFiscalContext(line.text);
    const hasSupplierMarker = ROMANIAN_SUPPLIER_MARKER_PATTERN.test(roleText);
    const hasBuyerMarker = ROMANIAN_BUYER_MARKER_PATTERN.test(roleText);

    if (hasSupplierMarker !== hasBuyerMarker) {
      activeRole = hasSupplierMarker ? "SUPPLIER" : "BUYER";
    }

    if (!ROMANIAN_FISCAL_LABEL_PATTERN.test(normalizeFiscalText(line.text))) {
      continue;
    }

    const nextLine = lines[index + 1];
    const attempts = [
      { text: line.text, evidenceLines: [line] },
      ...(nextLine && sameOcrPage(line, nextLine)
        ? [
            {
              text: `${line.text} ${nextLine.text}`,
              evidenceLines: [line, nextLine],
            },
          ]
        : []),
    ];

    for (const attempt of attempts) {
      const extracted = taxIdentifierCandidate(
        attempt.text,
        attempt.evidenceLines,
      );
      if (!extracted?.value) continue;
      if (
        buyerTaxIdentifier &&
        normalizeTaxIdentifier(extracted.value) ===
          normalizeTaxIdentifier(buyerTaxIdentifier)
      ) {
        continue;
      }
      if (activeRole === "BUYER") continue;

      if (activeRole === "SUPPLIER") {
        supplierCandidate ??= extracted;
      } else {
        unscopedHeaderCandidate ??= extracted;
      }
      break;
    }
  }

  return (
    supplierCandidate ?? unscopedHeaderCandidate ?? candidate(null, null, [])
  );
}

const ROMANIAN_BUYER_TAX_PATTERN =
  /\b(?:INFO[\s.:-]*)?CLIENT\b[\s.:-]*(?:C[\s.]*[I1][\s.]*F|C[\s.]*U[\s.]*I|CIF|CUI|COD(?:UL)?[\s.]*FISCAL|VAT)[\s.:-]*(?<prefix>RO[\s.:-]*)?(?<digits>\d[\d\s.-]{4,14}\d)\b/i;
const ROMANIAN_CLIENT_MARKER_PATTERN = /\b(?:INFO[\s.:-]*)?CLIENT\b/i;
const ROMANIAN_FISCAL_LABEL_PATTERN =
  /\b(?:C[\s.]*F|C[\s.]*[I1][\s.]*F|C[\s.]*U[\s.]*[I1]|COD(?:UL)?[\s.]+FISCAL|COD(?:UL)?[\s.]+UNIC[\s.]+DE[\s.]+INREGISTRARE|VAT[\s.]+(?:ID|NO|NUMBER))\b/i;
const ROMANIAN_TAX_IDENTIFIER_PATTERN =
  /\b(?:C[\s.]*F|C[\s.]*[I1][\s.]*F|C[\s.]*U[\s.]*[I1]|COD(?:UL)?[\s.]+FISCAL|COD(?:UL)?[\s.]+UNIC[\s.]+DE[\s.]+INREGISTRARE|VAT[\s.]+(?:ID|NO|NUMBER))[\s.:-]*(?<prefix>R[O0][\s.:-]*)?(?<digits>\d(?:[\s.-]*\d){5,9})(?![\s.-]*\d)/i;
const ROMANIAN_BUYER_MARKER_PATTERN =
  /\b(?:INFO\s+)?(?:CLIENT|CUMPARATOR|ACHIZITOR|BENEFICIAR|BUYER|CUSTOMER|RECEIVER)\b/;
const ROMANIAN_SUPPLIER_MARKER_PATTERN =
  /\b(?:FURNIZOR|EMITENT|VANZATOR|PRESTATOR|SUPPLIER|SELLER|VENDOR)\b/;

type FiscalPartyRole = "SUPPLIER" | "BUYER";

type PositionedTextLine = TextLine & {
  boundingBox: NonNullable<TextLine["boundingBox"]>;
};

type SpatialFiscalCandidate = {
  line: PositionedTextLine;
  role: FiscalPartyRole;
};

const MAX_FISCAL_ROW_DISTANCE = 0.02;
const MAX_FISCAL_VALUE_HORIZONTAL_GAP = 0.25;
const FISCAL_ROLE_PRECEDING_TOLERANCE = 0.01;

/**
 * AnalyzeExpense LINE blocks follow visual reading order, which interleaves
 * the supplier and customer columns of Romanian invoices. Pair fiscal labels
 * and values on the same visual row, then use the nearest column heading to
 * determine ownership. Sequential parsing remains the fallback when Textract
 * omits geometry.
 */
function extractSpatialRomanianTaxIdentifiers(
  lines: TextLine[],
): Partial<Record<FiscalPartyRole, StringCandidate>> {
  const positionedLines = lines.filter(hasBoundingBox);
  const roleMarkers = positionedLines.flatMap((line) => {
    const role = fiscalPartyRole(line.text);
    return role ? [{ line, role }] : [];
  });
  const candidates: Partial<Record<FiscalPartyRole, StringCandidate>> = {};

  for (const labelLine of positionedLines) {
    if (
      !ROMANIAN_FISCAL_LABEL_PATTERN.test(normalizeFiscalText(labelLine.text))
    ) {
      continue;
    }

    const role =
      fiscalPartyRole(labelLine.text) ??
      nearestSpatialFiscalRole(labelLine, roleMarkers);
    if (!role || candidates[role]?.value) continue;

    const extracted = spatialTaxIdentifierCandidate(labelLine, positionedLines);
    if (extracted?.value) candidates[role] = extracted;
  }

  return candidates;
}

function spatialTaxIdentifierCandidate(
  labelLine: PositionedTextLine,
  lines: PositionedTextLine[],
): StringCandidate | null {
  const inline = taxIdentifierCandidate(labelLine.text, [labelLine]);
  if (inline?.value) return inline;

  const labelBox = labelLine.boundingBox;
  const labelRight = labelBox.left + labelBox.width;
  const labelCenterY = labelBox.top + labelBox.height / 2;

  return (
    lines
      .filter((line) => line !== labelLine && sameOcrPage(labelLine, line))
      .map((line) => {
        const box = line.boundingBox;
        const horizontalGap = box.left - labelRight;
        const rowDistance = Math.abs(box.top + box.height / 2 - labelCenterY);
        const extracted = taxIdentifierCandidate(
          `${labelLine.text} ${line.text}`,
          [labelLine, line],
        );
        return { extracted, horizontalGap, rowDistance };
      })
      .filter(
        ({ extracted, horizontalGap, rowDistance }) =>
          Boolean(extracted?.value) &&
          horizontalGap >= 0 &&
          horizontalGap <= MAX_FISCAL_VALUE_HORIZONTAL_GAP &&
          rowDistance <= MAX_FISCAL_ROW_DISTANCE,
      )
      .sort(
        (left, right) =>
          left.horizontalGap - right.horizontalGap ||
          left.rowDistance - right.rowDistance,
      )[0]?.extracted ?? null
  );
}

function nearestSpatialFiscalRole(
  labelLine: PositionedTextLine,
  markers: SpatialFiscalCandidate[],
): FiscalPartyRole | null {
  const samePage = markers.filter(({ line }) => sameOcrPage(labelLine, line));
  const preceding = samePage.filter(
    ({ line }) =>
      line.boundingBox.top <=
      labelLine.boundingBox.top + FISCAL_ROLE_PRECEDING_TOLERANCE,
  );
  const eligible = preceding.length > 0 ? preceding : samePage;
  const labelCenterY =
    labelLine.boundingBox.top + labelLine.boundingBox.height / 2;

  return (
    eligible
      .map((marker) => ({
        ...marker,
        distance:
          Math.abs(marker.line.boundingBox.left - labelLine.boundingBox.left) +
          Math.abs(
            marker.line.boundingBox.top +
              marker.line.boundingBox.height / 2 -
              labelCenterY,
          ),
      }))
      .sort((left, right) => left.distance - right.distance)[0]?.role ?? null
  );
}

function fiscalPartyRole(text: string): FiscalPartyRole | null {
  const normalized = normalizeFiscalContext(text);
  const supplier = ROMANIAN_SUPPLIER_MARKER_PATTERN.test(normalized);
  const buyer = ROMANIAN_BUYER_MARKER_PATTERN.test(normalized);
  if (supplier === buyer) return null;
  return supplier ? "SUPPLIER" : "BUYER";
}

function hasBoundingBox(line: TextLine): line is PositionedTextLine {
  return line.boundingBox !== undefined;
}

function taxIdentifierCandidate(
  text: string,
  evidenceLines: TextLine[],
): StringCandidate | null {
  const match = ROMANIAN_TAX_IDENTIFIER_PATTERN.exec(normalizeFiscalText(text));
  const digits = match?.groups?.digits?.replace(/\D/g, "") ?? "";
  if (digits.length < 6 || digits.length > 10) return null;

  const confidences = evidenceLines.flatMap((evidenceLine) =>
    evidenceLine.confidence === undefined ? [] : [evidenceLine.confidence],
  );
  return candidate(
    `${match?.groups?.prefix ? "RO" : ""}${digits}`,
    confidences.length > 0 ? Math.min(...confidences) : null,
    evidenceLines.map(lineEvidence),
  );
}

function firstCandidate(candidates: StringCandidate[]): StringCandidate {
  return (
    candidates.find((candidateValue) => candidateValue.value !== null) ??
    candidate(null, null, [])
  );
}

function belongsToReceiver(field: ExpenseAnalysisField): boolean {
  return field.groups.some((group) =>
    group.types.some((type) => type.toUpperCase().startsWith("RECEIVER_")),
  );
}

function sameOcrPage(left: TextLine, right: TextLine): boolean {
  return left.pageNumber === right.pageNumber;
}

function normalizeFiscalText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function normalizeFiscalContext(value: string): string {
  return normalizeFiscalText(value)
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function validDateOnly(
  yearText: string,
  monthText: string,
  dayText: string,
): string | null {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function selectField(
  fields: Array<{ field: ExpenseAnalysisField; page?: number }>,
  acceptedTypes: readonly string[],
): StringCandidate {
  const selected = findField(fields, acceptedTypes);
  return selected
    ? candidate(
        selected.field.value?.text ?? null,
        selected.field.value?.confidence ?? null,
        [fieldEvidence(selected.field, selected.page)],
      )
    : candidate(null, null, []);
}

function selectFieldByTypePriority(
  fields: Array<{ field: ExpenseAnalysisField; page?: number }>,
  acceptedTypes: readonly string[],
): StringCandidate {
  for (const type of acceptedTypes) {
    const selected = findField(fields, [type]);
    if (selected) {
      return candidate(
        selected.field.value?.text ?? null,
        selected.field.value?.confidence ?? null,
        [fieldEvidence(selected.field, selected.page)],
      );
    }
  }

  return candidate(null, null, []);
}

function findField(
  fields: Array<{ field: ExpenseAnalysisField; page?: number }>,
  acceptedTypes: readonly string[],
) {
  return fields
    .filter(({ field }) =>
      acceptedTypes.includes(field.type?.text?.toUpperCase() ?? ""),
    )
    .sort(
      (a, b) =>
        (b.field.value?.confidence ?? 0) - (a.field.value?.confidence ?? 0),
    )[0];
}

function candidate<T>(
  value: T | null,
  confidence: number | null,
  evidence: Evidence[],
) {
  return { value, confidence, evidence };
}

function fieldEvidence(
  field: ExpenseAnalysisField,
  pageNumber?: number,
): Evidence {
  return {
    text: field.value?.text ?? "",
    confidence: field.value?.confidence ?? null,
    pageNumber: pageNumber ?? null,
    source: "SUMMARY_FIELD",
  };
}

function detectionEvidence(
  detection: NonNullable<ExpenseAnalysisField["label"]>,
  pageNumber?: number,
): Evidence {
  return {
    text: detection.text ?? "",
    confidence: detection.confidence ?? null,
    pageNumber: pageNumber ?? null,
    source: "SUMMARY_FIELD",
  };
}

function matchCompany(
  company: LegalIdentityForMatching | null,
  customerTax: StringCandidate,
  customerName: StringCandidate,
): v1.finance.NormalizedExpenseExtraction["companyMatch"] {
  if (!company) return { status: "UNKNOWN", matchedBy: null, evidence: [] };

  if (customerTax.value) {
    const matches =
      normalizeTaxIdentifier(customerTax.value) ===
      normalizeTaxIdentifier(company.taxIdentifier);
    return {
      status: matches ? "MATCHED" : "MISMATCHED",
      matchedBy: matches ? "TAX_IDENTIFIER" : null,
      evidence: customerTax.evidence,
    };
  }

  if (customerName.value) {
    const extracted = normalizeLegalName(customerName.value);
    const legalNameMatches =
      extracted === normalizeLegalName(company.legalName);
    const aliasMatches = company.nameAliases.some(
      (alias) => normalizeLegalName(alias) === extracted,
    );
    return {
      status: legalNameMatches || aliasMatches ? "MATCHED" : "MISMATCHED",
      matchedBy: legalNameMatches
        ? "LEGAL_NAME"
        : aliasMatches
          ? "NAME_ALIAS"
          : null,
      evidence: customerName.evidence,
    };
  }

  return { status: "UNKNOWN", matchedBy: null, evidence: [] };
}

function resolveCustomerName(
  extracted: StringCandidate,
  company: LegalIdentityForMatching | null,
  companyMatch: v1.finance.NormalizedExpenseExtraction["companyMatch"],
): StringCandidate {
  if (extracted.value || !company) return extracted;
  if (
    companyMatch.status !== "MATCHED" ||
    companyMatch.matchedBy !== "TAX_IDENTIFIER"
  ) {
    return extracted;
  }

  return candidate(company.legalName, null, [
    {
      text: company.legalName,
      confidence: null,
      pageNumber: null,
      source: "RULE",
    },
  ]);
}

function detectPaymentMethod(
  lines: ExpenseAnalysisResult["documents"][number]["textLines"],
): { method: v1.finance.PaymentMethod | null; evidence: Evidence[] } {
  const card = lines.filter((line) => isCardPaymentLine(line.text));
  const cash = lines.filter((line) => isCashPaymentLine(line.text));
  if (card.length > 0 && cash.length === 0) {
    return { method: "CARD", evidence: card.map(lineEvidence) };
  }
  if (cash.length > 0 && card.length === 0) {
    return { method: "CASH", evidence: cash.map(lineEvidence) };
  }
  return { method: null, evidence: [...card, ...cash].map(lineEvidence) };
}

function isCardPaymentLine(text: string): boolean {
  const normalized = normalizePaymentLine(text);
  if (/\b(?:FIDELITATE|LOYALTY)\b/.test(normalized)) return false;
  if (/\b(?:CARD|VISA|MASTERCARD|MAESTRO)\b/.test(normalized)) return true;

  // `POS` can mean the shop/location on Romanian receipts (`POS: SHOWROOM`),
  // not a card transaction. Only accept it when the same OCR line contains a
  // clear payment or terminal signal.
  return (
    /\bPOS\b/.test(normalized) &&
    /\b(?:PLATA|PLATIT|ACHITAT|TRANZACTIE|APROBAT|APPROVED|PAYMENT|PAID|TERMINAL)\b/.test(
      normalized,
    )
  );
}

function isCashPaymentLine(text: string): boolean {
  const normalized = normalizePaymentLine(text);
  // Change is not another payment. Excluding it also handles English receipts
  // that print labels such as `CASH CHANGE`.
  if (/\b(?:REST|CHANGE)\b/.test(normalized)) return false;
  return /\b(?:CASH|NUMERAR)\b/.test(normalized);
}

function normalizePaymentLine(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function lineEvidence(
  line: ExpenseAnalysisResult["documents"][number]["textLines"][number],
): Evidence {
  return {
    text: line.text,
    confidence: line.confidence ?? null,
    pageNumber: line.pageNumber ?? null,
    source: "OCR_LINE",
  };
}

function detectCategory(analysis: ExpenseAnalysisResult): {
  code: string | null;
  evidence: Evidence[];
} {
  const itemEvidence = analysis.documents.flatMap((document) =>
    document.lineItemGroups.flatMap((group) =>
      group.items.flatMap((item) =>
        item.fields.flatMap((field) =>
          field.value?.text
            ? [
                {
                  text: field.value.text,
                  confidence: field.value.confidence ?? null,
                  pageNumber: field.pageNumber ?? null,
                  source: "LINE_ITEM" as const,
                },
              ]
            : [],
        ),
      ),
    ),
  );
  const candidates = [
    ...itemEvidence,
    ...analysis.documents.flatMap((document) =>
      document.textLines.map(lineEvidence),
    ),
  ];
  const matches = CATEGORY_RULES.map((rule) => {
    const evidence = candidates.filter((item) =>
      rule.pattern.test(normalizeCategoryText(item.text)),
    );
    const score = evidence.reduce(
      (total, item) => total + (item.source === "LINE_ITEM" ? 4 : 1),
      0,
    );
    return { ...rule, evidence, score };
  })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);

  const best = matches[0];
  return best
    ? { code: best.code, evidence: best.evidence }
    : { code: "OTHER", evidence: [] };
}

function normalizeCategoryText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

const CATEGORY_RULES: ReadonlyArray<{ code: string; pattern: RegExp }> = [
  {
    code: "FUEL",
    pattern:
      /\b(BENZINA|MOTORINA|COMBUSTIBIL|CARBURANT|DIESEL|PETROL|GASOLINE|GPL)\b/,
  },
  {
    code: "REPAIRS",
    pattern:
      /\b(REPARATIE|REPARATII|MANOPERA|SERVICE AUTO|REVIZIE|DIAGNOZA|VULCANIZARE|MAINTENANCE|REPAIR|WORKSHOP LABOU?R)\b/,
  },
  {
    code: "PARTS",
    pattern:
      /\b(VARIATOR|CUREA|TRANSMISIE|PIESA|PIESE|LEVIER|FILTRU|PLACUTA|PLACUTE|BATERIE|ANVELOPA|ANVELOPE|ULEI(?:\s+[A-Z0-9]+){0,3}\s+(?:MOTOR|MOT)|BRAKE PAD|OIL FILTER|MOTOR OIL|SPARE PART|PARTS)\b/,
  },
  {
    code: "RENT",
    pattern: /\b(CHIRIE|INCHIRIERE|RENT|RENTAL|LEASE)\b/,
  },
  {
    code: "ACCOUNTING",
    pattern:
      /\b(CONTABILITATE|SERVICII CONTABILE|ACCOUNTING|BOOKKEEPING|AUDIT)\b/,
  },
  {
    code: "SOFTWARE",
    pattern:
      /\b(SOFTWARE|LICENTA|LICENTE|SUBSCRIPTION|ABONAMENT SOFTWARE|HOSTING|CLOUD SERVICE|DOMAIN NAME)\b/,
  },
  {
    code: "INSURANCE",
    pattern: /\b(ASIGURARE|RCA|CASCO|INSURANCE|POLITA)\b/,
  },
  {
    code: "ADVERTISING",
    pattern:
      /\b(PUBLICITATE|RECLAMA|PROMOVARE|MARKETING|ADVERTISING|GOOGLE ADS|META ADS)\b/,
  },
  {
    code: "EQUIPMENT",
    pattern:
      /\b(ECHIPAMENT|SCULA|SCULE|UNELTA|UNELTE|LAPTOP|IMPRIMANTA|COMPUTER|TOOLS|EQUIPMENT)\b/,
  },
  {
    code: "VEHICLE_PURCHASE",
    pattern:
      /\b(ACHIZITIE|VANZARE|PURCHASE|SALE)\b.*\b(AUTOTURISM|AUTOVEHICUL|VEHICUL|SCUTER|MOTOCICLETA|CAR|VEHICLE|SCOOTER|MOTORCYCLE)\b/,
  },
];
