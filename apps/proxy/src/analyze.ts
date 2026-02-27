import { domainFromUrl, isAllowedDomain } from "./sourcePolicy.js";
import type { AnalysisSettings, ClaimResult, ModelOutput, Verdict } from "./types.js";

const DEFAULT_CONFIDENCE = 0.5;

export function normalizeVerdict(verdict: string): Verdict {
  const normalized = verdict.trim().toLowerCase();
  if (normalized.includes("contradict") || normalized.includes("inaccurate") || normalized.includes("false")) {
    return "Contradicted";
  }
  if (normalized.includes("support") || normalized.includes("accurate") || normalized.includes("true")) {
    return "Supported";
  }
  return "Uncertain";
}

function clampConfidence(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_CONFIDENCE;
  }

  return Math.min(1, Math.max(0, value));
}

export function applyVerdictGating(modelOutput: ModelOutput, settings: AnalysisSettings): ClaimResult[] {
  return modelOutput.claims.slice(0, settings.claimLimit).map((claim) => {
    const citations = claim.citations.map((citation) => {
      const domain = domainFromUrl(citation.url);

      if (!domain) {
        return {
          url: citation.url,
          domain: "invalid-url",
          title: citation.title,
          accepted: false,
          reasonIfRejected: "invalid_url"
        };
      }

      if (settings.strictWhitelist && !isAllowedDomain(domain, settings.allowedDomains)) {
        return {
          url: citation.url,
          domain,
          title: citation.title,
          accepted: false,
          reasonIfRejected: "domain_not_whitelisted"
        };
      }

      return {
        url: citation.url,
        domain,
        title: citation.title,
        accepted: true
      };
    });

    const acceptedCitations = citations.filter((citation) => citation.accepted);
    const primaryCitationCount = acceptedCitations.filter((citation) =>
      isAllowedDomain(citation.domain, settings.primaryDomains)
    ).length;

    let verdict = normalizeVerdict(claim.verdict);

    if (
      acceptedCitations.length < settings.minCitations ||
      (settings.requirePrimarySource && primaryCitationCount < 1)
    ) {
      verdict = "Uncertain";
    }

    return {
      claim: claim.claim,
      verdict,
      confidence: clampConfidence(claim.confidence),
      rationale: claim.rationale,
      citations
    };
  });
}

export function summarizeClaims(claims: ClaimResult[]): {
  supported: number;
  contradicted: number;
  uncertain: number;
  overall: "Likely Reliable" | "Mixed Evidence" | "Needs Caution";
} {
  const supported = claims.filter((claim) => claim.verdict === "Supported").length;
  const contradicted = claims.filter((claim) => claim.verdict === "Contradicted").length;
  const uncertain = claims.filter((claim) => claim.verdict === "Uncertain").length;

  let overall: "Likely Reliable" | "Mixed Evidence" | "Needs Caution" = "Likely Reliable";
  if (contradicted >= 2 || contradicted > supported) {
    overall = "Needs Caution";
  } else if (uncertain >= supported) {
    overall = "Mixed Evidence";
  }

  return {
    supported,
    contradicted,
    uncertain,
    overall
  };
}
