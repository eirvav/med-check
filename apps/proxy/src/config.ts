import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

function findEnvPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(process.cwd(), "../.env")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export interface AppConfig {
  perplexityApiKey: string;
  perplexityModel: string;
  host: string;
  port: number;
}

export function loadEnvironment(): AppConfig {
  const envPath = findEnvPath();
  if (envPath) {
    dotenv.config({ path: envPath });
  }

  const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
  if (!perplexityApiKey) {
    throw new Error("Missing PERPLEXITY_API_KEY in environment.");
  }

  return {
    perplexityApiKey,
    perplexityModel: process.env.PERPLEXITY_MODEL || "sonar-pro",
    host: process.env.PROXY_HOST || "127.0.0.1",
    port: Number(process.env.PROXY_PORT || 8787)
  };
}
