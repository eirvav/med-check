import { DISCLAIMER_TEXT, EXTRACTION_TIMEOUT_MS, PROXY_TIMEOUT_MS } from "./constants";
import { isSupportedLanguage } from "./language";
import { getSettings } from "./settings";
import type { AnalyzeRequest, AnalyzeResponse, AnalyzeResult, ExtractedArticle } from "./types";

const ANALYZE_MESSAGE = "MEDCHECK_ANALYZE_ACTIVE_TAB";
const SELECTION_STATUS_MESSAGE = "MEDCHECK_GET_SELECTION_STATUS";
type AnalysisScope = "article" | "selection";

interface SelectionStatus {
  hasSelection: boolean;
  textPreview: string;
  charCount: number;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callExtractor(tabId: number): Promise<
  | { ok: true; data: ExtractedArticle }
  | { ok: false; error?: { code?: string; message?: string } }
  | undefined
> {
  const [executionResult] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const extractor = (window as Window & { __MEDCHECK_EXTRACT_ARTICLE__?: () => unknown })
        .__MEDCHECK_EXTRACT_ARTICLE__;

      if (typeof extractor !== "function") {
        return {
          ok: false,
          error: {
            code: "EXTRACTOR_NOT_READY",
            message: "Extractor not ready."
          }
        };
      }

      return extractor();
    }
  });

  return executionResult?.result as
    | { ok: true; data: ExtractedArticle }
    | { ok: false; error?: { code?: string; message?: string } }
    | undefined;
}

async function extractFromTab(tabId: number): Promise<ExtractedArticle> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });

    const response = await withTimeout(
      callExtractor(tabId),
      EXTRACTION_TIMEOUT_MS,
      "Content extraction timed out"
    );

    if (response?.ok === true && response.data) {
      return response.data;
    }

    if (response?.error?.code !== "EXTRACTOR_NOT_READY" || attempt > 0) {
      throw new Error(response?.error?.message || "Could not extract article content.");
    }

    await sleep(120);
  }

  throw new Error("Could not extract article content.");
}

async function getSelectionFromTab(tabId: number): Promise<ExtractedArticle> {
  const [executionResult] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const selectedText = (window.getSelection()?.toString() || "").replace(/\s+/g, " ").trim();
      return {
        selectedText,
        url: window.location.href,
        title: document.title || "Selected text",
        language: document.documentElement?.lang || null
      };
    }
  });

  const payload = executionResult?.result as
    | { selectedText?: string; url?: string; title?: string; language?: string | null }
    | undefined;

  const selectedText = payload?.selectedText?.trim() || "";
  if (!selectedText) {
    throw new Error("NO_SELECTION: Highlight a sentence in the page, then reopen MedCheck.");
  }

  return {
    url: payload?.url || "",
    title: payload?.title || "Selected text",
    language: payload?.language || null,
    articleText: selectedText,
    trimmedText: selectedText.slice(0, 2_000),
    method: "selection"
  };
}

async function getSelectionStatus(tabId: number): Promise<SelectionStatus> {
  const [executionResult] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const selectedText = (window.getSelection()?.toString() || "").replace(/\s+/g, " ").trim();
      return {
        hasSelection: selectedText.length > 0,
        textPreview: selectedText.slice(0, 140),
        charCount: selectedText.length
      };
    }
  });

  return (
    (executionResult?.result as SelectionStatus | undefined) ?? {
      hasSelection: false,
      textPreview: "",
      charCount: 0
    }
  );
}

function isTransientProxyError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("timed out") ||
    error.message.includes("fetch failed") ||
    error.message.includes("UPSTREAM") ||
    error.message.toLowerCase().includes("abort")
  );
}

