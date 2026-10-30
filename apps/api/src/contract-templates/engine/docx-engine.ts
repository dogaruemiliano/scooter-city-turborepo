import { imageDimensions, type TemplateImageValue } from "./image-slots";
export type { TemplateImageValue } from "./image-slots";
import { createHash } from "node:crypto";
import { tokens as theme } from "@repo/theme/email";
import { posix } from "node:path";
import type { Document, Element } from "@xmldom/xmldom";
import {
  BASE_DOCUMENT_ORDER,
  FIELD_REGISTRY,
  REGISTRY_VERSION,
  RENDERER_VERSION,
  REQUIRED_DOCUMENT_FIELDS,
  SPEED_DECLARATIONS,
  type ContractFieldKey,
  type ContractTemplateType,
} from "./registry";
import {
  CONTENT,
  REL,
  R,
  W,
  elements,
  isSupportedTextPart,
  logicalTexts,
  parseXml,
  validateOoxmlParts,
  wordText,
  xmlBuffer,
  type LogicalText,
} from "./ooxml";
import { readDocxZip, TemplateEngineError, writeDocxZip } from "./zip";

export {
  BASE_DOCUMENT_ORDER,
  REGISTRY_VERSION,
  RENDERER_VERSION,
  FIELD_REGISTRY,
};
export type { ContractFieldKey, ContractTemplateType };
export { TemplateEngineError } from "./zip";
export const PLACEHOLDER_PATTERN = /\$\{([A-Za-z][A-Za-z0-9]*)\}/g;
const fields = new Map<string, (typeof FIELD_REGISTRY)[number]>(
  FIELD_REGISTRY.map((field) => [field.key, field]),
);
export const sha256 = (input: Buffer | string): string =>
  createHash("sha256").update(input).digest("hex");

export interface PlaceholderOccurrence {
  readonly key: string;
  readonly part: string;
  readonly paragraph: number;
  readonly offset: number;
  readonly type: string | null;
  readonly source: string | null;
}
export interface TemplateValidationReport {
  readonly status: "PASSED" | "FAILED";
  readonly sourceSha256: string;
  readonly registryVersion: string;
  readonly rendererVersion: string;
  readonly manifestHash: string;
  readonly placeholders: readonly string[];
  readonly occurrences: readonly PlaceholderOccurrence[];
  readonly errors: readonly string[];
}

export function templateManifestHash(
  source: Buffer,
  type: ContractTemplateType,
): string {
  return sha256(
    JSON.stringify({
      source: sha256(source),
      type,
      registry: FIELD_REGISTRY,
      registryVersion: REGISTRY_VERSION,
      renderer: RENDERER_VERSION,
      imageSizing: {
        maxWidth: theme.spacing[48],
        maxHeight: theme.spacing[24],
      },
      fragments: SPEED_DECLARATIONS,
      required: REQUIRED_DOCUMENT_FIELDS[type],
    }),
  );
}

/** Validate every supported part and document-specific field subset, without requiring all 123 fields. */
export function validateDocxTemplate(
  source: Buffer,
  type: ContractTemplateType,
): TemplateValidationReport {
  const entries = readDocxZip(source);
  const documents = validateOoxmlParts(entries);
  const occurrences: PlaceholderOccurrence[] = [];
  const errors: string[] = [];
  for (const [part, document] of documents) {
    if (!isSupportedTextPart(part)) continue;
    for (const [paragraph, element] of elements(document, W, "p").entries()) {
      for (const logical of logicalTexts(element)) {
        const matches = [
          ...logical.text.matchAll(new RegExp(PLACEHOLDER_PATTERN.source, "g")),
        ];
        if (
          logical.text
            .replace(new RegExp(PLACEHOLDER_PATTERN.source, "g"), "")
            .includes("${")
        )
          errors.push(
            `Malformed placeholder in ${part}, paragraph ${paragraph}.`,
          );
        for (const match of matches) {
          const key = match[1];
          const field = fields.get(key);
          occurrences.push({
            key,
            part,
            paragraph,
            offset: match.index,
            type: field?.type ?? null,
            source: field?.source ?? null,
          });
          if (!field) errors.push(`Unknown placeholder: ${key}.`);
          else if (
            !(field.allowedTypes as readonly string[]).includes(type) &&
            type !== "PROMOTION_ADDENDUM"
          )
            errors.push(`Placeholder ${key} is not allowed in ${type}.`);
        }
      }
    }
  }
  const placeholders = [
    ...new Set(occurrences.map((occurrence) => occurrence.key)),
  ].sort();
  for (const key of REQUIRED_DOCUMENT_FIELDS[type]) {
    if (!placeholders.includes(key))
      errors.push(`Required placeholder missing: ${key}.`);
  }
  return {
    status: errors.length ? "FAILED" : "PASSED",
    sourceSha256: sha256(source),
    registryVersion: REGISTRY_VERSION,
    rendererVersion: RENDERER_VERSION,
    manifestHash: templateManifestHash(source, type),
    placeholders,
    occurrences,
    errors: [...new Set(errors)],
  };
}

