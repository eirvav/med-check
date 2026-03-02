# MedCheck v1 (Local Prototype)

MedCheck is a local-first Chrome extension that extracts claims from medical articles and verifies them via Perplexity, then applies deterministic source-policy checks against reputable medical domains.

## What It Does

- Click extension popup on any `http/https` article page.
- Choose analysis scope:
  - Entire article
  - Selected text (highlight a sentence first)
- Extract main article body with Readability fallback.
- Send analysis request to local proxy (`127.0.0.1:8787`).
- Proxy calls Perplexity and validates claim/citation output.
- Enforces whitelist + citation thresholds, then returns claim verdicts:
  - `Supported`
  - `Contradicted`
  - `Uncertain`

## Architecture

- `apps/extension`: Chrome MV3 extension (TypeScript + Vite)
- `apps/proxy`: Local Node/Express API proxy (TypeScript)
- Root `.env`: stores `PERPLEXITY_API_KEY`

## Prerequisites

- Node.js 20+
- npm
- Google Chrome

## Setup

1. Ensure `.env` exists in repo root with your key:

```bash
PERPLEXITY_API_KEY=your_key_here
# optional
# PERPLEXITY_MODEL=sonar-pro
```

2. Install dependencies:

```bash
npm install
```

## Run (Development)

Terminal 1 (proxy):

```bash
npm run dev:proxy
```

Terminal 2 (extension build watch):

```bash
npm run dev:ext
```

## Load Extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select folder: `apps/extension/dist`

If you rebuild, click **Reload** on the extension card.

## Extension Settings

Open extension details -> **Extension options** to configure:

- Claim limit
- Minimum citations
- Require primary source
- Strict whitelist
- Allowed domains
- Primary domains
- Proxy base URL

Saved in `chrome.storage.sync` under key `medcheck.settings.v1`.

## Default Source Policy

Primary domains:

- `pubmed.ncbi.nlm.nih.gov`
- `ncbi.nlm.nih.gov`
- `cochranelibrary.com`
- `nejm.org`
- `thelancet.com`
- `jamanetwork.com`
- `bmj.com`

Secondary institutional domains:

- `who.int`
- `cdc.gov`
- `nih.gov`
- `fda.gov`

Rules:

- Domain exact/subdomain match is allowed.
- For non-`Uncertain` verdicts, at least 1 accepted citation is required.
- At least 1 accepted citation must come from a primary domain (if enabled).

## Testing

Run all tests:

```bash
npm test
```

## Known Prototype Constraints

- English-only v1 language support.
- Local prototype only (not Chrome Web Store packaged).
- No analysis history persistence (results live in popup session only).
- Informational verification only; not medical advice.
