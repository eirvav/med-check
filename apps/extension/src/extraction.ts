import { Readability } from "@mozilla/readability";
import type { ExtractedArticle } from "./types";

const MAX_TEXT_CHARS = 20_000;
const MIN_TEXT_CHARS = 250;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export interface ReadabilityLike {
  parse: () => { textContent?: string | null; title?: string | null } | null;
}

export type ReadabilityFactory = (doc: Document) => ReadabilityLike;

export function extractArticleFromDocument(
  doc: Document,
  createReadability: ReadabilityFactory = (inputDoc) => new Readability(inputDoc)
): ExtractedArticle | null {
  const fallbackTitle = normalizeWhitespace(doc.title || "Untitled page");
  const language = doc.documentElement?.lang || null;

  let method: ExtractedArticle["method"] = "readability";
  let articleText = "";
  let title = fallbackTitle;

  try {
    const clonedDoc = doc.cloneNode(true) as Document;
    const parsed = createReadability(clonedDoc).parse();

    if (parsed?.textContent) {
      articleText = normalizeWhitespace(parsed.textContent);
      title = normalizeWhitespace(parsed.title || fallbackTitle);
    }
  } catch {
    method = "fallback";
  }

  if (!articleText) {
    method = "fallback";
    articleText = normalizeWhitespace(doc.body?.innerText || doc.body?.textContent || "");
  }

  if (articleText.length < MIN_TEXT_CHARS) {
    return null;
  }

  return {
    url: doc.location?.href || "",
    title,
    language,
    articleText,
    trimmedText: articleText.slice(0, MAX_TEXT_CHARS),
    method
  };
}
