const GEMINI_API_KEY = "AIzaSyB_CP5LnTeEmsfliDZxLQDFPcUPLgj-0TA";
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
const tabAnalysisStore = new Map();
const urlSuccessStore = new Map();

function parseJsonFromGeminiText(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonCandidate = fencedMatch ? fencedMatch[1] : text;
  return JSON.parse(jsonCandidate);
}

function detectRedFlagsLocally(jobText) {
  const text = String(jobText || "").toLowerCase();
  const flags = [];

  if (/wear\s+many\s+hats/.test(text)) flags.push("wear many hats");
  if (/\bunpaid\b/.test(text)) flags.push("unpaid");

  const hasSalarySignal = /\b(salary|ctc|compensation|pay|stipend|lpa|per\s+month|per\s+annum|hourly)\b/.test(
    text
  );
  if (!hasSalarySignal) flags.push("no salary mentioned");

  return flags;
}

function normalizeAnalysisPayload(payload, localFlags) {
  const rawScore = Number(payload?.score);
  const score = Number.isFinite(rawScore) ? Math.max(1, Math.min(10, Math.round(rawScore))) : 5;

  const allowedVerdicts = ["Green (Apply)", "Yellow (Think Twice)", "Red (Avoid)"];
  const verdict = allowedVerdicts.includes(payload?.verdict) ? payload.verdict : score >= 8
    ? "Green (Apply)"
    : score >= 5
      ? "Yellow (Think Twice)"
      : "Red (Avoid)";

  const modelReasons = Array.isArray(payload?.reasons) ? payload.reasons.filter(Boolean).map(String) : [];
  const reasons = modelReasons.slice(0, 3);
  while (reasons.length < 3) {
    reasons.push("Limited detail in posting reduced confidence in final score.");
  }

  const allFlags = [];
  const modelFlags = Array.isArray(payload?.redFlags) ? payload.redFlags : [];
  for (const flag of [...localFlags, ...modelFlags]) {
    const normalized = String(flag || "").trim();
    if (!normalized) continue;
    if (!allFlags.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) {
      allFlags.push(normalized);
    }
  }

  const allowedColors = ["green", "yellow", "red"];
  const colorFromPayload = String(payload?.color || "").toLowerCase();
  const color = allowedColors.includes(colorFromPayload)
    ? colorFromPayload
    : verdict.includes("Green")
      ? "green"
      : verdict.includes("Yellow")
        ? "yellow"
        : "red";

  return {
    score,
    verdict,
    color,
    reasons,
    redFlags: allFlags,
    isFallback: false
  };
}

function buildQuotaFallback(localFlags) {
  const reasons = [
    "Gemini quota is currently exceeded, so this is a local fallback estimate.",
    localFlags.length > 0
      ? `Detected potential red flags: ${localFlags.slice(0, 3).join(", ")}.`
      : "No obvious red-flag keywords were detected in a quick local scan.",
    "Retry later after quota resets for a full AI-based evaluation."
  ];

  return {
    score: localFlags.length > 0 ? 4 : 6,
    verdict: localFlags.length > 0 ? "Red (Avoid)" : "Yellow (Think Twice)",
    color: localFlags.length > 0 ? "red" : "yellow",
    reasons,
    redFlags: localFlags,
    isFallback: true
  };
}

function buildApiKeyFallback(localFlags) {
  const reasons = [
    "Gemini API key is invalid or expired, so this is a local fallback estimate.",
    localFlags.length > 0
      ? `Detected potential red flags: ${localFlags.slice(0, 3).join(", ")}.`
      : "No obvious red-flag keywords were detected in a quick local scan.",
    "Update the Gemini API key in background.js or extension settings to restore AI analysis."
  ];

  return {
    score: localFlags.length > 0 ? 4 : 6,
    verdict: localFlags.length > 0 ? "Red (Avoid)" : "Yellow (Think Twice)",
    color: localFlags.length > 0 ? "red" : "yellow",
    reasons,
    redFlags: localFlags,
    isFallback: true
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildQuotaFallbackFromCached(cachedResult) {
  const reasons = Array.isArray(cachedResult?.reasons) ? cachedResult.reasons.slice(0, 3) : [];
  while (reasons.length < 3) {
    reasons.push("Using previously successful analysis for this job while Gemini quota is exceeded.");
  }

  reasons[0] = "Gemini quota exceeded, showing cached result for this job URL.";

  return {
    ...cachedResult,
    reasons,
    isFallback: true,
    cachedFromUrl: true
  };
}

async function analyzeJobWithGemini(jobText, pageUrl = "") {
  const localFlags = detectRedFlagsLocally(jobText);

  const prompt = [
    "You are a hiring-risk analyzer.",
    "Analyze the following job description and return JSON only with no markdown.",
    "Scoring instructions:",
    "- score: integer from 1 to 10 (10 is best).",
    "- detect red flags, especially: no salary, unpaid, wear many hats.",
    "- verdict: exactly one of Green (Apply), Yellow (Think Twice), Red (Avoid).",
    "- color: exactly one of green, yellow, red matching the verdict.",
    "- reasons: exactly 3 short bullet point strings.",
    "Return strictly valid JSON in this shape:",
    "{\"score\":number,\"verdict\":string,\"color\":string,\"reasons\":string[]}",
    "If red flags are found, mention them clearly in the reasons.",
    "Job description:",
    jobText
  ].join("\n");

  const requestBody = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  });

  const retryDelaysMs = [500, 1000];
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: requestBody
    });

    if (response.ok) {
      const responseJson = await response.json();
      const modelText = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const parsed = parseJsonFromGeminiText(modelText);
      const normalized = normalizeAnalysisPayload(parsed, localFlags);

      if (pageUrl) {
        urlSuccessStore.set(pageUrl, { ...normalized, isFallback: false });
      }
      return normalized;
    }

    const raw = await response.text();
    if (response.status === 429) {
      if (attempt < retryDelaysMs.length) {
        await sleep(retryDelaysMs[attempt]);
        continue;
      }

      const cachedResult = pageUrl ? urlSuccessStore.get(pageUrl) : null;
      if (cachedResult) {
        return buildQuotaFallbackFromCached(cachedResult);
      }

      return buildQuotaFallback(localFlags);
    }

    if (response.status === 400) {
      const isApiKeyInvalid =
        raw.includes("API_KEY_INVALID") ||
        raw.toLowerCase().includes("api key expired") ||
        raw.toLowerCase().includes("api key invalid");
      if (isApiKeyInvalid) {
        return buildApiKeyFallback(localFlags);
      }
    }

    throw new Error(`Gemini API error ${response.status}: ${raw.slice(0, 300)}`);
  }

  const cachedResult = pageUrl ? urlSuccessStore.get(pageUrl) : null;
  if (cachedResult) {
    return buildQuotaFallbackFromCached(cachedResult);
  }
  return buildQuotaFallback(localFlags);
}

