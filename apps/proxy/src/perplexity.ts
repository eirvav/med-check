import { ParsingFailedError, UpstreamUnavailableError } from "./errors.js";
import { modelOutputSchema } from "./schema.js";
import { domainFromUrl, isAllowedDomain } from "./sourcePolicy.js";
import type { ModelOutput, PerplexityParams } from "./types.js";

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

function buildSystemPrompt(
  claimLimit: number,
  allowedDomains: string[],
  primaryDomains: string[],
  options?: { whitelistOnly?: boolean }
): string {
  const whitelistOnly = options?.whitelistOnly ?? false;
  return [
    "You are a medical fact-checking assistant.",
    `Extract up to ${claimLimit} medically meaningful factual claims from the article text provided.`,
    "For each claim, evaluate whether it is Supported, Contradicted, Mixed, or Insufficient based on reliable evidence.",
    "Strongly prioritize PubMed/NCBI citations where possible.",
    "Prioritize evidence from these allowed reputable source domains:",
    allowedDomains.join(", "),
    "Primary medical evidence sources (at least one preferred per claim):",
    primaryDomains.join(", "),
    "Avoid forum posts, personal blogs, influencer pages, ad pages, and non-reputable sources.",
    whitelistOnly
      ? "Cite only URLs from the allowed domain list. If no allowed source is found for a claim, return an empty citations array for that claim."
      : "Prefer allowed domains first; use non-allowed domains only if absolutely necessary.",
    "Return ONLY valid JSON with shape: {\"claims\":[{\"claim\":string,\"verdict\":string,\"confidence\":number,\"rationale\":string,\"citations\":[{\"url\":string,\"title\"?:string}]}]}.",
    "Do not include markdown fences or extra prose."
  ].join("\n");
}

function buildUserPrompt(params: PerplexityParams): string {
  return [
    `Page URL: ${params.url}`,
    `Page title: ${params.title}`,
    "Article text:",
    params.articleText
  ].join("\n\n");
}

function countClaimsWithAllowedCitations(output: ModelOutput, allowedDomains: string[]): number {
  return output.claims.filter((claim) =>
    claim.citations.some((citation) => {
      const domain = domainFromUrl(citation.url);
      if (!domain) {
        return false;
      }
      return isAllowedDomain(domain, allowedDomains);
    })
  ).length;
}

function shouldForceWhitelistRetry(output: ModelOutput, claimLimit: number, allowedDomains: string[]): boolean {
  const claims = output.claims.slice(0, claimLimit);
  if (claims.length === 0) {
    return false;
  }

  const claimsWithAllowed = countClaimsWithAllowedCitations({ claims }, allowedDomains);
  const minExpectedWhitelistedClaims = claims.length === 1 ? 1 : Math.min(2, claims.length);
  return claimsWithAllowed < minExpectedWhitelistedClaims;
}

function extractMessageContent(raw: unknown): string {
  const content =
    (raw as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content ?? null;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }

  throw new ParsingFailedError("Perplexity response did not include textual content.");
}

function extractJsonString(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1).trim();
  }

  throw new ParsingFailedError("Could not find JSON object in model output.");
}

function parseModelOutput(content: string): ModelOutput {
  try {
    const parsed = JSON.parse(extractJsonString(content));
    const validated = modelOutputSchema.parse(parsed);
    return validated;
  } catch (error) {
    if (error instanceof ParsingFailedError) {
      throw error;
    }

    throw new ParsingFailedError(
      `Failed to parse model output: ${error instanceof Error ? error.message : "unknown parsing error"}`
    );
  }
}

interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature: number;
}

async function callPerplexityApi(requestBody: ChatCompletionRequest): Promise<string> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  const model = process.env.PERPLEXITY_MODEL || requestBody.model;

  if (!apiKey) {
    throw new UpstreamUnavailableError("PERPLEXITY_API_KEY is missing.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35_000);

  try {
    const response = await fetch(PERPLEXITY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ ...requestBody, model }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new UpstreamUnavailableError(`Perplexity returned status ${response.status}.`);
    }

    const payload = await response.json();
    return extractMessageContent(payload);
  } catch (error) {
    if (error instanceof ParsingFailedError || error instanceof UpstreamUnavailableError) {
      throw error;
    }

    throw new UpstreamUnavailableError(error instanceof Error ? error.message : "Perplexity request failed.");
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestAndParseModelOutput(systemPrompt: string, userPrompt: string): Promise<ModelOutput> {
  const model = process.env.PERPLEXITY_MODEL || "sonar-pro";
  const initialRequest: ChatCompletionRequest = {
    model,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  };

  const firstOutput = await callPerplexityApi(initialRequest);
  try {
    return parseModelOutput(firstOutput);
  } catch {
    const repairRequest: ChatCompletionRequest = {
      model,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
        { role: "assistant", content: firstOutput },
        {
          role: "user",
          content:
            "Your previous response was not valid JSON. Return only valid JSON with the required schema and no markdown fences."
        }
      ]
    };

    const repairedOutput = await callPerplexityApi(repairRequest);
    return parseModelOutput(repairedOutput);
  }
}

function countAllowedCitations(output: ModelOutput, allowedDomains: string[]): number {
  let accepted = 0;
  for (const claim of output.claims) {
    for (const citation of claim.citations) {
      const domain = domainFromUrl(citation.url);
      if (domain && isAllowedDomain(domain, allowedDomains)) {
        accepted += 1;
      }
    }
  }
  return accepted;
}

export async function fetchClaimsFromPerplexity(params: PerplexityParams): Promise<ModelOutput> {
  const systemPrompt = buildSystemPrompt(params.claimLimit, params.allowedDomains, params.primaryDomains);
  const userPrompt = buildUserPrompt(params);
  const firstParsed = await requestAndParseModelOutput(systemPrompt, userPrompt);

  if (!shouldForceWhitelistRetry(firstParsed, params.claimLimit, params.allowedDomains)) {
    return firstParsed;
  }

  const whitelistOnlyPrompt = buildSystemPrompt(params.claimLimit, params.allowedDomains, params.primaryDomains, {
    whitelistOnly: true
  });
  const retryParsed = await requestAndParseModelOutput(whitelistOnlyPrompt, userPrompt);

  return countAllowedCitations(retryParsed, params.allowedDomains) >=
    countAllowedCitations(firstParsed, params.allowedDomains)
    ? retryParsed
    : firstParsed;
}
