async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function showLoading(message) {
  const loading = document.getElementById("loading");
  const loadingText = document.getElementById("loadingText");
  const errorNode = document.getElementById("error");
  const resultNode = document.getElementById("result");
  const modeBadge = document.getElementById("modeBadge");

  loading.hidden = false;
  loadingText.textContent = message;
  errorNode.hidden = true;
  resultNode.hidden = true;
  modeBadge.hidden = true;
}

function verdictFromScore(score) {
  if (score >= 8) return "Green (Apply)";
  if (score >= 5) return "Yellow (Think Twice)";
  return "Red (Avoid)";
}

function colorFromVerdict(verdict, score) {
  const verdictText = String(verdict || "").toLowerCase();
  if (verdictText.includes("green") || score >= 8) return "#1f9d55";
  if (verdictText.includes("yellow") || score >= 5) return "#d59f10";
  return "#d64545";
}

function colorHexFromModelColor(color) {
  const value = String(color || "").toLowerCase();
  if (value === "green") return "#1f9d55";
  if (value === "yellow") return "#d59f10";
  if (value === "red") return "#d64545";
  return "";
}

function normalizeReasons(result) {
  const reasons = Array.isArray(result?.reasons) ? result.reasons.filter(Boolean).map(String) : [];
  if (reasons.length >= 3) return reasons.slice(0, 3);

  if (typeof result?.reason === "string" && result.reason.trim()) {
    const parsed = result.reason
      .split(/[\n•]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const item of parsed) {
      if (reasons.length >= 3) break;
      reasons.push(item);
    }
  }

  while (reasons.length < 3) {
    reasons.push("Limited detail available, so confidence is moderate.");
  }

  return reasons.slice(0, 3);
}

function renderError(message) {
  document.getElementById("loading").hidden = true;
  const errorNode = document.getElementById("error");
  document.getElementById("modeBadge").hidden = true;
  errorNode.textContent = message;
  errorNode.hidden = false;
}

function renderResult(result) {
  document.getElementById("loading").hidden = true;
  const resultNode = document.getElementById("result");
  const score = Number(result?.score);
  const normalizedScore = Number.isFinite(score) ? Math.max(1, Math.min(10, Math.round(score))) : 5;
  const verdict = result?.verdict || verdictFromScore(normalizedScore);
  const reasons = normalizeReasons(result);
  const color = colorHexFromModelColor(result?.color) || colorFromVerdict(verdict, normalizedScore);
  const modeBadge = document.getElementById("modeBadge");

  const circle = document.getElementById("circle");
  circle.textContent = `${normalizedScore}/10`;
  circle.style.backgroundColor = color;

  document.getElementById("verdict").textContent = verdict;

  const reasonsNode = document.getElementById("reasons");
  reasonsNode.innerHTML = "";
  for (const reason of reasons) {
    const li = document.createElement("li");
    li.textContent = reason;
    reasonsNode.appendChild(li);
  }

  const redFlagCount = Array.isArray(result?.redFlags) ? result.redFlags.length : 0;
  document.getElementById("meta").textContent =
    redFlagCount > 0 ? `Detected ${redFlagCount} red flag(s).` : "No major red flags detected.";

  modeBadge.hidden = !result?.isFallback;

  resultNode.hidden = false;
}

async function ensureContentScriptInjected(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

function sendMessageToTab(tabId, payload) {
  return chrome.tabs.sendMessage(tabId, payload).catch(async (error) => {
    const message = String(error?.message || error || "");
    const missingReceiver =
      message.includes("Receiving end does not exist") ||
      message.includes("Could not establish connection");

    if (!missingReceiver) {
      throw error;
    }

    await ensureContentScriptInjected(tabId);
    return chrome.tabs.sendMessage(tabId, payload);
  });
}

function sendMessageToBackground(payload) {
  return chrome.runtime.sendMessage(payload);
}

async function waitForReadyAnalysis(tabId, retries = 20) {
  for (let i = 0; i < retries; i += 1) {
    const response = await sendMessageToBackground({ type: "get_analysis_for_tab", tabId });
    if (response?.ok && response.status === "ready" && response.result) {
      return response.result;
    }
    if (response?.ok === false && response.status === "error") {
      throw new Error(response.error || "Analysis failed.");
    }

    showLoading("Analyzing with Gemini...");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Analysis is taking too long. Please reopen the popup in a moment.");
}

async function run() {
  try {
    showLoading("Reading this job post...");

    const tab = await getActiveTab();
    if (!tab?.id || !tab.url) {
      renderError("Could not find active tab.");
      return;
    }

    const allowedHosts = ["linkedin.com", "naukri.com", "internshala.com", "indeed.com"];
    const isSupported = allowedHosts.some((host) => new URL(tab.url).hostname.includes(host));
    if (!isSupported) {
      renderError("Open a supported job page: LinkedIn, Naukri, Internshala, or Indeed.");
      return;
    }

    const cached = await sendMessageToBackground({ type: "get_analysis_for_tab", tabId: tab.id });
    if (cached?.ok && cached.status === "ready" && cached.result) {
      renderResult(cached.result);
      return;
    }

    if (cached?.ok && cached.status === "loading") {
      const pendingResult = await waitForReadyAnalysis(tab.id);
      renderResult(pendingResult);
      return;
    }

    const extraction = await sendMessageToTab(tab.id, { type: "extract_job_text" });
    if (!extraction?.ok || !extraction.text) {
      renderError("Could not read job description text from this page.");
      return;
    }

    showLoading("Analyzing with Gemini...");
    const analysis = await sendMessageToBackground({
      type: "analyze_job",
      tabId: tab.id,
      text: extraction.text,
      sourceUrl: tab.url
    });

    if (!analysis?.ok) {
      renderError(analysis?.error || "Analysis failed.");
      return;
    }

    renderResult(analysis.result);
  } catch (error) {
    renderError(`Unexpected error: ${String(error)}`);
  }
}

document.addEventListener("DOMContentLoaded", run);

document.getElementById("openSettings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
