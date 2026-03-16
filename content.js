(() => {
  const selectorsByHost = {
    "linkedin.com": [
      ".jobs-description-content__text",
      ".jobs-box__html-content",
      ".show-more-less-html__markup",
      "div.jobs-description"
    ],
    "naukri.com": [
      ".job-desc",
      ".dang-inner-html",
      "section.styles_JDC__dang-inner-html__h0K4t",
      "div.styles_job-desc-container__txpYf"
    ],
    "internshala.com": [
      ".text-container",
      ".internship_details",
      "#internship_details",
      "div.internship_meta"
    ],
    "indeed.com": [
      "#jobDescriptionText",
      ".jobsearch-JobComponent-description",
      "#jobDescription",
      "div[data-testid='jobsearch-JobComponent-description']"
    ]
  };

  const jobPageSignalsByHost = {
    "linkedin.com": [/\/jobs\//i, /currentJobId=/i],
    "naukri.com": [/\/job-listings/i, /\/jobs\//i],
    "internshala.com": [/\/internship\//i, /\/job\//i],
    "indeed.com": [/\/viewjob/i, /jk=/i]
  };

  let lastSentText = "";
  let scanTimer = null;

  function normalizeWhitespace(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function getHostKey() {
    const hostname = window.location.hostname;
    return Object.keys(selectorsByHost).find((host) => hostname.includes(host));
  }

  function isJobPostingPage() {
    const hostKey = getHostKey();
    if (!hostKey) return false;

    const url = window.location.href;
    const patterns = jobPageSignalsByHost[hostKey] || [];
    const hasUrlSignal = patterns.some((pattern) => pattern.test(url));
    const hasDomSignal = (selectorsByHost[hostKey] || []).some((selector) => {
      const node = document.querySelector(selector);
      return !!(node && node.innerText && node.innerText.trim().length > 80);
    });

    return hasUrlSignal || hasDomSignal;
  }

  function readBySelectors(selectors) {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node && node.innerText && node.innerText.trim().length > 80) {
        return normalizeWhitespace(node.innerText);
      }
    }
    return "";
  }

  function readFallbackFromBody() {
    const bodyText = document.body ? document.body.innerText : "";
    return normalizeWhitespace(bodyText || "").slice(0, 12000);
  }

  function extractJobDescription() {
    if (!isJobPostingPage()) {
      return { text: "", source: "not_job_page" };
    }

    const hostKey = getHostKey();
    if (hostKey) {
      const fromSelectors = readBySelectors(selectorsByHost[hostKey]);
      if (fromSelectors) {
        return { text: fromSelectors, source: "selectors" };
      }
    }

    const fallback = readFallbackFromBody();
    return { text: fallback, source: "fallback" };
  }

  function sendJobTextUpdate(force = false) {
    const extracted = extractJobDescription();
    const text = extracted.text || "";

    if (!text || text.length < 120) {
      return;
    }

    if (!force && text === lastSentText) {
      return;
    }

    lastSentText = text;
    chrome.runtime.sendMessage({
      type: "job_text_updated",
      ok: true,
      isJobPosting: true,
      source: extracted.source,
      text,
      pageUrl: window.location.href,
      host: window.location.hostname
    });
  }

  function scheduleScan() {
    if (scanTimer) {
      window.clearTimeout(scanTimer);
    }

    scanTimer = window.setTimeout(() => {
      sendJobTextUpdate();
    }, 500);
  }

  function installObservers() {
    const observer = new MutationObserver(() => {
      scheduleScan();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: false,
      attributes: false
    });

    const originalPushState = history.pushState;
    history.pushState = function pushStatePatched(...args) {
      const result = originalPushState.apply(this, args);
      scheduleScan();
      return result;
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function replaceStatePatched(...args) {
      const result = originalReplaceState.apply(this, args);
      scheduleScan();
      return result;
    };

    window.addEventListener("popstate", scheduleScan);
    window.addEventListener("hashchange", scheduleScan);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "extract_job_text") {
      try {
        const result = extractJobDescription();
        sendResponse({ ok: true, isJobPosting: isJobPostingPage(), ...result });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
    }
    return true;
  });

  installObservers();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => sendJobTextUpdate(true));
  } else {
    sendJobTextUpdate(true);
  }
})();
