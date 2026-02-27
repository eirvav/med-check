import { DISCLAIMER_TEXT } from "./constants";
import type { AnalyzeResult, ClaimResult } from "./types";

type UiState = "idle" | "extracting" | "verifying" | "done" | "error";
type AnalysisScope = "article" | "selection";

interface SelectionStatusPayload {
  hasSelection: boolean;
  textPreview: string;
  charCount: number;
}

const statusText = document.getElementById("statusText") as HTMLParagraphElement;
const errorBox = document.getElementById("errorBox") as HTMLDivElement;
const summaryCard = document.getElementById("summaryCard") as HTMLDivElement;
const overallVerdict = document.getElementById("overallVerdict") as HTMLParagraphElement;
const supportedCount = document.getElementById("supportedCount") as HTMLSpanElement;
const contradictedCount = document.getElementById("contradictedCount") as HTMLSpanElement;
const uncertainCount = document.getElementById("uncertainCount") as HTMLSpanElement;
const claimsList = document.getElementById("claimsList") as HTMLDivElement;
const disclaimerText = document.getElementById("disclaimerText") as HTMLParagraphElement;
const runAnalysisBtn = document.getElementById("runAnalysisBtn") as HTMLButtonElement;
const selectionScopeInput = document.getElementById("selectionScopeInput") as HTMLInputElement;
const selectionInfoText = document.getElementById("selectionInfoText") as HTMLParagraphElement;
const scopeInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="analysisScope"]')
);

let selectionModeAvailable = false;
let latestRunId = 0;

disclaimerText.textContent = DISCLAIMER_TEXT;

function getSelectedScope(): AnalysisScope {
  const selected = scopeInputs.find((input) => input.checked)?.value;
  return selected === "selection" ? "selection" : "article";
}

function setState(state: UiState, scope: AnalysisScope): void {
  if (state === "idle") {
    statusText.textContent = "Ready.";
    return;
  }
  if (state === "extracting") {
    statusText.textContent =
      scope === "selection" ? "Reading selected text..." : "Extracting article content...";
    return;
  }
  if (state === "verifying") {
    statusText.textContent = "Verifying claims with medical sources...";
    return;
  }
  if (state === "done") {
    statusText.textContent = "Analysis complete.";
    return;
  }
  statusText.textContent = "Analysis failed.";
}

function clearUi(): void {
  errorBox.classList.add("hidden");
  summaryCard.classList.add("hidden");
  claimsList.innerHTML = "";
}

function setControlsDisabled(disabled: boolean): void {
  runAnalysisBtn.disabled = disabled;
  for (const input of scopeInputs) {
    if (input.value === "selection") {
      input.disabled = disabled || !selectionModeAvailable;
    } else {
      input.disabled = disabled;
    }
  }
}

function badgeClass(verdict: string): string {
  return `badge ${verdict.toLowerCase()}`;
}

function renderClaim(claimResult: ClaimResult): HTMLElement {
  const card = document.createElement("article");
  card.className = "claim-card";

  const top = document.createElement("div");
  top.className = "claim-top";

  const claimText = document.createElement("p");
  claimText.className = "claim-text";
  claimText.textContent = claimResult.claim;

  const badge = document.createElement("span");
  badge.className = badgeClass(claimResult.verdict);
  badge.textContent = claimResult.verdict;

  top.append(claimText, badge);

  const confidence = document.createElement("p");
  confidence.className = "confidence";
  confidence.textContent = `Confidence: ${Math.round(claimResult.confidence * 100)}%`;

  const rationale = document.createElement("p");
  rationale.className = "rationale";
  rationale.textContent = claimResult.rationale;

  const citationList = document.createElement("div");
  citationList.className = "citation-list";

  for (const citation of claimResult.citations) {
    const item = document.createElement("div");
    item.className = "citation-item";

    const chip = document.createElement("span");
    chip.className = `domain-chip${citation.accepted ? "" : " rejected"}`;
    chip.textContent = citation.domain || "unknown-domain";

    const link = document.createElement("a");
    link.href = citation.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = citation.title || citation.url;

    item.append(chip, link);

    if (!citation.accepted && citation.reasonIfRejected) {
      const reason = document.createElement("span");
      reason.textContent = ` (${citation.reasonIfRejected})`;
      item.append(reason);
    }

    citationList.append(item);
  }

  card.append(top, confidence, rationale, citationList);
  return card;
}

