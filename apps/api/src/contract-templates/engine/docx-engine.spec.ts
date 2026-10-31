import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSpeedDeclaration,
  FIELD_REGISTRY,
  renderDocxTemplate,
  sha256,
  splitCombinedTemplate,
  templateManifestHash,
  validateDocxTemplate,
  type ContractTemplateType,
  type TemplateValues,
} from "./docx-engine";
import { BASE_DOCUMENT_ORDER } from "./registry";
import { PREVIEW_SCENARIOS, previewValues } from "./preview-values";
import { elements, parseXml, W, wordText, xmlBuffer } from "./ooxml";
import { DOCX_LIMITS, readDocxZip, writeDocxZip } from "./zip";
import { convertDocxToPdf } from "./pdf-converter";

const asset = (name: string): Buffer =>
  readFileSync(join(__dirname, "../assets", name));
const source = (type: ContractTemplateType): Buffer =>
  asset(`${type.toLowerCase().replaceAll("_", "-")}.docx`);
const changePart = (
  input: Buffer,
  part: string,
  change: (xml: string) => string,
): Buffer => {
  const entries = readDocxZip(input);
  entries.set(part, Buffer.from(change(entries.get(part)!.toString())));
  return writeDocxZip(entries);
};

describe("contract DOCX engine", () => {
  it("requires independent customer and company slots for a separate promotional document", () => {
    const report = validateDocxTemplate(
      source("GDPR_NOTICE"),
      "PROMOTION_ADDENDUM",
    );
    expect(report.errors).toEqual(
      expect.arrayContaining([
        "Required placeholder missing: companySignContract.",
        "Required placeholder missing: renterSignContract.",
      ]),
    );
  });
  it("never declares delivery or good condition for a zero-helmet preview", () => {
    const values = previewValues("TECHNICAL_HANDOVER", "ABSENT_EQUIPMENT");
    expect(values).toMatchObject({
      helmetQuantity: "0",
      helmetHandover: "Nu se predă",
      helmetCondition: "Nu se aplică",
    });
    const rendered = renderDocxTemplate(
      source("TECHNICAL_HANDOVER"),
      "TECHNICAL_HANDOVER",
      values,
    );
    const body = parseXml(
      readDocxZip(rendered).get("word/document.xml")!.toString("utf8"),
    );
    expect(wordText(body)).toContain("Nu se predă");
    expect(wordText(body)).not.toContain("Predare cască: Predată");
  });
  it("migrates the 123-field inventory into independent document subsets", () => {
    expect(FIELD_REGISTRY).toHaveLength(123);
    expect(new Set(FIELD_REGISTRY.map((field) => field.key)).size).toBe(123);
    expect(
      BASE_DOCUMENT_ORDER.map(
        (type) => validateDocxTemplate(source(type), type).placeholders.length,
      ),
    ).toEqual([45, 16, 89]);
    for (const type of BASE_DOCUMENT_ORDER)
      expect(validateDocxTemplate(source(type), type).status).toBe("PASSED");
  });

  it("structurally splits annex headings, preserves exact body text and leaves the source intact", () => {
    const original = asset("combined-v2-source.docx");
    const before = sha256(original);
    const split = splitCombinedTemplate(original);
    expect(split.map((result) => result.type)).toEqual(BASE_DOCUMENT_ORDER);
    expect(sha256(original)).toBe(before);
    expect(split.every((result) => result.report.status === "PASSED")).toBe(
      true,
    );
    const originalEntries = readDocxZip(original);
    const bodyTexts = split.map((result) =>
      wordText(parseXml(readDocxZip(result.source).get("word/document.xml")!)),
    );
    const originalText = wordText(
      parseXml(originalEntries.get("word/document.xml")!),
    );
    expect(bodyTexts[0] + bodyTexts[2] + bodyTexts[1]).toBe(originalText);
    expect(bodyTexts[1]).toContain("ANEXA NR. 2");
    expect(bodyTexts[1]).not.toContain("ANEXA NR. 1");
    expect(bodyTexts[2]).toContain("ANEXA NR. 1");
    for (const result of split) {
      const entries = readDocxZip(result.source);
      for (const [name, bytes] of originalEntries)
        if (name !== "word/document.xml")
          expect(entries.get(name)).toEqual(bytes);
      expect(result.source).toEqual(source(result.type));
    }
  });

  it("rejects ambiguous or missing structural boundaries", () => {
    expect(() =>
      splitCombinedTemplate(
        changePart(
          asset("combined-v2-source.docx"),
          "word/document.xml",
          (xml) => xml.replace("ANEXA NR. 1", "ANEXA NR. X"),
        ),
      ),
    ).toThrow("structural boundaries");
  });

  it.each(
    BASE_DOCUMENT_ORDER.flatMap((type) =>
      PREVIEW_SCENARIOS.map((scenario) => [type, scenario] as const),
    ),
  )(
    "renders %s / %s without literal tokens and includes the synthetic label",
    (type, scenario) => {
      const rendered = renderDocxTemplate(
        source(type),
        type,
        previewValues(type, scenario),
      );
      const entries = readDocxZip(rendered);
      for (const [part, bytes] of entries)
        if (/^word\/(document|header\d+|footer\d+)\.xml$/.test(part))
          expect(wordText(parseXml(bytes))).not.toContain("${");
      expect(wordText(parseXml(entries.get("word/footer1.xml")!))).toContain(
        "DATE SINTETICE",
      );
      expect(
        [...entries.keys()].some((name) => name.startsWith("word/media/slot-")),
      ).toBe(true);
    },
  );

  it("resolves split-run tokens in body and every header/footer without reinterpreting $&, <, & or diacritics", () => {
    const splitToken = (input: Buffer, part: string, key: string): Buffer => {
      const entries = readDocxZip(input);
      const document = parseXml(entries.get(part)!);
      const text = elements(document, W, "t").find((element) =>
        (element.textContent ?? "").includes(`\${${key}}`),
      )!;
      const full = text.textContent!;
      const at = full.indexOf(`\${${key}}`) + 5;
      const next = text.cloneNode(true);
      text.textContent = full.slice(0, at);
      next.textContent = full.slice(at);
      const run = text.parentNode!;
      const nextRun = run.cloneNode(false);
      nextRun.appendChild(next);
      while (text.nextSibling) nextRun.appendChild(text.nextSibling);
      run.parentNode!.insertBefore(nextRun, run.nextSibling);
      entries.set(part, xmlBuffer(document));
      return writeDocxZip(entries);
    };
    let input = splitToken(
      source("GDPR_NOTICE"),
      "word/document.xml",
      "renterFullName",
    );
    for (const header of ["header1", "header2", "header3"])
      input = splitToken(input, `word/${header}.xml`, "companyName");
    for (const footer of ["footer1", "footer2", "footer3"])
      input = splitToken(input, `word/${footer}.xml`, "contractNumber");
    const exact = "$& <Ștefan> & Ionescu";
    const entries = readDocxZip(
      renderDocxTemplate(input, "GDPR_NOTICE", {
        ...previewValues("GDPR_NOTICE", "25"),
        renterFullName: exact,
        companyName: exact,
        contractNumber: exact,
      }),
    );
    for (const part of [
      "document",
      "header1",
      "header2",
      "header3",
      "footer1",
      "footer2",
      "footer3",
    ])
      expect(wordText(parseXml(entries.get(`word/${part}.xml`)!))).toContain(
        exact,
      );
  });

  it("does not join unrelated paragraphs or line breaks into a placeholder", () => {
    const input = changePart(
      source("GDPR_NOTICE"),
      "word/document.xml",
      (xml) =>
        xml.replace("${renterFullName}", "${renter</w:t><w:br/><w:t>FullName}"),
    );
    expect(validateDocxTemplate(input, "GDPR_NOTICE").status).toBe("FAILED");
  });

  it("reports malformed, unknown, disallowed and missing mandatory tokens separately", () => {
    const input = changePart(
      source("GDPR_NOTICE"),
      "word/document.xml",
      (xml) =>
        xml.replace(
          "${renterSignGdpr}",
          "${unknownThing} ${fuelLevel} ${bad.key}",
        ),
    );
    const report = validateDocxTemplate(input, "GDPR_NOTICE");
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Malformed"),
        expect.stringContaining("Unknown placeholder"),
        expect.stringContaining("not allowed"),
        expect.stringContaining("Required placeholder missing"),
      ]),
    );
  });

  it("requires every used value, accepts zero as text, and forbids nested tokens or unexpected data keys", () => {
    const values = {
      ...previewValues("TECHNICAL_HANDOVER", "25"),
      helmetQuantity: "0",
    };
    expect(() =>
      renderDocxTemplate(
        source("TECHNICAL_HANDOVER"),
        "TECHNICAL_HANDOVER",
        values,
      ),
    ).not.toThrow();
    delete (values as Record<string, unknown>).helmetQuantity;
    expect(() =>
      renderDocxTemplate(
        source("TECHNICAL_HANDOVER"),
        "TECHNICAL_HANDOVER",
        values,
      ),
    ).toThrow("Missing value");
    expect(() =>
      renderDocxTemplate(source("GDPR_NOTICE"), "GDPR_NOTICE", {
        ...previewValues("GDPR_NOTICE", "25"),
        renterFullName: "${companyName}",
      }),
    ).toThrow("Invalid text");
    expect(() =>
      renderDocxTemplate(source("GDPR_NOTICE"), "GDPR_NOTICE", {
        ...previewValues("GDPR_NOTICE", "25"),
        secret: "x",
      } as TemplateValues),
    ).toThrow("Unknown data field");
  });

  it("never prints URLs or labels into image slots and never invents finalized signatures", () => {
    const values = previewValues("GDPR_NOTICE", "25");
    expect(() =>
      renderDocxTemplate(source("GDPR_NOTICE"), "GDPR_NOTICE", {
        ...values,
        companyLogo: "https://attacker/logo.png",
      }),
    ).toThrow("Invalid text");
    expect(() =>
      renderDocxTemplate(
        source("GDPR_NOTICE"),
        "GDPR_NOTICE",
        values,
        "FINAL_SIGNED",
      ),
    ).toThrow("signature slot");
    expect(() =>
      renderDocxTemplate(source("GDPR_NOTICE"), "GDPR_NOTICE", {
        ...values,
        companySignGdpr: { kind: "not-applicable" },
      }),
    ).toThrow("signature slot");
    expect(() =>
      renderDocxTemplate(source("GDPR_NOTICE"), "GDPR_NOTICE", {
        ...values,
        companyLogo: {
          kind: "image",
          bytes: Buffer.from("<svg/>"),
          mimeType: "image/png",
          alt: "malicious",
        },
      }),
    ).toThrow("PNG/JPEG");
    const logo = values.companyLogo!;
    expect(() =>
      renderDocxTemplate(
        source("GDPR_NOTICE"),
        "GDPR_NOTICE",
        { ...values, companySignGdpr: logo, renterSignGdpr: logo },
        "FINAL_SIGNED",
      ),
    ).not.toThrow();
  });

  it("rejects unsafe ZIP structures, wrong formats and expanded content over the limit", () => {
    expect(() => readDocxZip(Buffer.from("not a docx"))).toThrow();
    const oversized = new Map(readDocxZip(source("GDPR_NOTICE")));
    oversized.set("word/huge.xml", Buffer.alloc(DOCX_LIMITS.entryBytes + 1));
    expect(() => readDocxZip(writeDocxZip(oversized))).toThrow("oversized");
    const traversal = Buffer.from(source("GDPR_NOTICE"));
    const name = Buffer.from("docProps/app.xml");
    const bad = Buffer.from("../Props/app.xml");
    let at = traversal.indexOf(name);
    while (at >= 0) {
      bad.copy(traversal, at);
      at = traversal.indexOf(name, at + name.length);
    }
    expect(() => readDocxZip(traversal)).toThrow("unsafe");
    const corrupted = Buffer.from(source("GDPR_NOTICE"));
    corrupted[40] = corrupted[40] ^ 0xff;
    expect(() => readDocxZip(corrupted)).toThrow();
  });

  it.each([
    [
      "word/document.xml",
      (xml: string) => xml.replace("<w:body>", "<w:body><w:ins/>"),
    ],
    [
      "word/document.xml",
      (xml: string) =>
        xml.replace(
          "<w:body>",
          '<w:body><w:p><w:fldSimple w:instr="DDE AUTO"/></w:p>',
        ),
    ],
    [
      "word/document.xml",
      (xml: string) => xml.replace("<w:body>", "<w:body><w:txbxContent/>"),
    ],
    [
      "word/document.xml",
      (xml: string) => xml.replace("<w:body>", "<w:body><w:commentReference/>"),
    ],
    [
      "word/document.xml",
      (xml: string) =>
        xml.replace("<w:body>", '<w:body><w:p invalid="${secret}"/>'),
    ],
    [
      "word/_rels/document.xml.rels",
      (xml: string) =>
        xml.replace(
          'Target="styles.xml"',
          'Target="https://attacker/file" TargetMode="External"',
        ),
    ],
    [
      "[Content_Types].xml",
      (xml: string) =>
        xml.replace(
          "wordprocessingml.document.main+xml",
          "wordprocessingml.template.main+xml",
        ),
    ],
    [
      "word/styles.xml",
      (xml: string) =>
        xml.replace("</w:styles>", "<w:style>${secret}</w:style></w:styles>"),
    ],
    [
      "word/document.xml",
      (xml: string) =>
        xml.replace(
          "<w:body>",
          "<w:body><w:p><w:t>&undefinedEntity;</w:t></w:p>",
        ),
    ],
  ] as const)(
    "rejects unsupported/executable or hidden dynamic content in %s",
    (part, change) => {
      expect(() =>
        validateDocxTemplate(
          changePart(source("GDPR_NOTICE"), part, change),
          "GDPR_NOTICE",
        ),
      ).toThrow();
    },
  );

  it("rejects doctypes and unbounded entity declarations", () => {
    const input = changePart(
      source("GDPR_NOTICE"),
      "word/document.xml",
      (xml) =>
        xml.replace(
          "<w:document",
          '<!DOCTYPE x [<!ENTITY x "boom">]><w:document',
        ),
    );
    expect(() => validateDocxTemplate(input, "GDPR_NOTICE")).toThrow("DTD");
  });

  it("rejects malformed processing instructions, oversized XML and excessive nesting before rendering", () => {
    for (const instruction of [
      '<?xml-stylesheet href="https://attacker"?>',
      "<?evil " + "x".repeat(200_000),
      '<?xml version="1.0" evil="x"?>',
    ]) {
      expect(() => parseXml(instruction + "<root/>")).toThrow();
    }
    expect(() =>
      parseXml("<root>" + "x".repeat(2 * 1024 * 1024) + "</root>"),
    ).toThrow("XML size limit");
    expect(() =>
      parseXml("<root>".repeat(150) + "</root>".repeat(150)),
    ).toThrow();
  });

  it("uses well-formed XML serialization for user text and image descriptions", () => {
    const values = previewValues("GDPR_NOTICE", "25");
    expect(() =>
      renderDocxTemplate(source("GDPR_NOTICE"), "GDPR_NOTICE", {
        ...values,
        renterFullName: "invalid surrogate \uD800",
      }),
    ).toThrow("non-serializable");
    const parsed = parseXml("<root/>");
    parsed.documentElement!.appendChild(
      parsed.createProcessingInstruction("evil", "bad?>data"),
    );
    expect(() => xmlBuffer(parsed)).toThrow("non-serializable");
  });

  it("binds validation to exact source bytes, type, registry, renderer and fragment content", () => {
    const input = source("GDPR_NOTICE");
    expect(validateDocxTemplate(input, "GDPR_NOTICE").manifestHash).toBe(
      templateManifestHash(input, "GDPR_NOTICE"),
    );
    expect(templateManifestHash(input, "GDPR_NOTICE")).not.toBe(
      templateManifestHash(input, "RENTAL_AGREEMENT"),
    );
    expect(templateManifestHash(input, "GDPR_NOTICE")).not.toBe(
      templateManifestHash(
        changePart(input, "word/document.xml", (xml) =>
          xml.replace("ANEXA NR. 2", "ANEXA NR. 2 "),
        ),
        "GDPR_NOTICE",
      ),
    );
  });

  it("uses one approved speed fragment and rejects unknown or contradictory configurations", () => {
    expect(buildSpeedDeclaration("LIMITED", 45, 25)).toContain("25 km/h");
    expect(buildSpeedDeclaration("LIMITED", 50, 45)).toContain("45 km/h");
    expect(buildSpeedDeclaration("NO_LIMITER", 90, null)).toContain(
      "Nu declar verificarea unui limitator inexistent",
    );
    for (const args of [
      ["UNKNOWN", 45, null],
      ["LIMITED", 25, 45],
      ["LIMITED", Infinity, 25],
      ["NO_LIMITER", 0, null],
      ["NO_LIMITER", 90, 25],
    ] as const)
      expect(() => buildSpeedDeclaration(args[0], args[1], args[2])).toThrow();
  });

  it("fails closed when the configured converter is missing and removes its temporary workspace", async () => {
    await expect(convertDocxToPdf(Buffer.from("input"), "")).rejects.toThrow(
      "configured",
    );
    await expect(
      convertDocxToPdf(Buffer.from("input"), "/nonexistent/approved-soffice"),
    ).rejects.toThrow("failed");
  });
});
