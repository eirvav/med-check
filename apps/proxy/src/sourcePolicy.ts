export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

export function domainFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return normalizeDomain(parsed.hostname);
  } catch {
    return null;
  }
}

export function domainMatches(candidate: string, allowedDomain: string): boolean {
  return candidate === allowedDomain || candidate.endsWith(`.${allowedDomain}`);
}

export function isAllowedDomain(candidate: string, allowedDomains: string[]): boolean {
  const normalizedCandidate = normalizeDomain(candidate);
  return allowedDomains.some((allowed) => domainMatches(normalizedCandidate, normalizeDomain(allowed)));
}
