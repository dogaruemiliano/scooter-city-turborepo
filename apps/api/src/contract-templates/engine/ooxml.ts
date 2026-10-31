import {
  DOMParser,
  XMLSerializer,
  type Document,
  type Element,
  type Node,
} from "@xmldom/xmldom";
import { posix } from "node:path";
import { TemplateEngineError } from "./zip";
import { imageDimensions } from "./image-slots";

export const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export const R =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const REL =
  "http://schemas.openxmlformats.org/package/2006/relationships";
export const CONTENT =
  "http://schemas.openxmlformats.org/package/2006/content-types";

/** DTD/entities and processing instructions cannot request external resources or expand content. */
export function parseXml(bytes: Buffer | string): Document {
  const xml =
    typeof bytes === "string"
      ? bytes
      : new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (Buffer.byteLength(xml) > 2 * 1024 * 1024) {
    throw new TemplateEngineError(
      "An OOXML part exceeds the supported XML size limit.",
    );
  }
  // An XML declaration is document metadata, not a processing instruction. xmldom retains
  // it as a PI node, which strict serialization correctly rejects; parse the body without it.
  const body = xml.replace(
    /^\uFEFF?<\?xml\s+version\s*=\s*(['"])1\.0\1(?:\s+encoding\s*=\s*(['"])UTF-8\2)?(?:\s+standalone\s*=\s*(['"])(?:yes|no)\3)?\s*\?>/i,
    "",
  );
  if (/<!DOCTYPE|<!ENTITY|<\?/i.test(body))
    throw new TemplateEngineError(
      "DTD, entities and processing instructions are unsupported.",
    );
  try {
    const document = new DOMParser({
      onError: () => {
        throw new Error("Invalid XML");
      },
    }).parseFromString(body, "application/xml");
    const pending: Array<{ node: Node; depth: number }> = [
      { node: document, depth: 0 },
    ];
    let count = 0;
    while (pending.length) {
      const { node, depth } = pending.pop()!;
      if (++count > 50_000 || depth > 128)
        throw new Error("XML complexity limit");
      for (const child of Array.from(node.childNodes))
        pending.push({ node: child, depth: depth + 1 });
    }
    return document;
  } catch {
    throw new TemplateEngineError("Malformed OOXML part.");
  }
}

export function xmlBuffer(node: Node): Buffer {
  try {
    return Buffer.from(
      new XMLSerializer().serializeToString(node, { requireWellFormed: true }),
    );
  } catch {
    throw new TemplateEngineError(
      "The document contains non-serializable XML data.",
    );
  }
}

export function elements(
  node: Document | Element,
  namespace: string,
  name: string,
): Element[] {
  return Array.from(node.getElementsByTagNameNS(namespace, name));
}

export function wordText(node: Document | Element): string {
  return elements(node, W, "t")
    .map((text) => text.textContent ?? "")
    .join("");
}

export interface LogicalText {
  readonly text: string;
  readonly nodes: readonly { element: Element; start: number; end: number }[];
}

/** Tokens may cross runs, never paragraphs, tabs, line breaks or nested text boxes. */
export function logicalTexts(paragraph: Element): LogicalText[] {
  const result: LogicalText[] = [];
  let text = "";
  let nodes: Array<{ element: Element; start: number; end: number }> = [];
  const flush = () => {
    if (nodes.length) result.push({ text, nodes });
    text = "";
    nodes = [];
  };
  const visit = (node: Node) => {
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (
      element !== paragraph &&
      element.namespaceURI === W &&
      element.localName === "p"
    ) {
      flush();
      return;
    }
    if (
      element.namespaceURI === W &&
      ["br", "tab", "cr", "drawing", "fldChar"].includes(
        element.localName ?? "",
      )
    ) {
      flush();
      return;
    }
    if (element.namespaceURI === W && element.localName === "t") {
      const content = element.textContent ?? "";
      nodes.push({
        element,
        start: text.length,
        end: text.length + content.length,
      });
      text += content;
      return;
    }
    for (const child of Array.from(node.childNodes)) visit(child);
  };
  visit(paragraph);
  flush();
  return result;
}

export function isSupportedTextPart(name: string): boolean {
  return /^word\/(document|header[0-9]+|footer[0-9]+)\.xml$/.test(name);
}

