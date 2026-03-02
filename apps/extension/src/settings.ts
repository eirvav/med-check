import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from "./constants";
import type { AnalysisSettings } from "./types";

const LEGACY_DEFAULT_SETTINGS: AnalysisSettings = {
  ...DEFAULT_SETTINGS,
  minCitations: 2
};

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

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((entry, index) => entry === right[index]);
}

function isLegacyDefaultConfig(settings: AnalysisSettings): boolean {
  return (
    settings.claimLimit === LEGACY_DEFAULT_SETTINGS.claimLimit &&
    settings.minCitations === LEGACY_DEFAULT_SETTINGS.minCitations &&
    settings.requirePrimarySource === LEGACY_DEFAULT_SETTINGS.requirePrimarySource &&
    settings.strictWhitelist === LEGACY_DEFAULT_SETTINGS.strictWhitelist &&
    settings.proxyBaseUrl === LEGACY_DEFAULT_SETTINGS.proxyBaseUrl &&
    arraysEqual(settings.allowedDomains, LEGACY_DEFAULT_SETTINGS.allowedDomains) &&
    arraysEqual(settings.primaryDomains, LEGACY_DEFAULT_SETTINGS.primaryDomains)
  );
}

export async function getSettings(): Promise<AnalysisSettings> {
  const raw = await chrome.storage.sync.get(SETTINGS_STORAGE_KEY);
  const stored = raw[SETTINGS_STORAGE_KEY] as Partial<AnalysisSettings> | undefined;
  const sanitized = sanitizeSettings(stored ?? DEFAULT_SETTINGS);

  // One-time migration from old defaults (minCitations=2) to the new default (minCitations=1).
  if (stored && isLegacyDefaultConfig(sanitized)) {
    await chrome.storage.sync.set({
      [SETTINGS_STORAGE_KEY]: DEFAULT_SETTINGS
    });
    return DEFAULT_SETTINGS;
  }

  return sanitized;
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