export type TemplateValue =
  | string
  | TemplateImageValue
  | { readonly kind: "unsigned" }
  | { readonly kind: "not-applicable" };
export type TemplateValues = Readonly<
  Partial<Record<ContractFieldKey, TemplateValue>>
>;
export type RenderStage = "READY_FOR_SIGNING" | "FINAL_SIGNED";

function addImage(
  entries: Map<string, Buffer>,
  documents: Map<string, Document>,
  part: string,
  document: Document,
  image: TemplateImageValue,
): Element {
  const { width, height } = imageDimensions(image);
  const digest = sha256(image.bytes);
  const extension = image.mimeType === "image/png" ? "png" : "jpeg";
  const name = `media/slot-${digest}.${extension}`;
  entries.set(`word/${name}`, image.bytes);
  const relName = `${posix.dirname(part)}/_rels/${posix.basename(part)}.rels`;
  let relations = documents.get(relName);
  if (!relations) {
    relations = parseXml(`<Relationships xmlns="${REL}"/>`);
    documents.set(relName, relations);
  }
  const relationshipId = `rSlot${digest}`;
  if (
    !elements(relations, REL, "Relationship").some(
      (rel) => rel.getAttribute("Id") === relationshipId,
    )
  ) {
    const rel = relations.createElementNS(REL, "Relationship");
    rel.setAttribute("Id", relationshipId);
    rel.setAttribute("Type", `${R}/image`);
    rel.setAttribute("Target", name);
    relations.documentElement!.appendChild(rel);
  }
  const types = documents.get("[Content_Types].xml")!;
  if (
    !elements(types, CONTENT, "Default").some(
      (type) => type.getAttribute("Extension") === extension,
    )
  ) {
    const type = types.createElementNS(CONTENT, "Default");
    type.setAttribute("Extension", extension);
    type.setAttribute("ContentType", image.mimeType);
    types.documentElement!.appendChild(type);
  }
  // Shared sizing tokens also bound document image slots; 9525 EMU/px is a unit conversion.
  const scale = Math.min(
    1,
    theme.spacing[48] / width,
    theme.spacing[24] / height,
  );
  const cx = Math.round(width * scale * 9525);
  const cy = Math.round(height * scale * 9525);
  let drawingId = 1;
  for (const existing of documents.values()) {
    for (const element of elements(
      existing,
      "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
      "docPr",
    )) {
      const value = Number(element.getAttribute("id"));
      if (Number.isSafeInteger(value))
        drawingId = Math.max(drawingId, value + 1);
    }
  }
  if (drawingId > 0xffffffff)
    throw new TemplateEngineError("OOXML drawing identifier limit exceeded.");
  const drawing = parseXml(
    `<w:drawing xmlns:w="${W}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="${R}"><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${drawingId}" name="Image slot"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="Image slot"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`,
  ).documentElement!;
  elements(
    drawing,
    "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "docPr",
  )[0].setAttribute("descr", image.alt);
  return document.importNode(drawing, true);
}

function setText(element: Element, value: string): void {
  element.textContent = value;
  element.setAttribute("xml:space", "preserve");
}