function renderError(code: string, message: string): void {
  errorBox.classList.remove("hidden");
  errorBox.textContent = `${code}: ${message}`;
}

function sendRuntimeMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response as T);
    });
  });
}

function sendAnalyzeMessage(scope: AnalysisScope): Promise<AnalyzeResult> {
  return sendRuntimeMessage<AnalyzeResult>({ type: "MEDCHECK_ANALYZE_ACTIVE_TAB", scope });
}

async function loadSelectionAvailability(): Promise<void> {
  const response = await sendRuntimeMessage<
    | { ok: true; data: SelectionStatusPayload }
    | { ok: false; error: { code: string; message: string } }
  >({ type: "MEDCHECK_GET_SELECTION_STATUS" });

  if (response.ok) {
    selectionModeAvailable = response.data.hasSelection;

    if (response.data.hasSelection) {
      const preview = response.data.textPreview;
      selectionInfoText.textContent =
        preview.length > 0
          ? `Selected text ready (${response.data.charCount} chars): "${preview}${
              response.data.charCount > preview.length ? "..." : ""
            }"`
          : `Selected text ready (${response.data.charCount} chars).`;
      return;
    }

    selectionInfoText.textContent =
      "No text is selected. Highlight a sentence in the page, then reopen the extension.";
    return;
  }

  selectionModeAvailable = false;
  selectionInfoText.textContent =
    response.error.code === "UNSUPPORTED_PAGE"
      ? "Selected-text mode works on regular http/https pages."
      : "Could not inspect selected text on this page.";
}

async function runAnalysis(scope: AnalysisScope): Promise<void> {
  if (scope === "selection" && !selectionModeAvailable) {
    setState("error", scope);
    renderError("NO_SELECTION", "Highlight a sentence in the page, then reopen MedCheck.");
    return;
  }

  latestRunId += 1;
  const runId = latestRunId;

  clearUi();
  setControlsDisabled(true);
  setState("extracting", scope);

  const phaseTimer = setTimeout(() => setState("verifying", scope), 1_100);

  try {
    const result = await sendAnalyzeMessage(scope);
    if (runId !== latestRunId) {
      return;
    }

    clearTimeout(phaseTimer);

    if (!result.ok) {
      setState("error", scope);
      renderError(result.error.code, result.error.message);
      return;
    }

    const { pageSummary, claims } = result.data;
    summaryCard.classList.remove("hidden");
    overallVerdict.textContent = `Overall: ${pageSummary.overall}`;
    supportedCount.textContent = `Supported: ${pageSummary.supported}`;
    contradictedCount.textContent = `Contradicted: ${pageSummary.contradicted}`;
    uncertainCount.textContent = `Uncertain: ${pageSummary.uncertain}`;

    claims.forEach((claim) => claimsList.append(renderClaim(claim)));

    if (claims.length === 0) {
      const empty = document.createElement("p");
      empty.className = "rationale";
      empty.textContent = "No high-confidence medical claims were extracted from this page.";
      claimsList.append(empty);
    }

    setState("done", scope);
  } catch (error) {
    if (runId !== latestRunId) {
      return;
    }

    clearTimeout(phaseTimer);
    setState("error", scope);
    renderError("ANALYSIS_FAILED", error instanceof Error ? error.message : "Unknown error");
  } finally {
    if (runId === latestRunId) {
      setControlsDisabled(false);
    }
  }
}

runAnalysisBtn.addEventListener("click", () => {
  void runAnalysis(getSelectedScope());
});

async function initialize(): Promise<void> {
  try {
    await loadSelectionAvailability();
  } catch {
    selectionModeAvailable = false;
    selectionInfoText.textContent =
      "Could not inspect selected text. You can still analyze the full article.";
  }

  if (!selectionModeAvailable && selectionScopeInput.checked) {
    const articleInput = scopeInputs.find((input) => input.value === "article");
    if (articleInput) {
      articleInput.checked = true;
    }
  }

  if (selectionModeAvailable) {
    selectionScopeInput.checked = true;
  }

  await runAnalysis(getSelectedScope());
}

void initialize();
