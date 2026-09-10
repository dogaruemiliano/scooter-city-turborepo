import { v1 } from "@repo/api-shared";

import type { ExpenseAnalysisResult } from "../../../document-extraction/document-extraction.types";
import {
  extractRomanianBuyerTaxIdentifier,
  extractRomanianSupplierTaxIdentifier,
  mapExpenseAnalysis,
  normalizeReceiptDate,
  normalizeTaxIdentifier,
  parseReceiptAmountMinor,
} from "./map-expense-extraction";

const field = (type: string, value: string, currency?: string) => ({
  type: { text: type, confidence: 99 },
  value: { text: value, confidence: 98 },
  ...(currency ? { currency: { code: currency, confidence: 97 } } : {}),
  groups: [],
});

describe("mapExpenseAnalysis", () => {
  it("matches the buyer by CUI and explains card/common/parts suggestions", () => {
    const result: ExpenseAnalysisResult = {
      provider: "aws-textract",
      providerRequestId: "sanitized-request",
      pages: 1,
      documents: [
        {
          summaryFields: [
            field("VENDOR_NAME", "EXAMPLE PARTS SRL"),
            field("VENDOR_VAT_NUMBER", "RO87654321"),
            field("RECEIVER_VAT_NUMBER", "12345678"),
            field("TOTAL", "360,00", "RON"),
            field("INVOICE_RECEIPT_DATE", "31.07.2026"),
            field("INVOICE_RECEIPT_ID", "TEST-0024"),
          ],
          lineItemGroups: [
            { items: [{ fields: [field("ITEM", "CUREA TRANSMISIE")] }] },
          ],
          textLines: [{ text: "CARD", confidence: 99, pageNumber: 1 }],
        },
      ],
    };

    const mapped = mapExpenseAnalysis(result, {
      legalName: "EXAMPLE COMPANY SRL",
      taxIdentifier: "RO12345678",
      nameAliases: [],
    });

    expect(mapped.amountMinor.value).toBe(36_000);
    expect(mapped.currency.value).toBe("RON");
    expect(mapped.supplierTaxIdentifier.value).toBe("RO87654321");
    expect(mapped.companyMatch).toMatchObject({
      status: "MATCHED",
      matchedBy: "TAX_IDENTIFIER",
    });
    expect(mapped.suggestedBookType).toBe("COMPANY");
    expect(mapped.suggestedPaymentMethod).toBe("CARD");
    expect(mapped.suggestedAllocationType).toBe("COMMON");
    expect(mapped.suggestedCategoryCode).toBe("PARTS");
    expect(mapped.suggestionEvidence.paymentMethod[0]?.text).toBe("CARD");
    expect(mapped.suggestionEvidence.categoryCode[0]?.text).toBe(
      "CUREA TRANSMISIE",
    );
    expect(() =>
      v1.finance.normalizedExpenseExtractionSchema.parse(mapped),
    ).not.toThrow();
    expect(mapped.explanations).toEqual(
      expect.arrayContaining([
        "COMPANY_MATCH:TAX_IDENTIFIER",
        "PAYMENT_METHOD:CARD",
        "ALLOCATION:COMMON:CARD_RULE",
        "CATEGORY:PARTS:LINE_ITEM_RULE",
      ]),
    );
  });

  it("suggests the associate pool when the buyer CUI differs", () => {
    const result: ExpenseAnalysisResult = {
      provider: "fake",
      documents: [
        {
          summaryFields: [field("RECEIVER_VAT_NUMBER", "RO123")],
          lineItemGroups: [],
          textLines: [],
        },
      ],
    };

    const mapped = mapExpenseAnalysis(result, {
      legalName: "EXAMPLE COMPANY SRL",
      taxIdentifier: "RO12345678",
      nameAliases: [],
    });

    expect(mapped.companyMatch.status).toBe("MISMATCHED");
    expect(mapped.suggestedBookType).toBe("ASSOCIATE_POOL");
    expect(mapped.suggestedAllocationType).toBe("COMMON");
    expect(mapped.suggestedCategoryCode).toBe("POOL_OTHER");
    expect(mapped.explanations).toEqual(
      expect.arrayContaining([
        "COMPANY_MISMATCH",
        "ALLOCATION:COMMON:ASSOCIATE_POOL_RULE",
      ]),
    );
  });

  it("suggests the associate pool when a configured company is absent from the receipt", () => {
    const result: ExpenseAnalysisResult = {
      provider: "aws-textract",
      documents: [
        {
          summaryFields: [field("VENDOR_NAME", "ROTAKT SRL")],
          lineItemGroups: [],
          textLines: [],
        },
      ],
    };

    const mapped = mapExpenseAnalysis(result, {
      legalName: "JUSEM HUB SRL",
      taxIdentifier: "RO54842598",
      nameAliases: [],
    });

    expect(mapped.companyMatch.status).toBe("UNKNOWN");
    expect(mapped.suggestedBookType).toBe("ASSOCIATE_POOL");
    expect(mapped.suggestedAllocationType).toBe("COMMON");
  });

  it("keeps the finance book unset when company identity is not configured", () => {
    const result: ExpenseAnalysisResult = {
      provider: "aws-textract",
      documents: [
        {
          summaryFields: [field("VENDOR_NAME", "ROTAKT SRL")],
          lineItemGroups: [],
          textLines: [
            { text: "NUMERAR LEI 25,00", confidence: 99, pageNumber: 1 },
          ],
        },
      ],
    };

    const mapped = mapExpenseAnalysis(result, null);

    expect(mapped.companyMatch.status).toBe("UNKNOWN");
    expect(mapped.suggestedBookType).toBeNull();
    expect(mapped.suggestedAllocationType).toBeNull();
  });

  it("maps the personal-funds oil receipt to a shared pool cost paid in cash", () => {
    const result: ExpenseAnalysisResult = {
      provider: "aws-textract",
      providerRequestId: "oil-receipt",
      pages: 1,
      documents: [
        {
          summaryFields: [
            field("VENDOR_NAME", "ROTAKT SRL"),
            field("TOTAL", "25,00", "RON"),
            field("AMOUNT_PAID", "50,00", "RON"),
            field("INVOICE_RECEIPT_DATE", "19-08-2026"),
          ],
          lineItemGroups: [
            {
              items: [
                {
                  fields: [field("ITEM", "(0231) ULEI AMESTEC PT MOTOR")],
                },
              ],
            },
          ],
          textLines: [
            { text: "ROTAKT SRL", confidence: 99, pageNumber: 1 },
            { text: "CIF: RO6334441", confidence: 98, pageNumber: 1 },
            {
              text: "POS: SHOWROOM NICOLAE BALCESCU",
              confidence: 99,
              pageNumber: 1,
            },
            {
              text: "(0231) ULEI AMESTEC PT MOTOR",
              confidence: 97,
              pageNumber: 1,
            },
            { text: "TOTAL LEI 25,00", confidence: 99, pageNumber: 1 },
            { text: "NUMERAR LEI 50,00", confidence: 99, pageNumber: 1 },
            { text: "REST LEI 25,00", confidence: 99, pageNumber: 1 },
          ],
        },
      ],
    };

    const mapped = mapExpenseAnalysis(result, {
      legalName: "JUSEM HUB SRL",
      taxIdentifier: "RO54842598",
      nameAliases: [],
    });

    expect(mapped.amountMinor.value).toBe(2_500);
    expect(mapped.occurredAt.value).toBe("2026-08-19");
    expect(mapped.supplierTaxIdentifier.value).toBe("RO6334441");
    expect(mapped.companyMatch.status).toBe("UNKNOWN");
    expect(mapped.suggestedBookType).toBe("ASSOCIATE_POOL");
    expect(mapped.suggestedPaymentMethod).toBe("CASH");
    expect(mapped.suggestedAllocationType).toBe("COMMON");
    expect(mapped.suggestedCategoryCode).toBe("POOL_SHARED_COST");
    expect(mapped.suggestionEvidence.paymentMethod[0]?.text).toBe(
      "NUMERAR LEI 50,00",
    );
    expect(mapped.suggestionEvidence.paymentMethod).toHaveLength(1);
    expect(mapped.suggestionEvidence.categoryCode[0]?.text).toBe(
      "(0231) ULEI AMESTEC PT MOTOR",
    );
    expect(mapped.explanations).toEqual(
      expect.arrayContaining([
        "COMPANY_UNKNOWN",
        "PAYMENT_METHOD:CASH",
        "ALLOCATION:COMMON:ASSOCIATE_POOL_RULE",
        "CATEGORY:POOL_SHARED_COST:LINE_ITEM_RULE",
      ]),
    );
    expect(() =>
      v1.finance.normalizedExpenseExtractionSchema.parse(mapped),
    ).not.toThrow();
  });

  it("prefers TOTAL over a higher-confidence AMOUNT_DUE", () => {
    const total = field("TOTAL", "25,00", "RON");
    const amountDue = field("AMOUNT_DUE", "50,00", "RON");
    total.value.confidence = 80;
    amountDue.value.confidence = 99;

    const mapped = mapExpenseAnalysis(
      {
        provider: "aws-textract",
        documents: [
          {
            summaryFields: [amountDue, total],
            lineItemGroups: [],
            textLines: [],
          },
        ],
      },
      null,
    );

    expect(mapped.amountMinor.value).toBe(2_500);
    expect(mapped.amountMinor.evidence[0]?.text).toBe("25,00");
  });

  it("does not treat a POS location label as a card payment", () => {
    const mapped = mapExpenseAnalysis(
      {
        provider: "aws-textract",
        documents: [
          {
            summaryFields: [field("TOTAL", "25,00", "RON")],
            lineItemGroups: [],
            textLines: [
              {
                text: "POS: SHOWROOM NICOLAE BALCESCU",
                confidence: 99,
                pageNumber: 1,
              },
            ],
          },
        ],
      },
      null,
    );

    expect(mapped.suggestedPaymentMethod).toBeNull();
    expect(mapped.suggestionEvidence.paymentMethod).toEqual([]);
  });

  it("accepts POS when it is explicitly described as a payment", () => {
    const mapped = mapExpenseAnalysis(
      {
        provider: "aws-textract",
        documents: [
          {
            summaryFields: [field("TOTAL", "25,00", "RON")],
            lineItemGroups: [],
            textLines: [
              {
                text: "PLATA POS 25,00",
                confidence: 99,
                pageNumber: 1,
              },
            ],
          },
        ],
      },
      null,
    );

    expect(mapped.suggestedPaymentMethod).toBe("CARD");
    expect(mapped.suggestionEvidence.paymentMethod[0]?.text).toBe(
      "PLATA POS 25,00",
    );
  });

  it("classifies FACTURA as a bill even when the invoice mentions a fiscal receipt", () => {
    const mapped = mapExpenseAnalysis(
      {
        provider: "aws-textract",
        documents: [
          {
            summaryFields: [field("TOTAL", "387,90", "RON")],
            lineItemGroups: [],
            textLines: [
              { text: "FACTURĂ", confidence: 99, pageNumber: 1 },
              {
                text: "Achitat cu CARD, s-a emis bonul fiscal 169303",
                confidence: 97,
                pageNumber: 1,
              },
            ],
          },
        ],
      },
      null,
    );

    expect(mapped.suggestedDocumentType).toBe("INVOICE");
    expect(mapped.suggestionEvidence.documentType).toEqual([
      {
        text: "FACTURĂ",
        confidence: 99,
        pageNumber: 1,
        source: "OCR_LINE",
      },
    ]);
    expect(mapped.explanations).toContain("DOCUMENT_TYPE:INVOICE:OCR_TEXT");
  });

  it("extracts a bill series and number from an invoice summary key/value", () => {
    const mapped = mapExpenseAnalysis(
      {
        provider: "aws-textract",
        documents: [
          {
            summaryFields: [
              {
                type: { text: "OTHER", confidence: 96 },
                label: { text: "Seria VL nr.", confidence: 94 },
                value: { text: "639013079", confidence: 95 },
                pageNumber: 1,
                groups: [],
              },
            ],
            lineItemGroups: [],
            textLines: [{ text: "FACTURĂ", confidence: 99, pageNumber: 1 }],
          },
        ],
      },
      null,
    );

    expect(mapped.documentSeries).toEqual({
      value: "VL",
      confidence: 94,
      evidence: [
        {
          text: "Seria VL nr.",
          confidence: 94,
          pageNumber: 1,
          source: "SUMMARY_FIELD",
        },
      ],
    });
    expect(mapped.documentNumber).toEqual({
      value: "639013079",
      confidence: 95,
      evidence: [
        {
          text: "639013079",
          confidence: 95,
          pageNumber: 1,
          source: "SUMMARY_FIELD",
        },
      ],
    });
  });

  it("uses only an anchored invoice header for the OCR series fallback", () => {
    const mapped = mapExpenseAnalysis(
      {
        provider: "aws-textract",
        documents: [
          {
            summaryFields: [field("INVOICE_RECEIPT_ID", "169303")],
            lineItemGroups: [],
            textLines: [
              { text: "FACTURĂ", confidence: 99, pageNumber: 1 },
              {
                text: "Seria VL nr. 639013079",
                confidence: 98,
                pageNumber: 1,
              },
              {
                text: "Index încărcare RO e-Factura: 6701333570",
                confidence: 97,
                pageNumber: 1,
              },
              {
                text: "CI seria VX nr. 854291 eliberat de SEP",
                confidence: 95,
                pageNumber: 1,
              },
              {
                text: "Achitat cu CARD, s-a emis bonul fiscal 169303",
                confidence: 97,
                pageNumber: 1,
              },
            ],
          },
        ],
      },
      null,
    );

    expect(mapped.documentSeries.value).toBe("VL");
    expect(mapped.documentNumber.value).toBe("639013079");
    expect(mapped.documentSeries.evidence[0]?.text).toBe(
      "Seria VL nr. 639013079",
    );
  });

  it("does not turn an invoice delegate's ID-card series into the bill series", () => {
    const mapped = mapExpenseAnalysis(
      {
        provider: "aws-textract",
        documents: [
          {
            summaryFields: [field("INVOICE_RECEIPT_ID", "639013079")],
            lineItemGroups: [],
            textLines: [
              { text: "FACTURĂ", confidence: 99, pageNumber: 1 },
              {
                text: "CI seria VX nr. 854291 eliberat de SEP",
                confidence: 95,
                pageNumber: 1,
              },
            ],
          },
        ],
      },
      null,
    );

    expect(mapped.documentSeries.value).toBeNull();
    expect(mapped.documentNumber.value).toBe("639013079");
  });

  it.each(["Bill", "INVOICE"])("classifies %s as a bill", (documentHeading) => {
    const mapped = mapExpenseAnalysis(
      {
        provider: "aws-textract",
        documents: [
          {
            summaryFields: [],
            lineItemGroups: [],
            textLines: [
              {
                text: documentHeading,
                confidence: 98,
                pageNumber: 1,
              },
            ],
          },
        ],
      },
      null,
    );

    expect(mapped.suggestedDocumentType).toBe("INVOICE");
  });

  it("keeps a fiscal receipt as a receipt", () => {
    const mapped = mapExpenseAnalysis(
      {
        provider: "aws-textract",
        documents: [
          {
            summaryFields: [field("INVOICE_RECEIPT_ID", "BF.0025")],
            lineItemGroups: [],
            textLines: [{ text: "BON FISCAL", confidence: 99, pageNumber: 1 }],
          },
        ],
      },
      null,
    );

    expect(mapped.suggestedDocumentType).toBe("RECEIPT");
    expect(mapped.documentSeries.value).toBeNull();
    expect(mapped.documentNumber.value).toBe("BF.0025");
    expect(mapped.suggestionEvidence.documentType[0]?.text).toBe("BON FISCAL");
  });

  it("finds a Romanian buyer CIF in OCR without confusing the seller CF", () => {
    const result: ExpenseAnalysisResult = {
      provider: "aws-textract",
      documents: [
        {
          summaryFields: [field("VENDOR_NAME", "DIACONU NICOLETA")],
          lineItemGroups: [],
          textLines: [
            { text: "- C.F. RO 28000817 -", confidence: 99, pageNumber: 1 },
            {
              text: "INFO.CLIENT: C.I.F. 54842598",
              confidence: 98,
              pageNumber: 1,
            },
          ],
        },
      ],
    };

    const mapped = mapExpenseAnalysis(result, {
      legalName: "JUSEM HUB SRL",
      taxIdentifier: "RO54842598",
      nameAliases: [],
    });

    expect(mapped.customerTaxIdentifier).toEqual({
      value: "54842598",
      confidence: 98,
      evidence: [
        {
          text: "INFO.CLIENT: C.I.F. 54842598",
          confidence: 98,
          pageNumber: 1,
          source: "OCR_LINE",
        },
      ],
    });
    expect(mapped.supplierTaxIdentifier).toEqual({
      value: "RO28000817",
      confidence: 99,
      evidence: [
        {
          text: "- C.F. RO 28000817 -",
          confidence: 99,
          pageNumber: 1,
          source: "OCR_LINE",
        },
      ],
    });
    expect(mapped.companyMatch).toMatchObject({
      status: "MATCHED",
      matchedBy: "TAX_IDENTIFIER",
    });
    expect(mapped.customerName).toEqual({
      value: "JUSEM HUB SRL",
      confidence: null,
      evidence: [
        {
          text: "JUSEM HUB SRL",
          confidence: null,
          pageNumber: null,
          source: "RULE",
        },
      ],
    });
    expect(mapped.suggestedBookType).toBe("COMPANY");
  });

  it("uses two-column geometry to keep interleaved supplier and customer CUIs separate", () => {
    const result: ExpenseAnalysisResult = {
      provider: "aws-textract",
      providerRequestId: "rar-two-column-invoice",
      pages: 1,
      documents: [
        {
          summaryFields: [
            field("VENDOR_NAME", "REGISTRUL AUTO ROMAN R.A."),
            field("RECEIVER_NAME", "JUSEM HUB S.R.L."),
          ],
          lineItemGroups: [],
          // Textract returns these LINE blocks in top-to-bottom reading order,
          // interleaving the supplier column on the left with the customer
          // column on the right. Their bounding boxes preserve ownership.
          textLines: [
            {
              text: "Furnizor",
              confidence: 99.49955749511719,
              pageNumber: 1,
              boundingBox: {
                left: 0.11337659507989883,
                top: 0.2873881757259369,
                width: 0.045262664556503296,
                height: 0.006402499973773956,
              },
            },
            {
              text: "REGISTRUL AUTO ROMAN R.A.",
              confidence: 99.37709045410156,
              pageNumber: 1,
              boundingBox: {
                left: 0.17980407178401947,
                top: 0.2865145206451416,
                width: 0.1660573035478592,
                height: 0.01056570466607809,
              },
            },
            {
              text: "Client",
              confidence: 99.716796875,
              pageNumber: 1,
              boundingBox: {
                left: 0.4894842505455017,
                top: 0.2875065505504608,
                width: 0.030314497649669647,
                height: 0.0059415721334517,
              },
            },
            {
              text: "JUSEM HUB S.R.L.",
              confidence: 99.04283905029297,
              pageNumber: 1,
              boundingBox: {
                left: 0.5519487261772156,
                top: 0.28537970781326294,
                width: 0.09633830934762955,
                height: 0.008244450204074383,
              },
            },
            {
              text: "C.U.I.",
              confidence: 99.00091552734375,
              pageNumber: 1,
              boundingBox: {
                left: 0.11458323150873184,
                top: 0.2978816628456116,
                width: 0.02678331360220909,
                height: 0.005924350116401911,
              },
            },
            {
              text: "RO1590236",
              confidence: 94.93363189697266,
              pageNumber: 1,
              boundingBox: {
                left: 0.18030770123004913,
                top: 0.2976436913013458,
                width: 0.06136777251958847,
                height: 0.007256544195115566,
              },
            },
            {
              text: "C.U.I.",
              confidence: 99.29707336425781,
              pageNumber: 1,
              boundingBox: {
                left: 0.4896189272403717,
                top: 0.29741787910461426,
                width: 0.025817105546593666,
                height: 0.005609486717730761,
              },
            },
            {
              text: "54842598",
              confidence: 99.736328125,
              pageNumber: 1,
              boundingBox: {
                left: 0.5519651174545288,
                top: 0.2960291802883148,
                width: 0.05242956429719925,
                height: 0.006498818751424551,
              },
            },
          ],
        },
      ],
    };

    const mapped = mapExpenseAnalysis(result, {
      legalName: "JUSEM HUB SRL",
      taxIdentifier: "RO54842598",
      nameAliases: [],
    });

    expect(mapped.supplierTaxIdentifier.value).toBe("RO1590236");
    expect(mapped.customerTaxIdentifier.value).toBe("54842598");
    expect(mapped.companyMatch).toMatchObject({
      status: "MATCHED",
      matchedBy: "TAX_IDENTIFIER",
    });
  });

  it("uses Textract's official TAX_PAYER_ID as the supplier tax ID", () => {
    const result: ExpenseAnalysisResult = {
      provider: "aws-textract",
      documents: [
        {
          summaryFields: [field("TAX_PAYER_ID", "R02816464")],
          lineItemGroups: [],
          textLines: [],
        },
      ],
    };

    expect(mapExpenseAnalysis(result, null).supplierTaxIdentifier).toEqual({
      value: "RO2816464",
      confidence: 98,
      evidence: [
        {
          text: "R02816464",
          confidence: 98,
          pageNumber: null,
          source: "SUMMARY_FIELD",
        },
      ],
    });
  });

  it("corrects an OCR zero in a vendor VAT prefix", () => {
    const result: ExpenseAnalysisResult = {
      provider: "aws-textract",
      documents: [
        {
          summaryFields: [field("VENDOR_VAT_NUMBER", "R06334441")],
          lineItemGroups: [],
          textLines: [],
        },
      ],
    };

    expect(mapExpenseAnalysis(result, null).supplierTaxIdentifier).toEqual({
      value: "RO6334441",
      confidence: 98,
      evidence: [
        {
          text: "R06334441",
          confidence: 98,
          pageNumber: null,
          source: "SUMMARY_FIELD",
        },
      ],
    });
  });

  it("keeps a vendor-specific tax field ahead of conflicting OCR text", () => {
    const result: ExpenseAnalysisResult = {
      provider: "aws-textract",
      documents: [
        {
          summaryFields: [
            field("VENDOR_VAT_NUMBER", "RO87654321"),
            field("TAX_PAYER_ID", "RO11111111"),
          ],
          lineItemGroups: [],
          textLines: [
            { text: "CUI: RO2816464", confidence: 99, pageNumber: 1 },
          ],
        },
      ],
    };

    expect(mapExpenseAnalysis(result, null).supplierTaxIdentifier.value).toBe(
      "RO87654321",
    );
  });

  it("does not reuse a receiver TAX_PAYER_ID as the supplier tax ID", () => {
    const result: ExpenseAnalysisResult = {
      provider: "aws-textract",
      documents: [
        {
          summaryFields: [
            field("RECEIVER_VAT_NUMBER", "RO54842598"),
            {
              ...field("TAX_PAYER_ID", "RO54842598"),
              groups: [{ types: ["RECEIVER_BILL_TO"] }],
            },
          ],
          lineItemGroups: [],
          textLines: [],
        },
      ],
    };

    expect(
      mapExpenseAnalysis(result, null).supplierTaxIdentifier.value,
    ).toBeNull();
  });

  it("does not reuse an ungrouped buyer tax ID after correcting its OCR prefix", () => {
    const result: ExpenseAnalysisResult = {
      provider: "aws-textract",
      documents: [
        {
          summaryFields: [
            field("RECEIVER_VAT_NUMBER", "RO54842598"),
            field("TAX_PAYER_ID", "R054842598"),
          ],
          lineItemGroups: [],
          textLines: [],
        },
      ],
    };

    expect(
      mapExpenseAnalysis(result, null).supplierTaxIdentifier.value,
    ).toBeNull();
  });

  it("preserves an extracted buyer name instead of replacing it from settings", () => {
    const result: ExpenseAnalysisResult = {
      provider: "aws-textract",
      documents: [
        {
          summaryFields: [
            field("RECEIVER_NAME", "JUSEM HUB S.R.L."),
            field("RECEIVER_VAT_NUMBER", "RO54842598"),
          ],
          lineItemGroups: [],
          textLines: [],
        },
      ],
    };

    const mapped = mapExpenseAnalysis(result, {
      legalName: "JUSEM HUB SRL",
      taxIdentifier: "54842598",
      nameAliases: [],
    });

    expect(mapped.customerName.value).toBe("JUSEM HUB S.R.L.");
    expect(mapped.customerName.confidence).toBe(98);
    expect(mapped.customerName.evidence[0]?.source).toBe("SUMMARY_FIELD");
  });

  it("does not fill the company name when the buyer CUI does not match", () => {
    const result: ExpenseAnalysisResult = {
      provider: "aws-textract",
      documents: [
        {
          summaryFields: [],
          lineItemGroups: [],
          textLines: [
            {
              text: "INFO.CLIENT: C.I.F. 12345678",
              confidence: 97,
              pageNumber: 1,
            },
          ],
        },
      ],
    };

    const mapped = mapExpenseAnalysis(result, {
      legalName: "JUSEM HUB SRL",
      taxIdentifier: "54842598",
      nameAliases: [],
    });

    expect(mapped.companyMatch.status).toBe("MISMATCHED");
    expect(mapped.customerName.value).toBeNull();
  });

  it.each([
    ["MOTORINA STANDARD", "FUEL"],
    ["MANOPERA SERVICE AUTO", "REPAIRS"],
    ["LEVIER FRANA", "PARTS"],
    ["SERVICII CONTABILE", "ACCOUNTING"],
    ["POLITA RCA", "INSURANCE"],
    ["ARTICOL DIVERS", "OTHER"],
  ])("suggests category %s as %s", (item, expectedCategory) => {
    const result: ExpenseAnalysisResult = {
      provider: "aws-textract",
      documents: [
        {
          summaryFields: [],
          lineItemGroups: [{ items: [{ fields: [field("ITEM", item)] }] }],
          textLines: [],
        },
      ],
    };

    expect(mapExpenseAnalysis(result, null).suggestedCategoryCode).toBe(
      expectedCategory,
    );
  });
});

