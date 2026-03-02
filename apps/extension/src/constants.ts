import type { AnalysisSettings } from "./types";

export const SETTINGS_STORAGE_KEY = "medcheck.settings.v1";

export const DEFAULT_ALLOWED_DOMAINS = [
  "pubmed.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "cochranelibrary.com",
  "nejm.org",
  "thelancet.com",
  "jamanetwork.com",
  "bmj.com",
  "who.int",
  "cdc.gov",
  "nih.gov",
  "fda.gov",
  "atsjournals.org"
];

export const DEFAULT_PRIMARY_DOMAINS = [
  "pubmed.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "cochranelibrary.com",
  "nejm.org",
  "thelancet.com",
  "jamanetwork.com",
  "bmj.com",
  "atsjournals.org"
];

export const DEFAULT_SETTINGS: AnalysisSettings = {
  claimLimit: 8,
  minCitations: 1,
  requirePrimarySource: true,
  strictWhitelist: true,
  allowedDomains: DEFAULT_ALLOWED_DOMAINS,
  primaryDomains: DEFAULT_PRIMARY_DOMAINS,
  proxyBaseUrl: "http://127.0.0.1:8787"
};

export const DISCLAIMER_TEXT =
  "MedCheck is for informational verification only and is not medical advice, diagnosis, or treatment.";

export const EXTRACTION_TIMEOUT_MS = 8_000;
export const PROXY_TIMEOUT_MS = 45_000;