function replaceSpan(
  logical: LogicalText,
  offset: number,
  length: number,
  value: string | Element,
): void {
  const start = logical.nodes.findIndex(
    (node) => offset >= node.start && offset < node.end,
  );
  const end = logical.nodes.findIndex(
    (node) => offset + length > node.start && offset + length <= node.end,
  );
  if (start < 0 || end < 0)
    throw new TemplateEngineError("Invalid placeholder text range.");
  const first = logical.nodes[start];
  const last = logical.nodes[end];
  const prefix = (first.element.textContent ?? "").slice(
    0,
    offset - first.start,
  );
  const suffix = (last.element.textContent ?? "").slice(
    offset + length - last.start,
  );
  for (let index = start + 1; index < end; index++)
    setText(logical.nodes[index].element, "");
  if (start !== end) setText(last.element, suffix);
  const parent = first.element.parentNode!;
  if (typeof value === "string" && !/[\r\n]/.test(value)) {
    setText(first.element, prefix + value + (start === end ? suffix : ""));
  } else {
    setText(first.element, prefix);
    const next = first.element.nextSibling;
    if (typeof value !== "string") parent.insertBefore(value, next);
    else
      for (const [index, line] of value.split(/\r?\n/).entries()) {
        if (index)
          parent.insertBefore(
            first.element.ownerDocument!.createElementNS(W, "w:br"),
            next,
          );
        const text = first.element.ownerDocument!.createElementNS(W, "w:t");
        setText(text, line);
        parent.insertBefore(text, next);
      }
    if (start === end && suffix) {
      const text = first.element.ownerDocument!.createElementNS(W, "w:t");
      setText(text, suffix);
      parent.insertBefore(text, next);
    }
  }
}

/** One pass per logical text group. Values cannot contain tokens, executable content, or arbitrary URLs for images. */
export function renderDocxTemplate(
  source: Buffer,
  type: ContractTemplateType,
  values: TemplateValues,
  stage: RenderStage = "READY_FOR_SIGNING",
): Buffer {
  const report = validateDocxTemplate(source, type);
  if (report.status !== "PASSED")
    throw new TemplateEngineError(report.errors.join(" "));
  const entries = readDocxZip(source);
  const documents = validateOoxmlParts(entries);
  for (const key of Object.keys(values))
    if (!fields.has(key))
      throw new TemplateEngineError(`Unknown data field: ${key}`);
  for (const key of report.placeholders) {
    const value = values[key as ContractFieldKey];
    const field = fields.get(key)!;
    if (typeof value === "string") {
      if (
        field.type !== "text" ||
        !value.trim() ||
        value.includes("${") ||
        Array.from(value).some(
          (character) =>
            character.charCodeAt(0) < 32 &&
            ![9, 10, 13].includes(character.charCodeAt(0)),
        )
      )
        throw new TemplateEngineError(`Invalid text value: ${key}`);
    } else if (!value || field.type === "text")
      throw new TemplateEngineError(`Missing value: ${key}`);
    else if (value.kind === "image") imageDimensions(value);
    else if (
      field.type !== "signature" ||
      !["unsigned", "not-applicable"].includes(value.kind) ||
      (stage === "FINAL_SIGNED" && value.kind === "unsigned") ||
      (value.kind === "not-applicable" && key !== "renterSignSpeed")
    )
      throw new TemplateEngineError(`Invalid signature slot: ${key}`);
  }
  for (const [part, document] of [...documents]) {
    if (!isSupportedTextPart(part)) continue;
    for (const paragraph of elements(document, W, "p")) {
      for (const logical of logicalTexts(paragraph)) {
        const matches = [
          ...logical.text.matchAll(new RegExp(PLACEHOLDER_PATTERN.source, "g")),
        ].reverse();
        for (const match of matches) {
          const value = values[match[1] as ContractFieldKey]!;
          const replacement =
            typeof value === "string"
              ? value
              : value.kind === "image"
                ? addImage(entries, documents, part, document, value)
                : value.kind === "unsigned"
                  ? "________________"
                  : "Nu se aplică";
          replaceSpan(logical, match.index, match[0].length, replacement);
        }
      }
    }
    if (wordText(document).includes("${"))
      throw new TemplateEngineError(
        "Unresolved placeholder after DOCX rendering.",
      );
  }
  for (const [part, document] of documents)
    entries.set(part, xmlBuffer(document));
  return writeDocxZip(entries);
}

