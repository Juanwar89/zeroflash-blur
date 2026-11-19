/* ZeroFlash Blur - Shared helper for Popup & Options (i18n, constants) */

(function initZFCommon(globalScope) {
  if (globalScope.ZFCommon) return;

  const DETECTOR_KEYS = ["email", "currency", "card", "phone", "secret"];

  // Optional support / donations link
  const SUPPORT_URL = "https://ko-fi.com/juanwar89";

  const I18N = {
    en: {
      editionBadge: "FREE",
      unsupportedPage: "Chrome internal page (cannot inject)",
      manualLabel: "Manual",
      autoLabel: "Auto",
      pickBtn: "Click to Blur Elements",
      pickBtnActive: "Exit Blur Picker",
      panicBtn: "Panic Shield",
      panicBtnActive: "Resume Tab",
      pauseBtn: "Pause All",
      resumeBtn: "Resume Blur",
      blurIntensity: "Blur Intensity",
      clearBtn: "Clear Page",
      siteRulesTitle: "Zero-Flash Site Rules",
      autoProtectLabel: "Auto-protect on reload",
      autoProtectSub: "Instant CSS blur before first paint",
      autoDetectLabel: "Auto-blur sensitive data",
      autoDetectSub: "Emails, balances, cards & API keys",
      detEmail: "Emails",
      detCurrency: "$ Balances",
      detCard: "Cards",
      detPhone: "Phones",
      detSecret: "API Keys",
      supportLink: "Support this free project ♥",
      settingsBtn: "Settings",
      hoverPeekWarn: "Hover-to-peek (for local recording only)",
    },
    es: {
      editionBadge: "GRATIS",
      unsupportedPage: "Página interna de Chrome (no editable)",
      manualLabel: "Manual",
      autoLabel: "Auto",
      pickBtn: "Clic para Difuminar",
      pickBtnActive: "Salir del Selector",
      panicBtn: "Escudo Pánico",
      panicBtnActive: "Mostrar Pestaña",
      pauseBtn: "Pausar Todo",
      resumeBtn: "Reactivar Blur",
      blurIntensity: "Intensidad de Blur",
      clearBtn: "Limpiar Página",
      siteRulesTitle: "Reglas Zero-Flash del Sitio",
      autoProtectLabel: "Autoproteger al recargar",
      autoProtectSub: "Aplica CSS antes de pintar la página",
      autoDetectLabel: "Detectar datos sensibles",
      autoDetectSub: "Emails, saldos, tarjetas y claves API",
      detEmail: "Emails",
      detCurrency: "$ Saldos",
      detCard: "Tarjetas",
      detPhone: "Teléfonos",
      detSecret: "Claves API",
      supportLink: "Apoyar este proyecto gratis ♥",
      settingsBtn: "Ajustes",
      hoverPeekWarn: "Ver al pasar el mouse (solo grabación local)",
    },
  };

  async function getLang() {
    const { uiLang } = await chrome.storage.local.get(["uiLang"]);
    if (uiLang === "es" || uiLang === "en") return uiLang;
    return navigator.language && navigator.language.toLowerCase().startsWith("es")
      ? "es"
      : "en";
  }

  async function setLang(lang) {
    const normalized = lang === "es" ? "es" : "en";
    await chrome.storage.local.set({ uiLang: normalized });
    return normalized;
  }

  globalScope.ZFCommon = {
    DETECTOR_KEYS,
    SUPPORT_URL,
    I18N,
    getLang,
    setLang,
  };
})(window);