function getStoreEntry(tabId) {
  return tabAnalysisStore.get(tabId) || null;
}

function setStoreEntry(tabId, patch) {
  const existing = getStoreEntry(tabId) || {};
  const next = { ...existing, ...patch, updatedAt: Date.now() };
  tabAnalysisStore.set(tabId, next);
  return next;
}

async function analyzeAndCacheForTab({ tabId, text, pageUrl, source }) {
  if (typeof tabId !== "number") {
    throw new Error("Missing valid tab id for analysis.");
  }

  const safeText = String(text || "").trim().slice(0, 20000);
  if (!safeText) {
    throw new Error("No job description text provided.");
  }

  const existing = getStoreEntry(tabId);
  if (existing?.status === "ready" && existing.text === safeText) {
    return existing.result;
  }
  if (existing?.status === "loading" && existing.text === safeText && existing.inFlight) {
    return existing.inFlight;
  }

  const inFlight = (async () => {
    try {
      const result = await analyzeJobWithGemini(safeText, pageUrl);
      setStoreEntry(tabId, {
        tabId,
        pageUrl,
        source,
        text: safeText,
        status: "ready",
        result,
        error: null,
        inFlight: null
      });
      return result;
    } catch (error) {
      setStoreEntry(tabId, {
        tabId,
        pageUrl,
        source,
        text: safeText,
        status: "error",
        result: null,
        error: String(error),
        inFlight: null
      });
      throw error;
    }
  })();

  setStoreEntry(tabId, {
    tabId,
    pageUrl,
    source,
    text: safeText,
    status: "loading",
    result: existing?.result || null,
    error: null,
    inFlight
  });

  return inFlight;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "job_text_updated") {
    const tabId = _sender?.tab?.id;
    if (typeof tabId !== "number") {
      sendResponse?.({ ok: false, error: "Content message missing tab id." });
      return true;
    }

    analyzeAndCacheForTab({
      tabId,
      text: message.text,
      pageUrl: message.pageUrl || _sender?.tab?.url || "",
      source: message.source || "content_push"
    })
      .then((result) => sendResponse?.({ ok: true, status: "ready", result }))
      .catch((error) => sendResponse?.({ ok: false, status: "error", error: String(error) }));

    return true;
  }

  if (message?.type === "get_analysis_for_tab") {
    const tabId = Number(message.tabId);
    const entry = Number.isFinite(tabId) ? getStoreEntry(tabId) : null;
    if (!entry) {
      sendResponse({ ok: true, status: "missing" });
      return false;
    }

    if (entry.status === "loading") {
      sendResponse({ ok: true, status: "loading" });
      return false;
    }

    if (entry.status === "error") {
      sendResponse({ ok: false, status: "error", error: entry.error || "Analysis failed." });
      return false;
    }

    sendResponse({ ok: true, status: "ready", result: entry.result });
    return false;
  }

  if (message?.type !== "analyze_job") {
    return false;
  }

  (async () => {
    try {
      const text = (message.text || "").slice(0, 20000);
      if (!text.trim()) {
        sendResponse({ ok: false, error: "No job description text provided." });
        return;
      }

      const tabId = typeof _sender?.tab?.id === "number" ? _sender.tab.id : Number(message.tabId);
      if (!Number.isFinite(tabId)) {
        const result = await analyzeJobWithGemini(text, message.sourceUrl || "");
        sendResponse({ ok: true, result });
        return;
      }

      const result = await analyzeAndCacheForTab({
        tabId,
        text,
        pageUrl: message.sourceUrl || _sender?.tab?.url || "",
        source: "popup_pull"
      });
      sendResponse({ ok: true, result });
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
  })();

  return true;
});
