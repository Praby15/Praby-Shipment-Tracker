const GEMINI_API_KEY = "geminiApiKey";

function setStatus(message, isError = false) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.style.color = isError ? "#b9382a" : "#617266";
}

function loadSettings() {
  chrome.storage.sync.get([GEMINI_API_KEY], (items) => {
    const value = String(items?.[GEMINI_API_KEY] || "");
    document.getElementById("geminiApiKey").value = value;
  });
}

function saveSettings() {
  const apiKey = document.getElementById("geminiApiKey").value.trim();
  if (!apiKey) {
    setStatus("Please enter a Gemini API key.", true);
    return;
  }

  chrome.storage.sync.set({ [GEMINI_API_KEY]: apiKey }, () => {
    if (chrome.runtime.lastError) {
      setStatus(`Save failed: ${chrome.runtime.lastError.message}`, true);
      return;
    }
    setStatus("Gemini API key saved.");
  });
}

function clearSettings() {
  chrome.storage.sync.remove(GEMINI_API_KEY, () => {
    if (chrome.runtime.lastError) {
      setStatus(`Clear failed: ${chrome.runtime.lastError.message}`, true);
      return;
    }
    document.getElementById("geminiApiKey").value = "";
    setStatus("Gemini API key cleared.");
  });
}

document.getElementById("save").addEventListener("click", saveSettings);
document.getElementById("reset").addEventListener("click", clearSettings);
document.addEventListener("DOMContentLoaded", loadSettings);
