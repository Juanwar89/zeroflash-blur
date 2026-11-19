/* ZeroFlash Blur - Core Content Engine (Zero-Flash + SPA-safe) */

(function initZFContent(globalScope) {
  if (globalScope.__ZF_CONTENT_LOADED__) return;
  globalScope.__ZF_CONTENT_LOADED__ = true;

  const IGNORED_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEMPLATE",
    "SVG",
    "CANVAS",
    "VIDEO",
    "AUDIO",
    "IFRAME",
  ]);

  const CONTAINER_TAGS = new Set([
    "HTML",
    "BODY",
    "MAIN",
    "SECTION",
    "ARTICLE",
    "HEADER",
    "FOOTER",
    "NAV",
    "ASIDE",
    "FORM",
    "TABLE",
    "TBODY",
    "THEAD",
    "UL",
    "OL",
  ]);

  const HUD_IDS = new Set([
    "zf-picker-highlight",
    "zf-picker-hud",
    "zf-panic-shield",
  ]);

  const DEFAULT_DETECTORS = {
    email: true,
    currency: true,
    card: true,
    phone: false,
    secret: true,
  };

  let state = {
    blurPx: 10,
    paused: false,
    hoverPeek: false,
    autoDetectors: { ...DEFAULT_DETECTORS },
    siteRule: {
      autoProtect: false,
      autoDetect: false,
      selectors: [],
    },
  };

  let pickerActive = false;
  let panicActive = false;
  let hoveredTarget = null;
  let highlightBox = null;
  let pickerHud = null;
  let panicShield = null;
  let mutationObserver = null;
  let scanTimer = null;
  let scanningCloakTimer = null;
  let lastInlineRanges = [];

  const origin = window.location.origin;

  function isOwnUi(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (HUD_IDS.has(el.id)) return true;
    return Boolean(
      el.closest("#zf-picker-hud, #zf-panic-shield, #zf-picker-highlight")
    );
  }

  function removeScanningCloak() {
    if (scanningCloakTimer) {
      clearTimeout(scanningCloakTimer);
      scanningCloakTimer = null;
    }
    if (document.documentElement) {
      document.documentElement.classList.remove("zf-scanning");
    }
  }

  function applyRootVisualFlags() {
    const root = document.documentElement;
    if (!root) return;
    root.style.setProperty("--zf-blur-px", `${state.blurPx}px`);
    if (state.paused) {
      root.setAttribute("data-zf-paused", "true");
    } else {
      root.removeAttribute("data-zf-paused");
    }
    if (state.hoverPeek) {
      root.setAttribute("data-zf-peek", "true");
    } else {
      root.removeAttribute("data-zf-peek");
    }
  }

  function applySavedSelectors() {
    const selectors = state.siteRule?.selectors || [];
    for (const sel of selectors) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          if (!isOwnUi(el)) {
            el.setAttribute("data-zf-manual-blur", "true");
            el.setAttribute("data-zf-saved-rule", sel);
          }
        }
      } catch {
        // Ignore malformed legacy selectors safely
      }
    }
  }

  function isAutoDetectActive() {
    return Boolean(state.siteRule?.autoDetect);
  }

  function updateHighlights(ranges) {
    if (!globalScope.CSS || !CSS.highlights) return;
    if (ranges.length === 0) {
      CSS.highlights.delete("zf-sensitive");
      return;
    }
    try {
      const hl = new Highlight(...ranges);
      CSS.highlights.set("zf-sensitive", hl);
    } catch {
      // Fallback safely if any range became invalid mid-render
    }
  }

  function clearAutoBlurs() {
    const blurred = document.querySelectorAll("[data-zf-auto-blur]");
    for (const el of blurred) {
      el.removeAttribute("data-zf-auto-blur");
    }
    lastInlineRanges = [];
    if (globalScope.CSS && CSS.highlights) {
      CSS.highlights.delete("zf-sensitive");
    }
  }

  function shouldBlurLeafParent(parent, totalMatchLen) {
    if (!parent || isOwnUi(parent)) return false;
    if (CONTAINER_TAGS.has(parent.tagName)) return false;
    if (parent.isContentEditable) return false;
    if (parent.children.length > 0) return false;
    const fullText = (parent.textContent || "").trim();
    if (fullText.length === 0) return false;
    return fullText.length <= 120 || totalMatchLen / fullText.length >= 0.4;
  }

  function scanDocument() {
    if (!isAutoDetectActive()) {
      clearAutoBlurs();
      removeScanningCloak();
      return;
    }

    const detector = globalScope.ZFDetector;
    if (!detector || !document.body) {
      removeScanningCloak();
      return;
    }

    const enabled = state.autoDetectors || DEFAULT_DETECTORS;

    // 1. Scan text inputs and textareas cleanly without altering value
    const inputs = document.querySelectorAll(
      'input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea'
    );
    for (const input of inputs) {
      if (isOwnUi(input)) continue;
      const val = input.value || "";
      const spans = detector.findSensitiveSpans(val, enabled);
      if (spans.length > 0) {
        input.setAttribute("data-zf-auto-blur", spans[0].kind);
      } else if (input.hasAttribute("data-zf-auto-blur")) {
        input.removeAttribute("data-zf-auto-blur");
      }
    }

    // 2. Clear stale element auto-blurs that no longer contain sensitive data
    const previousAutoEls = document.querySelectorAll(
      "[data-zf-auto-blur]:not(input):not(textarea)"
    );
    const activeAutoEls = new Set();
    const inlineRanges = [];

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (IGNORED_TAGS.has(parent.tagName) || isOwnUi(parent)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (!node.nodeValue || node.nodeValue.trim().length < 4) {
            return NodeFilter.FILTER_SKIP;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    let textNode;
    while ((textNode = walker.nextNode()) !== null) {
      const text = textNode.nodeValue;
      const spans = detector.findSensitiveSpans(text, enabled);
      if (spans.length === 0) continue;

      const parent = textNode.parentElement;
      const totalMatched = spans.reduce((acc, s) => acc + (s.end - s.start), 0);

      if (shouldBlurLeafParent(parent, totalMatched)) {
        parent.setAttribute("data-zf-auto-blur", spans[0].kind);
        activeAutoEls.add(parent);
      } else if (globalScope.CSS && CSS.highlights) {
        for (const span of spans) {
          try {
            const range = document.createRange();
            range.setStart(textNode, span.start);
            range.setEnd(textNode, span.end);
            inlineRanges.push(range);
          } catch {
            // Skip invalid offsets safely
          }
        }
      } else if (parent && !CONTAINER_TAGS.has(parent.tagName)) {
        parent.setAttribute("data-zf-auto-blur", spans[0].kind);
        activeAutoEls.add(parent);
      }
    }

    for (const prevEl of previousAutoEls) {
      if (!activeAutoEls.has(prevEl)) {
        prevEl.removeAttribute("data-zf-auto-blur");
      }
    }

    lastInlineRanges = inlineRanges;
    updateHighlights(inlineRanges);
    removeScanningCloak();
  }

  function scheduleScan(delayMs = 80) {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      applySavedSelectors();
      scanDocument();
    }, delayMs);
  }

  function ensureObserver() {
    const needsObserver =
      isAutoDetectActive() || (state.siteRule?.selectors?.length || 0) > 0;

    if (!needsObserver) {
      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
      }
      return;
    }

    if (mutationObserver || !document.documentElement) return;

    // Observe structure/text only — never attributes, preventing self-trigger loops
    mutationObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.target && isOwnUi(m.target)) continue;
        scheduleScan(90);
        return;
      }
    });

    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  async function loadStateFromStorage() {
    const data = await chrome.storage.local.get([
      "blurPx",
      "paused",
      "hoverPeek",
      "autoDetectors",
      "siteRules",
    ]);

    state.blurPx = typeof data.blurPx === "number" ? data.blurPx : 10;
    state.paused = Boolean(data.paused);
    state.hoverPeek = Boolean(data.hoverPeek);
    state.autoDetectors = {
      ...DEFAULT_DETECTORS,
      ...(data.autoDetectors || {}),
    };

    const allSiteRules = data.siteRules || {};
    state.siteRule = allSiteRules[origin] || {
      autoProtect: false,
      autoDetect: false,
      selectors: [],
    };
  }

  async function saveSelectorToSiteRule(selector, add) {
    if (!selector) return;
    const data = await chrome.storage.local.get(["siteRules"]);
    const allSiteRules = data.siteRules || {};
    const current = allSiteRules[origin] || {
      autoProtect: false,
      autoDetect: false,
      selectors: [],
    };
    const nextSet = new Set(current.selectors || []);
    if (add) {
      nextSet.add(selector);
    } else {
      nextSet.delete(selector);
    }
    current.selectors = Array.from(nextSet);
    allSiteRules[origin] = current;
    state.siteRule = current;
    await chrome.storage.local.set({ siteRules: allSiteRules });
  }

  // --- Picker UI ---
  function positionHighlight(el) {
    if (!highlightBox || !el || isOwnUi(el)) {
      if (highlightBox) highlightBox.style.display = "none";
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      highlightBox.style.display = "none";
      return;
    }
    highlightBox.style.display = "block";
    highlightBox.style.top = `${Math.max(0, rect.top)}px`;
    highlightBox.style.left = `${Math.max(0, rect.left)}px`;
    highlightBox.style.width = `${rect.width}px`;
    highlightBox.style.height = `${rect.height}px`;
    if (el.getAttribute("data-zf-manual-blur") === "true") {
      highlightBox.classList.add("zf-is-blurred");
    } else {
      highlightBox.classList.remove("zf-is-blurred");
    }
  }

  function onPickerMouseMove(e) {
    if (!pickerActive) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target === document.documentElement || target === document.body || isOwnUi(target)) {
      hoveredTarget = null;
      if (highlightBox) highlightBox.style.display = "none";
      return;
    }
    hoveredTarget = target;
    positionHighlight(target);
  }

  async function onPickerClick(e) {
    if (!pickerActive) return;
    if (isOwnUi(e.target)) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const target = hoveredTarget || e.target;
    if (!target || target === document.documentElement || target === document.body) {
      return;
    }

    const alreadyBlurred = target.getAttribute("data-zf-manual-blur") === "true";
    if (alreadyBlurred) {
      const savedSel = target.getAttribute("data-zf-saved-rule");
      target.removeAttribute("data-zf-manual-blur");
      target.removeAttribute("data-zf-saved-rule");
      if (savedSel) {
        await saveSelectorToSiteRule(savedSel, false);
      }
    } else {
      target.setAttribute("data-zf-manual-blur", "true");
      if (globalScope.ZFSelector) {
        const sel = globalScope.ZFSelector.generate(target);
        if (sel) {
          target.setAttribute("data-zf-saved-rule", sel);
          await saveSelectorToSiteRule(sel, true);
        }
      }
    }
    positionHighlight(target);
  }

  function onPickerKeyDown(e) {
    if (!pickerActive) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      stopPicker();
    }
  }

  function startPicker() {
    if (pickerActive) return;
    pickerActive = true;

    if (!highlightBox) {
      highlightBox = document.createElement("div");
      highlightBox.id = "zf-picker-highlight";
      document.documentElement.appendChild(highlightBox);
    }

    if (!pickerHud) {
      pickerHud = document.createElement("div");
      pickerHud.id = "zf-picker-hud";
      const dot = document.createElement("span");
      dot.className = "zf-hud-dot";
      const label = document.createElement("span");
      label.textContent = "ZeroFlash Picker: Click to blur/unblur";
      const doneBtn = document.createElement("button");
      doneBtn.type = "button";
      doneBtn.textContent = "Done (Esc)";
      doneBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        stopPicker();
      });
      pickerHud.append(dot, label, doneBtn);
      document.documentElement.appendChild(pickerHud);
    }

    document.addEventListener("mousemove", onPickerMouseMove, true);
    document.addEventListener("click", onPickerClick, true);
    document.addEventListener("keydown", onPickerKeyDown, true);
  }

  function stopPicker() {
    if (!pickerActive) return;
    pickerActive = false;
    hoveredTarget = null;

    document.removeEventListener("mousemove", onPickerMouseMove, true);
    document.removeEventListener("click", onPickerClick, true);
    document.removeEventListener("keydown", onPickerKeyDown, true);

    if (highlightBox) {
      highlightBox.remove();
      highlightBox = null;
    }
    if (pickerHud) {
      pickerHud.remove();
      pickerHud = null;
    }
  }

  // --- Full-Tab Panic Shield ---
  function togglePanicShield(forceState) {
    const next = typeof forceState === "boolean" ? forceState : !panicActive;
    panicActive = next;
    if (panicActive) {
      if (!panicShield) {
        panicShield = document.createElement("div");
        panicShield.id = "zf-panic-shield";
        const title = document.createElement("div");
        title.className = "zf-shield-title";
        title.textContent = "Screen Hidden — Privacy Shield Active";
        const sub = document.createElement("div");
        sub.className = "zf-shield-sub";
        sub.textContent = "Press Alt+Shift+P or click below to resume viewing.";
        const resumeBtn = document.createElement("button");
        resumeBtn.type = "button";
        resumeBtn.textContent = "Resume Tab";
        resumeBtn.addEventListener("click", () => togglePanicShield(false));
        panicShield.append(title, sub, resumeBtn);
        document.documentElement.appendChild(panicShield);
      }
    } else if (panicShield) {
      panicShield.remove();
      panicShield = null;
    }
    return panicActive;
  }

  function clearManualBlursOnPage() {
    const manualEls = document.querySelectorAll('[data-zf-manual-blur="true"]');
    for (const el of manualEls) {
      el.removeAttribute("data-zf-manual-blur");
      el.removeAttribute("data-zf-saved-rule");
    }
  }

  function getPageStatus() {
    const manualCount = document.querySelectorAll(
      '[data-zf-manual-blur="true"]'
    ).length;
    const autoElCount = document.querySelectorAll("[data-zf-auto-blur]").length;
    return {
      origin,
      manualCount,
      autoCount: autoElCount + lastInlineRanges.length,
      pickerActive,
      panicActive,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === "GET_PAGE_STATUS") {
      sendResponse(getPageStatus());
      return false;
    }

    if (message.type === "TOGGLE_PICKER") {
      if (pickerActive) stopPicker();
      else startPicker();
      sendResponse(getPageStatus());
      return false;
    }

    if (message.type === "TOGGLE_PANIC") {
      togglePanicShield();
      sendResponse(getPageStatus());
      return false;
    }

    if (message.type === "CLEAR_MANUAL_BLURS") {
      clearManualBlursOnPage();
      sendResponse(getPageStatus());
      return false;
    }

    if (message.type === "SYNC_STATE") {
      loadStateFromStorage().then(() => {
        applyRootVisualFlags();
        applySavedSelectors();
        scanDocument();
        ensureObserver();
        sendResponse(getPageStatus());
      });
      return true;
    }

    return false;
  });

  // React cleanly when user edits storage from Popup or Options
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    loadStateFromStorage().then(() => {
      applyRootVisualFlags();
      applySavedSelectors();
      scanDocument();
      ensureObserver();
    });
  });

  // Live input protection when auto-detect is enabled
  document.addEventListener(
    "input",
    (e) => {
      if (!isAutoDetectActive()) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        scheduleScan(220);
      }
    },
    true
  );

  // --- Bootstrap with Anti-Flash Protection ---
  async function bootstrap() {
    const isInitialLoad = document.readyState === "loading";
    if (isInitialLoad && document.documentElement) {
      document.documentElement.classList.add("zf-scanning");
      scanningCloakTimer = setTimeout(removeScanningCloak, 350);
    }

    await loadStateFromStorage();
    applyRootVisualFlags();

    const runInitialPass = () => {
      applySavedSelectors();
      scanDocument();
      ensureObserver();
      removeScanningCloak();
    };

    if (document.readyState === "loading") {
      // Only keep cloak if this site actually has saved rules or auto-detect enabled
      const hasActiveProtection =
        state.siteRule?.autoDetect ||
        (state.siteRule?.selectors?.length || 0) > 0;
      if (!hasActiveProtection) {
        removeScanningCloak();
      }
      document.addEventListener("DOMContentLoaded", runInitialPass, {
        once: true,
      });
    } else {
      runInitialPass();
    }
  }

  bootstrap();
})(window);
