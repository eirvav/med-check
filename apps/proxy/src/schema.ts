import { z } from "zod";

export const settingsSchema = z.object({
  claimLimit: z.number().int().min(1).max(12),
  minCitations: z.number().int().min(1).max(5),
  requirePrimarySource: z.boolean(),
  strictWhitelist: z.boolean(),
  allowedDomains: z.array(z.string().min(1)).min(1),
  primaryDomains: z.array(z.string().min(1)).min(1),
  proxyBaseUrl: z.string().min(1)
});

export const analyzeRequestSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  language: z.string().nullable(),
  articleText: z.string().min(1),
  settings: settingsSchema
});

export const modelOutputSchema = z.object({
  claims: z
    .array(
      z.object({
        claim: z.string().min(1),
        verdict: z.string().min(1),
        confidence: z.number().min(0).max(1).optional(),
        rationale: z.string().min(1),
        citations: z
          .array(
            z.object({
              url: z.string().min(1),
              title: z.string().min(1).optional()
            })
          )
          .default([])
      })
    )
    .default([])
});

export type AnalyzeRequestInput = z.infer<typeof analyzeRequestSchema>;
export type ModelOutputInput = z.infer<typeof modelOutputSchema>;
