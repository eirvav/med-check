import crypto from "node:crypto";

import express from "express";

import { applyVerdictGating, summarizeClaims } from "./analyze.js";
import { ParsingFailedError, UpstreamUnavailableError } from "./errors.js";
import { fetchClaimsFromPerplexity } from "./perplexity.js";
import { analyzeRequestSchema } from "./schema.js";
import type { AnalyzeResponse, PerplexityClient } from "./types.js";

const DISCLAIMER_TEXT =
  "MedCheck is for informational verification only and is not medical advice, diagnosis, or treatment.";
const ANALYSIS_CACHE_TTL_MS = 10 * 60 * 1000;

interface RequestWithId extends express.Request {
  requestId: string;
  startedAt: number;
}

function setCorsHeaders(req: express.Request, res: express.Response): boolean {
  const origin = req.headers.origin;

  if (!origin) {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return true;
  }

  if (origin.startsWith("chrome-extension://")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return true;
  }

  return false;
}

function buildCacheKey(payload: {
  url: string;
  title: string;
  language: string | null;
  articleText: string;
  analysisMode: "article" | "selection";
  settings: unknown;
}): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        model: process.env.PERPLEXITY_MODEL || "sonar-pro",
        payload
      })
    )
    .digest("hex");
}

function getCachedResponse(
  cacheKey: string,
  analysisCache: Map<string, { cachedAt: number; response: AnalyzeResponse }>
): AnalyzeResponse | null {
  const cached = analysisCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.cachedAt > ANALYSIS_CACHE_TTL_MS) {
    analysisCache.delete(cacheKey);
    return null;
  }

  return cached.response;
}

export function createApp(perplexityClient: PerplexityClient = fetchClaimsFromPerplexity): express.Express {
  const app = express();
  const analysisCache = new Map<string, { cachedAt: number; response: AnalyzeResponse }>();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.use((req, res, next) => {
    const typedReq = req as RequestWithId;
    typedReq.requestId = crypto.randomUUID();
    typedReq.startedAt = Date.now();
    res.setHeader("x-request-id", typedReq.requestId);
    next();
  });

  app.use((req, res, next) => {
    if (!setCorsHeaders(req, res)) {
      res.status(403).json({
        error: {
          code: "FORBIDDEN_ORIGIN",
          message: "Origin not allowed."
        }
      });
      return;
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/analyze", async (req, res) => {
    const typedReq = req as RequestWithId;
    const requestId = typedReq.requestId;
    const requestStart = Date.now();

    const parsed = analyzeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      console.log(
        JSON.stringify({
          level: "error",
          requestId,
          code: "VALIDATION_FAILED",
          issues: parsed.error.issues.map((issue) => issue.path.join("."))
        })
      );
      res.status(400).json({
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid analysis request payload."
        }
      });
      return;
    }

    const payload = parsed.data;
    const language = payload.language?.trim().toLowerCase() ?? "";

    if (language && !language.startsWith("en")) {
      res.status(400).json({
        error: {
          code: "UNSUPPORTED_LANGUAGE",
          message: "Unsupported language (v1 supports English only)."
        }
      });
      return;
    }

    const minChars = payload.analysisMode === "selection" ? 20 : 250;
    if (payload.articleText.trim().length < minChars) {
      res.status(400).json({
        error: {
          code: "NO_ARTICLE_CONTENT",
          message:
            payload.analysisMode === "selection"
              ? "Selected text is too short to analyze. Select at least one complete sentence."
              : "Article content is too short to analyze."
        }
      });
      return;
    }

    try {
      const cacheKey = buildCacheKey(payload);
      const cachedResponse = getCachedResponse(cacheKey, analysisCache);
      if (cachedResponse) {
        console.log(
          JSON.stringify({
            level: "info",
            requestId,
            code: "CACHE_HIT",
            durationMs: Date.now() - requestStart
          })
        );
        res.json(cachedResponse);
        return;
      }

      const perplexityStartedAt = Date.now();
      const modelOutput = await perplexityClient({
        requestId,
        url: payload.url,
        title: payload.title,
        articleText: payload.articleText,
        claimLimit: payload.settings.claimLimit,
        allowedDomains: payload.settings.allowedDomains,
        primaryDomains: payload.settings.primaryDomains
      });
      const perplexityMs = Date.now() - perplexityStartedAt;

      const claims = applyVerdictGating(modelOutput, payload.settings);
      const pageSummary = summarizeClaims(claims);

      const response: AnalyzeResponse = {
        pageSummary,
        claims,
        disclaimer: DISCLAIMER_TEXT,
        timingsMs: {
          perplexity: perplexityMs,
          total: Date.now() - requestStart
        }
      };

      console.log(
        JSON.stringify({
          level: "info",
          requestId,
          code: "OK",
          durationMs: Date.now() - requestStart,
          claimCount: claims.length
        })
      );

      analysisCache.set(cacheKey, {
        cachedAt: Date.now(),
        response
      });

      res.json(response);
    } catch (error) {
      const durationMs = Date.now() - requestStart;

      if (error instanceof ParsingFailedError) {
        console.log(
          JSON.stringify({
            level: "error",
            requestId,
            code: error.code,
            durationMs
          })
        );
        res.status(502).json({
          error: {
            code: error.code,
            message: "Could not parse verification output from upstream model."
          }
        });
        return;
      }

      if (error instanceof UpstreamUnavailableError) {
        console.log(
          JSON.stringify({
            level: "error",
            requestId,
            code: error.code,
            durationMs
          })
        );
        res.status(502).json({
          error: {
            code: error.code,
            message: "Perplexity upstream unavailable."
          }
        });
        return;
      }

      console.log(
        JSON.stringify({
          level: "error",
          requestId,
          code: "INTERNAL_ERROR",
          durationMs
        })
      );

      res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Unknown internal error"
        }
      });
    }
  });

  return app;
}