async function fetchProxy(requestBody: AnalyzeRequest, proxyBaseUrl: string): Promise<AnalyzeResponse> {
  const endpoint = `${proxyBaseUrl.replace(/\/$/, "")}/api/analyze`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { code?: string; message?: string } }
          | null;

        const code = payload?.error?.code || `HTTP_${response.status}`;
        const message = payload?.error?.message || "Proxy request failed.";

        if (response.status >= 500 && attempt === 0) {
          lastError = new Error(`${code}:${message}`);
          continue;
        }

        throw new Error(`${code}:${message}`);
      }

      return (await response.json()) as AnalyzeResponse;
    } catch (error) {
      lastError = error;
      if (attempt === 0 && isTransientProxyError(error)) {
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Proxy request failed.");
}

function normalizeError(error: unknown): AnalyzeResult {
  if (error instanceof Error) {
    if (error.message.includes("NO_SELECTION")) {
      return {
        ok: false,
        error: {
          code: "NO_SELECTION",
          message: "Highlight a sentence in the page, then reopen MedCheck."
        }
      };
    }

    if (error.message.includes("UNSUPPORTED_LANGUAGE")) {
      return {
        ok: false,
        error: {
          code: "UNSUPPORTED_LANGUAGE",
          message: "Unsupported language (v1 supports English only)."
        }
      };
    }

    if (error.message.includes("NO_ARTICLE_CONTENT")) {
      return {
        ok: false,
        error: {
          code: "NO_ARTICLE_CONTENT",
          message: "Could not extract a readable article from this page."
        }
      };
    }

    if (error.message.includes("PARSING_FAILED")) {
      return {
        ok: false,
        error: {
          code: "PARSING_FAILED",
          message: "Verification service returned an unexpected format. Try again."
        }
      };
    }

    if (error.message.includes("UPSTREAM_UNAVAILABLE") || error.message.includes("HTTP_5")) {
      return {
        ok: false,
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "Verification service is temporarily unavailable."
        }
      };
    }

    if (error.message.includes("timed out") || error.message.includes("abort")) {
      return {
        ok: false,
        error: {
          code: "TIMEOUT",
          message: "The verification request timed out."
        }
      };
    }

    return {
      ok: false,
      error: {
        code: "ANALYSIS_FAILED",
        message: error.message
      }
    };
  }

  return {
    ok: false,
    error: {
      code: "ANALYSIS_FAILED",
      message: "Unknown error"
    }
  };
}

async function analyzeActiveTabByScope(scope: AnalysisScope): Promise<AnalyzeResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_PAGE",
        message: "Open a web article (http/https) before running MedCheck."
      }
    };
  }

  try {
    const extractionStartedAt = performance.now();
    const extraction = scope === "selection" ? await getSelectionFromTab(tab.id) : await extractFromTab(tab.id);
    const extractionDurationMs = Math.round(performance.now() - extractionStartedAt);

    if (!isSupportedLanguage(extraction.language, extraction.articleText)) {
      return {
        ok: false,
        error: {
          code: "UNSUPPORTED_LANGUAGE",
          message: "Unsupported language (v1 supports English only)."
        }
      };
    }

    const settings = await getSettings();
    const requestSettings =
      scope === "selection"
        ? {
            ...settings,
            claimLimit: 1
          }
        : settings;

    const proxyResponse = await fetchProxy(
      {
        url: extraction.url,
        title: scope === "selection" ? `${extraction.title} (selected text)` : extraction.title,
        language: extraction.language,
        articleText: extraction.trimmedText,
        settings: requestSettings
      },
      settings.proxyBaseUrl
    );

    return {
      ok: true,
      data: {
        ...proxyResponse,
        disclaimer: DISCLAIMER_TEXT,
        timingsMs: {
          ...proxyResponse.timingsMs,
          extraction: extractionDurationMs
        }
      }
    };
  } catch (error) {
    return normalizeError(error);
  }
}

async function getSelectionStatusForActiveTab(): Promise<
  | { ok: true; data: SelectionStatus }
  | { ok: false; error: { code: string; message: string } }
> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_PAGE",
        message: "Open a web article (http/https) before using selected-text mode."
      }
    };
  }

  try {
    return {
      ok: true,
      data: await getSelectionStatus(tab.id)
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "SELECTION_STATUS_FAILED",
        message: error instanceof Error ? error.message : "Could not inspect selected text."
      }
    };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse): boolean => {
  if (!message || typeof message !== "object") {
    return false;
  }

  const type = (message as { type?: string }).type;

  if (type === ANALYZE_MESSAGE) {
    const scope = (message as { scope?: string }).scope === "selection" ? "selection" : "article";
    analyzeActiveTabByScope(scope)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse(normalizeError(error)));
    return true;
  }

  if (type === SELECTION_STATUS_MESSAGE) {
    getSelectionStatusForActiveTab()
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: {
            code: "SELECTION_STATUS_FAILED",
            message: error instanceof Error ? error.message : "Could not inspect selected text."
          }
        })
      );
    return true;
  }

  return false;
});
