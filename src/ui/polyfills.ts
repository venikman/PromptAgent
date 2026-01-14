import { DOMParser as LinkedomDOMParser, parseHTML } from "npm:linkedom@0.18.5";

if (typeof globalThis.DOMParser === "undefined") {
  const DomParser = LinkedomDOMParser as unknown as typeof DOMParser;
  globalThis.DOMParser = DomParser;
}

if (typeof globalThis.document === "undefined") {
  const { document } = parseHTML("<html><body></body></html>");
  globalThis.document = document as unknown as Document;
}
