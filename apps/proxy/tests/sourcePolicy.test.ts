import { describe, expect, it } from "vitest";

import { domainFromUrl, isAllowedDomain, normalizeDomain } from "../src/sourcePolicy.js";

describe("sourcePolicy", () => {
  it("normalizes domains", () => {
    expect(normalizeDomain("https://WWW.NCBI.NLM.NIH.GOV/")).toBe("ncbi.nlm.nih.gov");
  });

  it("extracts domain from URL", () => {
    expect(domainFromUrl("https://pubmed.ncbi.nlm.nih.gov/12345/")).toBe("pubmed.ncbi.nlm.nih.gov");
  });

  it("matches exact and subdomains", () => {
    expect(isAllowedDomain("pubmed.ncbi.nlm.nih.gov", ["ncbi.nlm.nih.gov"])).toBe(true);
    expect(isAllowedDomain("example.com", ["ncbi.nlm.nih.gov"])).toBe(false);
  });
});
