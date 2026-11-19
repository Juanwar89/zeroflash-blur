/* ZeroFlash Blur - Popup Controller (Free Edition) */

(async function initPopup() {
  const { I18N, DETECTOR_KEYS, SUPPORT_URL, getLang, setLang } =
    window.ZFCommon;

  const els = {
    planBadge: document.getElementById("planBadge"),
    langToggle: document.getElementById("langToggle"),
    openOptionsBtn: document.getElementById("openOptionsBtn"),
    siteHost: document.getElementById("siteHost"),
    manualCount: document.getElementById("manualCount"),
    autoCount: document.getElementById("autoCount"),
    unsupportedNotice: document.getElementById("unsupportedNotice"),
    pickBtn: document.getElementById("pickBtn"),
    pickBtnText: document.getElementById("pickBtnText"),
    panicBtn: document.getElementById("panicBtn"),
    panicBtnText: document.getElementById("panicBtnText"),
    pauseBtn: document.getElementById("pauseBtn"),
    pauseBtnText: document.getElementById("pauseBtnText"),
    blurRange: document.getElementById("blurRange"),
    blurVal: document.getElementById("blurVal"),
    clearBtn: document.getElementById("clearBtn"),
    autoProtectToggle: document.getElementById("autoProtectToggle"),
    autoDetectToggle: document.getElementById("autoDetectToggle"),
    detectorChips: document.getElementById("detectorChips"),
    supportLink: document.getElementById("supportLink"),
  };

  els.supportLink.href = SUPPORT_URL;

  let lang = await getLang();
  let activeTab = null;
  let currentOrigin = null;
  let isSupportedTab = false;
  let pageStatus = {
    manualCount: 0,
    autoCount: 0,
    pickerActive: false,
    panicActive: false,
  };
  let storageState = {};

  function t(key) {
    return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
  }

  function applyTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const k = node.getAttribute("data-i18n");
      if (k) node.textContent = t(k);
    });
    els.langToggle.textContent = lang === "en" ? "ES" : "EN";
  }

  function isTabScriptable(url) {
    if (!url) return false;
    if (
      url.startsWith("https://chromewebstore.google.com") ||
      url.startsWith("https://chrome.google.com/webstore")
    ) {
      return false;
    }
    return (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("file://")
    );
  }

  async function ensureTabInjected() {
    if (!activeTab || !isSupportedTab) return null;
    const res = await chrome.runtime.sendMessage({
      type: "INJECT_TAB",
      tabId: activeTab.id,
    });
    if (!res || !res.ok) {
      throw new Error((res && res.error) || "Injection failed");
    }
    return res.status;
  }

  async function sendTabMessage(type) {
    if (!activeTab || !isSupportedTab) return null;
    try {
      return await chrome.tabs.sendMessage(activeTab.id, { type });
    } catch {
      await ensureTabInjected();
      return chrome.tabs.sendMessage(activeTab.id, { type });
    }
  }

  function render() {
    applyTranslations();

    els.planBadge.textContent = t("editionBadge");
    els.planBadge.className = "badge badge-free";

    if (!isSupportedTab) {
      els.siteHost.textContent = activeTab?.url
        ? activeTab.url.split("/")[0]
        : "Browser";
      els.unsupportedNotice.classList.remove("hidden");
      els.pickBtn.disabled = true;
      els.panicBtn.disabled = true;
      els.clearBtn.disabled = true;
      els.autoProtectToggle.disabled = true;
      els.autoDetectToggle.disabled = true;
    } else {
      const parsed = new URL(activeTab.url);
      els.siteHost.textContent = parsed.host || "Local File";
      els.unsupportedNotice.classList.add("hidden");
      els.pickBtn.disabled = false;
      els.panicBtn.disabled = false;
      els.clearBtn.disabled = false;
      els.autoProtectToggle.disabled = false;
      els.autoDetectToggle.disabled = false;
    }

    els.manualCount.textContent = String(pageStatus.manualCount || 0);
    els.autoCount.textContent = String(pageStatus.autoCount || 0);

    els.pickBtn.classList.toggle("is-active", Boolean(pageStatus.pickerActive));
    els.pickBtnText.textContent = pageStatus.pickerActive
      ? t("pickBtnActive")
      : t("pickBtn");

    els.panicBtn.classList.toggle("is-active", Boolean(pageStatus.panicActive));
    els.panicBtnText.textContent = pageStatus.panicActive
      ? t("panicBtnActive")
      : t("panicBtn");

    const paused = Boolean(storageState.paused);
    els.pauseBtn.classList.toggle("is-active", paused);
    els.pauseBtnText.textContent = paused ? t("resumeBtn") : t("pauseBtn");

    const blurPx =
      typeof storageState.blurPx === "number" ? storageState.blurPx : 10;
    els.blurRange.value = String(blurPx);
    els.blurVal.textContent = `${blurPx}px`;

    const siteRule =
      (currentOrigin &&
        storageState.siteRules &&
        storageState.siteRules[currentOrigin]) ||
      {};
    els.autoProtectToggle.checked = Boolean(siteRule.autoProtect);
    els.autoDetectToggle.checked = Boolean(siteRule.autoDetect);

    const showChips = Boolean(siteRule.autoDetect);
    els.detectorChips.classList.toggle("hidden", !showChips);
    const detectors = storageState.autoDetectors || {};
    els.detectorChips.querySelectorAll(".chip").forEach((chip) => {
      const key = chip.getAttribute("data-det");
      chip.classList.toggle("active", Boolean(detectors[key]));
    });
  }

  async function refreshState() {
    storageState = await chrome.storage.local.get([
      "blurPx",
      "paused",
      "autoDetectors",
      "siteRules",
    ]);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab || null;
    isSupportedTab = Boolean(activeTab && isTabScriptable(activeTab.url));

    if (isSupportedTab) {
      currentOrigin = new URL(activeTab.url).origin;
      try {
        const status = await ensureTabInjected();
        if (status) pageStatus = status;
      } catch {
        isSupportedTab = false;
      }
    }

    render();
  }

  async function updateSiteRule(patch) {
    if (!currentOrigin) return;
    const { siteRules = {} } = await chrome.storage.local.get(["siteRules"]);
    const current = siteRules[currentOrigin] || {
      autoProtect: false,
      autoDetect: false,
      selectors: [],
    };
    siteRules[currentOrigin] = { ...current, ...patch };
    await chrome.storage.local.set({ siteRules });
    storageState.siteRules = siteRules;
    await sendTabMessage("SYNC_STATE");
  }

  async function handleSiteToggle(field, checked) {
    if (!checked) {
      const patch =
        field === "autoProtect"
          ? { autoProtect: false, autoDetect: false }
          : { autoDetect: false };
      await updateSiteRule(patch);
      render();
      return;
    }

    // Request host permission ONLY for the current HTTP(S) origin
    if (
      currentOrigin &&
      (currentOrigin.startsWith("https://") || currentOrigin.startsWith("http://"))
    ) {
      const pattern = `${currentOrigin}/*`;
      const already = await chrome.permissions.contains({ origins: [pattern] });
      if (!already) {
        await chrome.storage.local.set({
          pendingSiteEnable: { origin: currentOrigin, field },
        });
        const granted = await chrome.permissions.request({ origins: [pattern] });
        if (!granted) {
          await chrome.storage.local.set({ pendingSiteEnable: null });
          render();
          return;
        }
      }
    }

    const patch =
      field === "autoDetect"
        ? { autoProtect: true, autoDetect: true }
        : { autoProtect: true };
    await updateSiteRule(patch);
    await chrome.runtime.sendMessage({ type: "SYNC_DYNAMIC_SCRIPTS" });
    const status = await sendTabMessage("SYNC_STATE");
    if (status) pageStatus = status;
    render();
  }

  // --- Event Bindings ---
  els.langToggle.addEventListener("click", async () => {
    lang = await setLang(lang === "en" ? "es" : "en");
    render();
  });

  els.openOptionsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  els.pickBtn.addEventListener("click", async () => {
    const status = await sendTabMessage("TOGGLE_PICKER");
    if (status) {
      pageStatus = status;
      render();
      if (status.pickerActive) {
        window.close();
      }
    }
  });

  els.panicBtn.addEventListener("click", async () => {
    const status = await sendTabMessage("TOGGLE_PANIC");
    if (status) {
      pageStatus = status;
      render();
    }
  });

  els.pauseBtn.addEventListener("click", async () => {
    const nextPaused = !Boolean(storageState.paused);
    await chrome.storage.local.set({ paused: nextPaused });
    storageState.paused = nextPaused;
    await sendTabMessage("SYNC_STATE");
    render();
  });

  els.blurRange.addEventListener("input", async (e) => {
    const val = Number(e.target.value);
    els.blurVal.textContent = `${val}px`;
    storageState.blurPx = val;
    await chrome.storage.local.set({ blurPx: val });
  });

  els.clearBtn.addEventListener("click", async () => {
    const status = await sendTabMessage("CLEAR_MANUAL_BLURS");
    if (status) {
      pageStatus = status;
      render();
    }
  });

  els.autoProtectToggle.addEventListener("change", (e) => {
    handleSiteToggle("autoProtect", e.target.checked);
  });

  els.autoDetectToggle.addEventListener("change", (e) => {
    handleSiteToggle("autoDetect", e.target.checked);
  });

  els.detectorChips.addEventListener("click", async (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const key = chip.getAttribute("data-det");
    if (!DETECTOR_KEYS.includes(key)) return;

    const current = storageState.autoDetectors || {};
    const next = { ...current, [key]: !current[key] };
    storageState.autoDetectors = next;
    await chrome.storage.local.set({ autoDetectors: next });
    const status = await sendTabMessage("SYNC_STATE");
    if (status) pageStatus = status;
    render();
  });

  await refreshState();
})();
