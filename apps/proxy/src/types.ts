export type Verdict = "Supported" | "Contradicted" | "Uncertain";

export interface AnalysisSettings {
  claimLimit: number;
  minCitations: number;
  requirePrimarySource: boolean;
  strictWhitelist: boolean;
  allowedDomains: string[];
  primaryDomains: string[];
  proxyBaseUrl: string;
}

export interface AnalyzeRequest {
  url: string;
  title: string;
  language: string | null;
  articleText: string;
  settings: AnalysisSettings;
}

export interface Citation {
  url: string;
  domain: string;
  title?: string;
  accepted: boolean;
  reasonIfRejected?: string;
}

export interface ClaimResult {
  claim: string;
  verdict: Verdict;
  confidence: number;
  rationale: string;
  citations: Citation[];
}

export interface AnalyzeResponse {
  pageSummary: {
    supported: number;
    contradicted: number;
    uncertain: number;
    overall: "Likely Reliable" | "Mixed Evidence" | "Needs Caution";
  };
  claims: ClaimResult[];
  disclaimer: string;
  timingsMs: {
    perplexity?: number;
    total: number;
  };
}

export interface ModelCitation {
  url: string;
  title?: string;
}

export interface ModelClaim {
  claim: string;
  verdict: string;
  confidence?: number;
  rationale: string;
  citations: ModelCitation[];
}

export interface ModelOutput {
  claims: ModelClaim[];
}

export interface PerplexityParams {
  requestId: string;
  url: string;
  title: string;
  articleText: string;
  claimLimit: number;
  allowedDomains: string[];
  primaryDomains: string[];
}

export interface PerplexityClient {
  (params: PerplexityParams): Promise<ModelOutput>;
}