/** Only the two tokens approved for this legal fragment can be resolved, once, as plain text. */
export function buildSpeedDeclaration(
  kind: "LIMITED" | "NO_LIMITER" | "UNKNOWN",
  constructiveSpeedKmh: number,
  limiterKmh: number | null,
): string {
  if (
    kind === "UNKNOWN" ||
    !Number.isFinite(constructiveSpeedKmh) ||
    constructiveSpeedKmh <= 0 ||
    (kind === "LIMITED" &&
      (limiterKmh === null ||
        !Number.isFinite(limiterKmh) ||
        limiterKmh <= 0 ||
        limiterKmh > constructiveSpeedKmh)) ||
    (kind === "NO_LIMITER" && limiterKmh !== null)
  )
    throw new TemplateEngineError(
      "A documented, consistent speed configuration is required.",
    );
  const fragment =
    kind === "LIMITED"
      ? SPEED_DECLARATIONS.limited
      : SPEED_DECLARATIONS.noLimiter;
  const values: Readonly<Record<string, string>> = {
    scooterMaxSpeedKmh: String(constructiveSpeedKmh),
    scooterLimiterValue:
      limiterKmh === null ? "Nu se aplică" : `${limiterKmh} km/h`,
  };
  return fragment.replace(
    new RegExp(PLACEHOLDER_PATTERN.source, "g"),
    (_token, key: string) => {
      if (!Object.hasOwn(values, key))
        throw new TemplateEngineError("Unsupported speed fragment token.");
      return values[key];
    },
  );
}

export interface SplitTemplateResult {
  readonly type: Exclude<ContractTemplateType, "PROMOTION_ADDENDUM">;
  readonly source: Buffer;
  readonly bodyTextSha256: string;
  readonly report: TemplateValidationReport;
}

/** Structural migration using exact legal annex headings, never fixed page numbers. Original bytes remain untouched. */
export function splitCombinedTemplate(
  source: Buffer,
): readonly SplitTemplateResult[] {
  const original = readDocxZip(source);
  const documents = validateOoxmlParts(original);
  const document = documents.get("word/document.xml")!;
  const body = elements(document, W, "body")[0];
  const children = Array.from(body.childNodes).filter(
    (child): child is Element => child.nodeType === 1,
  );
  const one = children
    .map(wordText)
    .reduce<
      number[]
    >((result, text, index) => (text.trim() === "ANEXA NR. 1" ? [...result, index] : result), []);
  const two = children
    .map(wordText)
    .reduce<
      number[]
    >((result, text, index) => (text.trim() === "ANEXA NR. 2" ? [...result, index] : result), []);
  const section = children.findLast(
    (child) => child.namespaceURI === W && child.localName === "sectPr",
  );
  if (
    one.length !== 1 ||
    two.length !== 1 ||
    one[0] >= two[0] ||
    !section ||
    children[0]?.textContent !== "CONTRACT DE LOCAȚIUNE BUN MOBIL"
  )
    throw new TemplateEngineError(
      "Combined template structural boundaries do not match the approved source.",
    );
  const ranges = {
    RENTAL_AGREEMENT: [0, one[0]],
    TECHNICAL_HANDOVER: [one[0], two[0]],
    GDPR_NOTICE: [two[0], children.length - 1],
  } as const;
  return BASE_DOCUMENT_ORDER.map((type) => {
    const copy = parseXml(xmlBuffer(document));
    const copyBody = elements(copy, W, "body")[0];
    while (copyBody.firstChild) copyBody.removeChild(copyBody.firstChild);
    const [start, end] = ranges[type];
    for (const child of children.slice(start, end))
      copyBody.appendChild(copy.importNode(child, true));
    // Boundary-only page breaks belong to the combined package, not the independent documents.
    const firstParagraph = Array.from(copyBody.childNodes).find(
      (node) => node.nodeType === 1 && (node as Element).localName === "p",
    ) as Element | undefined;
    if (firstParagraph)
      for (const pageBreak of elements(firstParagraph, W, "pageBreakBefore"))
        pageBreak.parentNode!.removeChild(pageBreak);
    const lastContent = copyBody.lastChild;
    if (
      lastContent?.nodeType === 1 &&
      !wordText(lastContent as Element).trim() &&
      elements(lastContent as Element, W, "pageBreakBefore").length
    )
      copyBody.removeChild(lastContent);
    copyBody.appendChild(copy.importNode(section, true));
    const expected = children.slice(start, end).map(wordText).join("");
    if (wordText(copyBody) !== expected)
      throw new TemplateEngineError("Split changed body text.");
    const entries = new Map(original);
    entries.set("word/document.xml", xmlBuffer(copy));
    const output = writeDocxZip(entries);
    return {
      type,
      source: output,
      bodyTextSha256: sha256(expected),
      report: validateDocxTemplate(output, type),
    };
  });
}
