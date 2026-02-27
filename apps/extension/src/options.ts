import { DEFAULT_SETTINGS } from "./constants";
import { getSettings, parseDomainTextarea, saveSettings } from "./settings";

const form = document.getElementById("settingsForm") as HTMLFormElement;
const claimLimitInput = document.getElementById("claimLimit") as HTMLInputElement;
const minCitationsInput = document.getElementById("minCitations") as HTMLInputElement;
const requirePrimarySourceInput = document.getElementById("requirePrimarySource") as HTMLInputElement;
const strictWhitelistInput = document.getElementById("strictWhitelist") as HTMLInputElement;
const proxyBaseUrlInput = document.getElementById("proxyBaseUrl") as HTMLInputElement;
const allowedDomainsInput = document.getElementById("allowedDomains") as HTMLTextAreaElement;
const primaryDomainsInput = document.getElementById("primaryDomains") as HTMLTextAreaElement;
const saveStatus = document.getElementById("saveStatus") as HTMLParagraphElement;
const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;

function populateForm(): Promise<void> {
  return getSettings().then((settings) => {
    claimLimitInput.value = String(settings.claimLimit);
    minCitationsInput.value = String(settings.minCitations);
    requirePrimarySourceInput.checked = settings.requirePrimarySource;
    strictWhitelistInput.checked = settings.strictWhitelist;
    proxyBaseUrlInput.value = settings.proxyBaseUrl;
    allowedDomainsInput.value = settings.allowedDomains.join("\n");
    primaryDomainsInput.value = settings.primaryDomains.join("\n");
  });
}

function setStatus(message: string): void {
  saveStatus.textContent = message;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  void saveSettings({
    claimLimit: Number(claimLimitInput.value),
    minCitations: Number(minCitationsInput.value),
    requirePrimarySource: requirePrimarySourceInput.checked,
    strictWhitelist: strictWhitelistInput.checked,
    proxyBaseUrl: proxyBaseUrlInput.value,
    allowedDomains: parseDomainTextarea(allowedDomainsInput.value),
    primaryDomains: parseDomainTextarea(primaryDomainsInput.value)
  })
    .then(() => {
      setStatus("Settings saved.");
    })
    .catch((error) => {
      setStatus(`Save failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    });
});

resetBtn.addEventListener("click", () => {
  void saveSettings(DEFAULT_SETTINGS)
    .then(() => populateForm())
    .then(() => setStatus("Defaults restored."))
    .catch((error) => {
      setStatus(`Reset failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    });
});

void populateForm().catch((error) => {
  setStatus(`Load failed: ${error instanceof Error ? error.message : "Unknown error"}`);
});
