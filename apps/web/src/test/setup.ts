import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom has no PDF worker/canvas renderer. Dedicated PDF preview tests provide
// a controlled renderer; browser verification exercises real PDF.js documents.
vi.mock("@repo/ui/lib/pdf", () => ({
  loadPdf: vi
    .fn()
    .mockRejectedValue(new Error("PDF renderer unavailable in jsdom")),
}));

// jsdom ships no matchMedia, which responsive hooks such as `useIsMobile` call
// on mount. Default to the desktop branch; tests that need the mobile surface
// stub it themselves.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// jsdom implements no layout, so it has no scrollIntoView. The calendar's
// month/year wheel calls it to centre the selected option on mount.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// Shared previews measure their viewport and filename to fit and scroll them.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

afterEach(() => {
  cleanup();
});
