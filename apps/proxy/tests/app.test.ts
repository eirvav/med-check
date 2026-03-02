import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { ParsingFailedError } from "../src/errors.js";
import type { ModelOutput, PerplexityClient } from "../src/types.js";

const basePayload = {
  url: "https://example.com/medical-article",
  title: "Medical Article",
  language: "en",
  articleText: "A".repeat(500),
  analysisMode: "article",
  settings: {
    claimLimit: 8,
    minCitations: 2,
    requirePrimarySource: true,
    strictWhitelist: true,
    allowedDomains: ["ncbi.nlm.nih.gov", "who.int"],
    primaryDomains: ["ncbi.nlm.nih.gov"],
    proxyBaseUrl: "http://127.0.0.1:8787"
  }
};

describe("POST /api/analyze", () => {
  it("returns analyzed claims for valid request", async () => {
    const stubClient: PerplexityClient = async (): Promise<ModelOutput> => ({
      claims: [
        {
          claim: "Claim",
          verdict: "Supported",
          confidence: 0.8,
          rationale: "Rationale",
          citations: [
            { url: "https://pubmed.ncbi.nlm.nih.gov/12345/", title: "PubMed" },
            { url: "https://www.who.int/news/item", title: "WHO" }
          ]
        }
      ]
    });

    const app = createApp(stubClient);
    const response = await request(app)
      .post("/api/analyze")
      .set("Origin", "chrome-extension://abc123")
      .send(basePayload);

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("chrome-extension://abc123");
    expect(response.body.claims).toHaveLength(1);
    expect(response.body.claims[0].verdict).toBe("Supported");
  });

  it("returns parsing error for malformed model output", async () => {
    const failingClient: PerplexityClient = async () => {
      throw new ParsingFailedError("invalid json");
    };

    const app = createApp(failingClient);
    const response = await request(app).post("/api/analyze").send(basePayload);

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("PARSING_FAILED");
  });

  it("rejects non-extension browser origins", async () => {
    const stubClient: PerplexityClient = async (): Promise<ModelOutput> => ({ claims: [] });
    const app = createApp(stubClient);

    const response = await request(app)
      .options("/api/analyze")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN_ORIGIN");
  });

  it("allows short selection-mode text", async () => {
    const stubClient: PerplexityClient = async (): Promise<ModelOutput> => ({ claims: [] });
    const app = createApp(stubClient);

    const response = await request(app).post("/api/analyze").send({
      ...basePayload,
      analysisMode: "selection",
      articleText: "Short sentence for selection mode."
    });

    expect(response.status).toBe(200);
  });
});
