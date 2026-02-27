const ENGLISH_MARKERS = [
  "the",
  "and",
  "with",
  "for",
  "from",
  "that",
  "this",
  "medical",
  "health",
  "study",
  "patients"
];

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function inferEnglishConfidence(text: string): number {
  const words = normalizeWhitespace(text)
    .toLowerCase()
    .split(/\W+/)
    .filter(Boolean)
    .slice(0, 500);

  if (words.length === 0) {
    return 0;
  }

  const markerHits = words.filter((word) => ENGLISH_MARKERS.includes(word)).length;
  return markerHits / words.length;
}

export function isSupportedLanguage(language: string | null | undefined, text: string): boolean {
  const normalized = language?.trim().toLowerCase() ?? "";
  if (normalized) {
    return normalized.startsWith("en");
  }

  return inferEnglishConfidence(text) >= 0.15;
}