/** Reject executable/hidden dynamic features before a renderer is allowed to open the package. */
export function validateOoxmlParts(
  entries: ReadonlyMap<string, Buffer>,
): Map<string, Document> {
  const documents = new Map<string, Document>();
  for (const [name, bytes] of entries) {
    if (/vbaProject|embeddings\/|activeX\/|\.bin$|\.exe$/i.test(name))
      throw new TemplateEngineError(
        "Macros, OLE and executable objects are unsupported.",
      );
    if (!/\.(xml|rels)$/.test(name)) {
      if (!/^word\/media\/[A-Za-z0-9_.-]+\.(png|jpe?g)$/i.test(name))
        throw new TemplateEngineError(`Unsupported binary part: ${name}`);
      imageDimensions({
        kind: "image",
        bytes,
        mimeType: /\.png$/i.test(name) ? "image/png" : "image/jpeg",
        alt: "Static template image",
      });
      continue;
    }
    const document = parseXml(bytes);
    documents.set(name, document);
    for (const element of elements(document, "*", "*")) {
      for (const attr of Array.from(element.attributes)) {
        if (attr.value.includes("${"))
          throw new TemplateEngineError(
            "Placeholders in OOXML attributes are unsupported.",
          );
      }
      for (const child of Array.from(element.childNodes)) {
        if (
          (child.nodeType === 3 || child.nodeType === 8) &&
          (child.nodeValue ?? "").includes("${") &&
          (!isSupportedTextPart(name) ||
            element.namespaceURI !== W ||
            element.localName !== "t" ||
            child.nodeType === 8)
        ) {
          throw new TemplateEngineError(
            `Dynamic content outside supported Word text: ${name}`,
          );
        }
      }
    }
    if (name === "[Content_Types].xml") {
      const main = elements(document, CONTENT, "Override").find(
        (part) => part.getAttribute("PartName") === "/word/document.xml",
      );
      if (
        main?.getAttribute("ContentType") !==
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
      )
        throw new TemplateEngineError("Only macro-free DOCX is supported.");
    }
    if (name.endsWith(".rels")) {
      const base =
        name === "_rels/.rels"
          ? ""
          : posix.dirname(name).replace(/\/_rels$/, "");
      for (const relationship of elements(document, REL, "Relationship")) {
        const target = relationship.getAttribute("Target") ?? "";
        const type = relationship.getAttribute("Type") ?? "";
        const resolved = posix.normalize(posix.join(base, target));
        if (
          relationship.getAttribute("TargetMode") === "External" ||
          /[:\\]/.test(target) ||
          target.includes("\0") ||
          target.startsWith("/") ||
          resolved.startsWith("../") ||
          !entries.has(resolved) ||
          /\/(aFChunk|oleObject|attachedTemplate|package|vbaProject)$/.test(
            type,
          )
        ) {
          throw new TemplateEngineError(
            `Unsupported or missing OOXML relationship in ${name}.`,
          );
        }
      }
    }
    if (!isSupportedTextPart(name)) {
      if ((document.documentElement!.textContent ?? "").includes("${"))
        throw new TemplateEngineError(
          `Dynamic content in unsupported part: ${name}`,
        );
      continue;
    }
    for (const forbidden of [
      "ins",
      "del",
      "moveFrom",
      "moveTo",
      "altChunk",
      "subDoc",
      "txbxContent",
      "commentReference",
      "commentRangeStart",
      "fldSimple",
      "instrText",
      "object",
      "pict",
      "dataBinding",
      "vanish",
      "webHidden",
    ]) {
      if (elements(document, W, forbidden).length)
        throw new TemplateEngineError(
          `Unsupported OOXML feature: ${forbidden}`,
        );
    }
    for (const text of elements(document, W, "t")) {
      let parent = text.parentNode;
      let paragraph = false;
      while (parent) {
        if (
          parent.nodeType === 1 &&
          (parent as Element).namespaceURI === W &&
          (parent as Element).localName === "p"
        ) {
          paragraph = true;
          break;
        }
        parent = parent.parentNode;
      }
      if (!paragraph && (text.textContent ?? "").includes("${"))
        throw new TemplateEngineError(
          "Dynamic text outside supported paragraph.",
        );
    }
  }
  const rootRels = documents.get("_rels/.rels");
  if (
    !rootRels ||
    !elements(rootRels, REL, "Relationship").some(
      (rel) =>
        rel.getAttribute("Type") === `${R}/officeDocument` &&
        rel.getAttribute("Target") === "word/document.xml",
    )
  ) {
    throw new TemplateEngineError("Invalid OOXML main document relationship.");
  }
  return documents;
}
