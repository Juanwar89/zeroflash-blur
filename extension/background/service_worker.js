/* ZeroFlash Blur - Background Service Worker (MV3) */

const AUTO_SCRIPT_ID = "zf-auto-core";

const DEFAULT_SETTINGS = {
  blurPx: 10,
  paused: false,
  hoverPeek: false,
  autoDetectors: {
    email: true,
    currency: true,
    card: true,
    phone: false,
    secret: true,
  },
  siteRules: {},
};

let registrationQueue = Promise.resolve();

async function ensureDefaults() {
  const existing = await chrome.storage.local.get(null);
  const patch = {};

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (existing[key] === undefined) {
      patch[key] = value;
    }
  }

  if (Object.keys(patch).length > 0) {
    await chrome.storage.local.set(patch);
  }
}

async function ensureInjected(tabId) {
  try {
    const status = await chrome.tabs.sendMessage(tabId, {
      type: "GET_PAGE_STATUS",
    });
    if (status) return status;
  } catch {
    // Not yet injected on this tab; proceed to inject cleanly
  }

  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["content/blur.css"],
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/detector.js", "content/selector.js", "content/content.js"],
  });

  return chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_STATUS" });
}

function syncDynamicContentScripts() {
  registrationQueue = registrationQueue.then(async () => {
    try {
      const perms = await chrome.permissions.getAll();
      const origins = (perms.origins || []).filter(
        (o) =>
          o === "<all_urls>" ||
          o.startsWith("http://") ||
          o.startsWith("https://")
      );

      await chrome.scripting
        .unregisterContentScripts({ ids: [AUTO_SCRIPT_ID] })
        .catch(() => {});

      if (origins.length > 0) {
        await chrome.scripting.registerContentScripts([
          {
            id: AUTO_SCRIPT_ID,
            matches: origins,
            js: [
              "content/detector.js",
              "content/selector.js",
              "content/content.js",
            ],
            css: ["content/blur.css"],
            runAt: "document_start",
            persistAcrossSessions: true,
          },
        ]);
      }
    } catch (err) {
      console.warn("ZeroFlash syncDynamicContentScripts warning:", err);
    }
  });
  return registrationQueue;
}

function buildSavedSelectorsCss(selectors, blurPx) {
  if (!Array.isArray(selectors) || selectors.length === 0) return "";
  const valid = selectors.filter((s) => typeof s === "string" && s.trim().length > 0);
  if (valid.length === 0) return "";
  const safePx = Math.max(2, Math.min(40, Number(blurPx) || 10));
  return `${valid.join(", ")} { filter: blur(${safePx}px) !important; user-select: none !important; }`;
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  await syncDynamicContentScripts();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  await syncDynamicContentScripts();
});

// Pre-inject saved CSS rules as early as possible on granted origins (Zero-Flash)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading" || !tab || !tab.url) return;
  if (!tab.url.startsWith("http://") && !tab.url.startsWith("https://")) return;

  try {
    const origin = new URL(tab.url).origin;
    const data = await chrome.storage.local.get([
      "paused",
      "blurPx",
      "siteRules",
    ]);
    if (data.paused) return;

    const rule = data.siteRules?.[origin];
    if (!rule || !rule.autoProtect || !rule.selectors?.length) return;

    const css = buildSavedSelectorsCss(rule.selectors, data.blurPx);
    if (!css) return;

    await chrome.scripting.insertCSS({
      target: { tabId },
      css,
    });
  } catch {
    // Tab navigated away or lacks permission; ignore cleanly
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  try {
    await ensureInjected(tab.id);
    if (command === "toggle-picker") {
      await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PICKER" });
    } else if (command === "toggle-panic") {
      await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANIC" });
    }
  } catch (err) {
    console.warn("ZeroFlash command failed:", err);
  }
});

chrome.permissions.onAdded.addListener(async (perms) => {
  const origins = perms.origins || [];
  if (origins.length === 0) return;

  const data = await chrome.storage.local.get(["pendingSiteEnable", "siteRules"]);
  const pending = data.pendingSiteEnable;
  if (pending && pending.origin) {
    const siteRules = data.siteRules || {};
    const current = siteRules[pending.origin] || {
      autoProtect: false,
      autoDetect: false,
      selectors: [],
    };
    if (pending.field === "autoProtect") current.autoProtect = true;
    if (pending.field === "autoDetect") {
      current.autoProtect = true;
      current.autoDetect = true;
    }
    siteRules[pending.origin] = current;
    await chrome.storage.local.set({ siteRules, pendingSiteEnable: null });
  }

  await syncDynamicContentScripts();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    try {
      await ensureInjected(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: "SYNC_STATE" });
    } catch {
      // Ignore non-scriptable tabs
    }
  }
});

chrome.permissions.onRemoved.addListener(async () => {
  await syncDynamicContentScripts();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === "INJECT_TAB") {
    ensureInjected(message.tabId)
      .then((status) => sendResponse({ ok: true, status }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === "SYNC_DYNAMIC_SCRIPTS") {
    syncDynamicContentScripts()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  return false;
});
