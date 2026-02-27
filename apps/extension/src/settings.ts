import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from "./constants";
import type { AnalysisSettings } from "./types";

function sanitizeDomains(input: string[]): string[] {
  const normalized = input
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
    .map((domain) => domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, ""));

  return [...new Set(normalized)];
}

function sanitizeSettings(settings: Partial<AnalysisSettings>): AnalysisSettings {
  const claimLimit = Number.isFinite(settings.claimLimit) ? Number(settings.claimLimit) : DEFAULT_SETTINGS.claimLimit;
  const minCitations = Number.isFinite(settings.minCitations)
    ? Number(settings.minCitations)
    : DEFAULT_SETTINGS.minCitations;

  return {
    claimLimit: Math.min(12, Math.max(1, claimLimit)),
    minCitations: Math.min(5, Math.max(1, minCitations)),
    requirePrimarySource: settings.requirePrimarySource ?? DEFAULT_SETTINGS.requirePrimarySource,
    strictWhitelist: settings.strictWhitelist ?? DEFAULT_SETTINGS.strictWhitelist,
    allowedDomains: sanitizeDomains(settings.allowedDomains ?? DEFAULT_SETTINGS.allowedDomains),
    primaryDomains: sanitizeDomains(settings.primaryDomains ?? DEFAULT_SETTINGS.primaryDomains),
    proxyBaseUrl: settings.proxyBaseUrl?.trim() || DEFAULT_SETTINGS.proxyBaseUrl
  };
}

export async function getSettings(): Promise<AnalysisSettings> {
  const raw = await chrome.storage.sync.get(SETTINGS_STORAGE_KEY);
  return sanitizeSettings(raw[SETTINGS_STORAGE_KEY] ?? DEFAULT_SETTINGS);
}

export async function saveSettings(settings: Partial<AnalysisSettings>): Promise<AnalysisSettings> {
  const merged = sanitizeSettings({ ...(await getSettings()), ...settings });
  await chrome.storage.sync.set({
    [SETTINGS_STORAGE_KEY]: merged
  });
  return merged;
}

export function parseDomainTextarea(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
