/* ZeroFlash Blur - Settings Page Controller (Free Edition) */

(async function initOptions() {
  const { SUPPORT_URL } = window.ZFCommon;

  const els = {
    statusMsg: document.getElementById("statusMsg"),
    hoverPeekToggle: document.getElementById("hoverPeekToggle"),
    sitesList: document.getElementById("sitesList"),
    exportBtn: document.getElementById("exportBtn"),
    importInput: document.getElementById("importInput"),
    supportBtn: document.getElementById("supportBtn"),
  };

  els.supportBtn.href = SUPPORT_URL;

  function showMessage(text, isError) {
    els.statusMsg.textContent = text;
    els.statusMsg.className = `msg ${isError ? "err" : "ok"}`;
    els.statusMsg.classList.remove("hidden");
  }

  function renderSites(siteRules) {
    els.sitesList.textContent = "";
    const entries = Object.entries(siteRules || {});
    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No saved site rules yet.";
      els.sitesList.appendChild(empty);
      return;
    }

    for (const [origin, rule] of entries) {
      const item = document.createElement("div");
      item.className = "site-item";

      const left = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = origin;

      const meta = document.createElement("div");
      meta.className = "site-meta";
      const selectorCount = Array.isArray(rule.selectors)
        ? rule.selectors.length
        : 0;
      meta.textContent = `Selectors: ${selectorCount} • Auto-Protect: ${
        rule.autoProtect ? "ON" : "OFF"
      } • Auto-Detect: ${rule.autoDetect ? "ON" : "OFF"}`;

      left.append(title, meta);

      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-danger";
      delBtn.textContent = "Remove";
      delBtn.addEventListener("click", async () => {
        const data = await chrome.storage.local.get(["siteRules"]);
        const nextRules = { ...(data.siteRules || {}) };
        delete nextRules[origin];
        await chrome.storage.local.set({ siteRules: nextRules });

        if (origin.startsWith("http://") || origin.startsWith("https://")) {
          await chrome.permissions
            .remove({ origins: [`${origin}/*`] })
            .catch(() => {});
        }
        await chrome.runtime.sendMessage({ type: "SYNC_DYNAMIC_SCRIPTS" });
        renderSites(nextRules);
      });

      item.append(left, delBtn);
      els.sitesList.appendChild(item);
    }
  }

  async function renderAll() {
    const data = await chrome.storage.local.get([
      "hoverPeek",
      "autoDetectors",
      "siteRules",
    ]);

    els.hoverPeekToggle.checked = Boolean(data.hoverPeek);

    const dets = data.autoDetectors || {};
    document.querySelectorAll("input[data-det]").forEach((cb) => {
      const k = cb.getAttribute("data-det");
      cb.checked = Boolean(dets[k]);
    });

    renderSites(data.siteRules || {});
  }

  els.hoverPeekToggle.addEventListener("change", async (e) => {
    await chrome.storage.local.set({ hoverPeek: e.target.checked });
  });

  document.querySelectorAll("input[data-det]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const { autoDetectors = {} } = await chrome.storage.local.get([
        "autoDetectors",
      ]);
      const k = cb.getAttribute("data-det");
      autoDetectors[k] = cb.checked;
      await chrome.storage.local.set({ autoDetectors });
    });
  });

  els.exportBtn.addEventListener("click", async () => {
    const { siteRules = {}, autoDetectors = {}, blurPx = 10 } =
      await chrome.storage.local.get(["siteRules", "autoDetectors", "blurPx"]);
    const blob = new Blob(
      [JSON.stringify({ version: 1, blurPx, autoDetectors, siteRules }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zeroflash-blur-rules.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  els.importInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed.siteRules !== "object") {
        throw new Error("Invalid rules JSON");
      }
      const cleanRules = {};
      for (const [origin, rule] of Object.entries(parsed.siteRules)) {
        if (
          typeof origin === "string" &&
          (origin.startsWith("https://") || origin.startsWith("http://")) &&
          rule &&
          typeof rule === "object"
        ) {
          cleanRules[origin] = {
            autoProtect: Boolean(rule.autoProtect),
            autoDetect: Boolean(rule.autoDetect),
            selectors: Array.isArray(rule.selectors)
              ? rule.selectors.filter((s) => typeof s === "string")
              : [],
          };
        }
      }
      const patch = { siteRules: cleanRules };
      if (typeof parsed.blurPx === "number") patch.blurPx = parsed.blurPx;
      await chrome.storage.local.set(patch);
      showMessage("Rules imported successfully.", false);
      await renderAll();
    } catch {
      showMessage("Failed to import JSON file.", true);
    } finally {
      e.target.value = "";
    }
  });

  await renderAll();
})();
