import { describe, expect, it } from "vitest";

import { applyVerdictGating, summarizeClaims } from "../src/analyze.js";
import type { AnalysisSettings, ModelOutput } from "../src/types.js";

const settings: AnalysisSettings = {
  claimLimit: 8,
  minCitations: 2,
  requirePrimarySource: true,
  strictWhitelist: true,
  allowedDomains: ["ncbi.nlm.nih.gov", "who.int"],
  primaryDomains: ["ncbi.nlm.nih.gov"],
  proxyBaseUrl: "http://127.0.0.1:8787"
};

describe("applyVerdictGating", () => {
  it("forces uncertain when citation requirements are not met", () => {
    const modelOutput: ModelOutput = {
      claims: [
        {
          claim: "Vitamin C cures flu in one day",
          verdict: "Supported",
          confidence: 0.9,
          rationale: "Model says this is supported",
          citations: [{ url: "https://example.com/blog", title: "Blog" }]
        }
      ]
    };

    const [result] = applyVerdictGating(modelOutput, settings);
    expect(result.verdict).toBe("Uncertain");
    expect(result.citations[0].accepted).toBe(false);
    expect(result.uncertaintyReason).toContain("accepted citations");
    expect(result.evidenceSummary.acceptedCitations).toBe(0);
  });

  it("keeps contradicted when evidence gates pass", () => {
    const modelOutput: ModelOutput = {
      claims: [
        {
          claim: "Antibiotics treat viral colds",
          verdict: "Contradicted",
          confidence: 0.8,
          rationale: "Guidelines do not support this.",
          citations: [
            { url: "https://pubmed.ncbi.nlm.nih.gov/12345/", title: "PubMed" },
            { url: "https://www.who.int/news-room/fact-sheets", title: "WHO" }
          ]
        }
      ]
    };

    const [result] = applyVerdictGating(modelOutput, settings);
    expect(result.verdict).toBe("Contradicted");
    expect(result.uncertaintyReason).toBeUndefined();
    expect(result.evidenceSummary.acceptedCitations).toBe(2);
    expect(result.evidenceSummary.primaryCitations).toBe(1);
  });

  it("summarizes claim verdict counts", () => {
    const summary = summarizeClaims([
      {
        claim: "c1",
        verdict: "Supported",
        confidence: 0.7,
        rationale: "r",
        citations: [],
        evidenceSummary: {
          acceptedCitations: 2,
          totalCitations: 2,
          primaryCitations: 1,
          minCitationsRequired: 2,
          primarySourceRequired: true,
          distinctSourceDomains: 2
        }
      },
      {
        claim: "c2",
        verdict: "Uncertain",
        confidence: 0.4,
        rationale: "r",
        citations: [],
        uncertaintyReason: "insufficient evidence",
        evidenceSummary: {
          acceptedCitations: 0,
          totalCitations: 1,
          primaryCitations: 0,
          minCitationsRequired: 2,
          primarySourceRequired: true,
          distinctSourceDomains: 1
        }
      }
    ]);

    expect(summary.supported).toBe(1);
    expect(summary.uncertain).toBe(1);
    expect(summary.overall).toBe("Mixed Evidence");
  });

  it("supports high-confidence cross-source claims even if non-whitelisted", () => {
    const strictSettings: AnalysisSettings = {
      ...settings,
      minCitations: 1,
      strictWhitelist: true
    };

    const modelOutput: ModelOutput = {
      claims: [
        {
          claim: "Xenon is used for lung imaging studies",
          verdict: "Supported",
          confidence: 0.95,
          rationale: "Multiple external sources agree.",
          citations: [
            { url: "https://source-a.example/xenon-lung-study", title: "A" },
            { url: "https://source-b.example/xenon-approval", title: "B" }
          ]
        }
      ]
    };

    const [result] = applyVerdictGating(modelOutput, strictSettings);
    expect(result.verdict).toBe("Supported");
    expect(result.policyOverride).toContain("cross-source consensus");
    expect(result.evidenceSummary.acceptedCitations).toBe(0);
    expect(result.evidenceSummary.distinctSourceDomains).toBe(2);
  });
});
