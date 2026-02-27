import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { extractArticleFromDocument } from "../src/extraction";
import { isSupportedLanguage } from "../src/language";

describe("extractArticleFromDocument", () => {
  it("falls back to body text when Readability returns null", () => {
    const dom = new JSDOM(
      `<!doctype html><html lang="en"><head><title>Test</title></head><body><article>${"A".repeat(
        400
      )}</article></body></html>`,
      { url: "https://example.com/post" }
    );

    const extracted = extractArticleFromDocument(dom.window.document, () => ({ parse: () => null }));

    expect(extracted).not.toBeNull();
    expect(extracted?.method).toBe("fallback");
    expect(extracted?.url).toBe("https://example.com/post");
  });

  it("rejects clearly non-english language values", () => {
    expect(isSupportedLanguage("fr", "This is English text that should be ignored due to lang code")).toBe(false);
  });
});