describe("receipt normalization", () => {
  it.each([
    ["360,00 RON", 36_000],
    ["1.234,56", 123_456],
    ["1,234.56", 123_456],
    ["360", 36_000],
  ])("parses %s into minor units", (input, expected) => {
    expect(parseReceiptAmountMinor(input)).toBe(expected);
  });

  it("normalizes Romanian VAT prefixes and punctuation", () => {
    expect(normalizeTaxIdentifier("CUI: RO 12.345.678")).toBe("12345678");
    expect(normalizeTaxIdentifier("C.F. RO 12.345.678")).toBe("12345678");
  });

  it("does not treat a seller-only CF line as the buyer tax identifier", () => {
    expect(
      extractRomanianBuyerTaxIdentifier([
        { text: "- C.F. RO 28000817 -", confidence: 99, pageNumber: 1 },
      ]),
    ).toEqual({ value: null, confidence: null, evidence: [] });
  });

  it("extracts a seller-only CF line as the supplier tax identifier", () => {
    expect(
      extractRomanianSupplierTaxIdentifier([
        { text: "- C.F. R0 28000817 -", confidence: 99, pageNumber: 1 },
      ]),
    ).toMatchObject({ value: "RO28000817", confidence: 99 });
  });

  it("keeps seller and buyer CIF values separate across invoice sections", () => {
    expect(
      extractRomanianSupplierTaxIdentifier(
        [
          { text: "CIF: RO2816464", confidence: 99, pageNumber: 1 },
          {
            text: "CUMPARATOR: JUSEM HUB SRL",
            confidence: 98,
            pageNumber: 1,
          },
          { text: "CIF: 54842598", confidence: 97, pageNumber: 1 },
          { text: "COD CLIENT: 14229272", confidence: 99, pageNumber: 1 },
        ],
        "54842598",
      ),
    ).toMatchObject({ value: "RO2816464", confidence: 99 });
  });

  it("does not reuse a buyer-only CIF as the supplier tax identifier", () => {
    expect(
      extractRomanianSupplierTaxIdentifier(
        [
          {
            text: "INFO.CLIENT: C.I.F. 54842598",
            confidence: 98,
            pageNumber: 1,
          },
        ],
        "54842598",
      ),
    ).toEqual({ value: null, confidence: null, evidence: [] });
  });

  it("recognizes a seller section even when it follows the buyer", () => {
    expect(
      extractRomanianSupplierTaxIdentifier(
        [
          { text: "CUMPARATOR: JUSEM HUB SRL", pageNumber: 1 },
          { text: "CIF: 54842598", pageNumber: 1 },
          { text: "FURNIZOR: EXAMPLE PARTS SRL", pageNumber: 1 },
          { text: "C.U.I.: RO87654321", confidence: 96, pageNumber: 1 },
        ],
        "54842598",
      ),
    ).toMatchObject({ value: "RO87654321", confidence: 96 });
  });

  it("supports a supplier CIF split across adjacent lines on the same page", () => {
    expect(
      extractRomanianSupplierTaxIdentifier([
        { text: "CIF:", confidence: 98, pageNumber: 1 },
        { text: "RO 2816464", confidence: 96, pageNumber: 1 },
      ]),
    ).toMatchObject({ value: "RO2816464", confidence: 96 });
  });

  it("does not join a supplier CIF label to a number on another page", () => {
    expect(
      extractRomanianSupplierTaxIdentifier([
        { text: "CIF:", confidence: 98, pageNumber: 1 },
        { text: "RO 2816464", confidence: 96, pageNumber: 2 },
      ]),
    ).toEqual({ value: null, confidence: null, evidence: [] });
  });

  it("ignores VAT rates and customer codes", () => {
    expect(
      extractRomanianSupplierTaxIdentifier([
        { text: "TVA A=21.00%", confidence: 99, pageNumber: 1 },
        { text: "COD CLIENT: 14229272", confidence: 99, pageNumber: 1 },
      ]),
    ).toEqual({ value: null, confidence: null, evidence: [] });
  });

  it("supports a buyer CIF split across adjacent OCR lines", () => {
    expect(
      extractRomanianBuyerTaxIdentifier([
        { text: "INFO.CLIENT: C.I.F.", confidence: 98, pageNumber: 1 },
        { text: "RO 54842598", confidence: 96, pageNumber: 1 },
      ]),
    ).toMatchObject({ value: "RO54842598", confidence: 96 });
  });

  it.each([
    ["31.07.2026", "2026-07-31"],
    ["2026-07-31", "2026-07-31"],
    ["31/02/2026", null],
  ])("normalizes receipt date %s", (input, expected) => {
    expect(normalizeReceiptDate(input)).toBe(expected);
  });
});
