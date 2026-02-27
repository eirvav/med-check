import { extractArticleFromDocument } from "./extraction";
import type { ExtractedArticle } from "./types";

declare global {
  interface Window {
    __MEDCHECK_CONTENT_SCRIPT_INSTALLED__?: boolean;
    __MEDCHECK_EXTRACT_ARTICLE__?: () =>
      | { ok: true; data: ExtractedArticle }
      | { ok: false; error: { code: string; message: string } };
  }
}

const MESSAGE_TYPE = "MEDCHECK_EXTRACT";

function buildExtractionResponse():
  | { ok: true; data: ExtractedArticle }
  | { ok: false; error: { code: string; message: string } } {
  const extracted = extractArticleFromDocument(document);
  if (!extracted) {
    return { ok: false, error: { code: "NO_ARTICLE_CONTENT", message: "Could not extract article content." } };
  }

  return { ok: true, data: extracted };
}

function handleMessage(
  message: unknown,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean {
  if (!message || typeof message !== "object" || (message as { type?: string }).type !== MESSAGE_TYPE) {
    return false;
  }

  sendResponse(buildExtractionResponse());
  return false;
}

if (!window.__MEDCHECK_CONTENT_SCRIPT_INSTALLED__) {
  window.__MEDCHECK_EXTRACT_ARTICLE__ = buildExtractionResponse;
  chrome.runtime.onMessage.addListener(handleMessage);
  window.__MEDCHECK_CONTENT_SCRIPT_INSTALLED__ = true;
}
