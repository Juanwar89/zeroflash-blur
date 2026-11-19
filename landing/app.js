(function initLanding() {
  const I18N = {
    en: {
      navDemo: "Live Sandbox",
      navPricing: "Features & Support",
      heroPill: "Chrome Extension • Zero-Flash Architecture",
      heroTitle:
        "Share your screen without leaking balances, emails, or API keys.",
      heroSub:
        "Click-to-blur any element, auto-hide sensitive data on live calls, and reload dashboards with zero split-second data flashes — without breaking React or modern web apps.",
      ctaPrimary: "Try Interactive Sandbox",
      ctaSecondary: "See Included Features",
      trust1: "✓ 100% Local detection (no data leaves your browser)",
      trust2: "✓ All features free — no paywall",
      trust3: "✓ No subscription fatigue",
      feat1Title: "Zero-Flash on Reload",
      feat1Body:
        "Saved CSS rules inject before first paint so sensitive numbers never flash for half a second during live Zoom or Loom recordings.",
      feat2Title: "SPA-Safe Engine",
      feat2Body:
        "Built with non-destructive styling and CSS Highlight ranges so Stripe, Gmail, Notion, and React apps never crash.",
      feat3Title: "100% Free & Open",
      feat3Body:
        "Click-to-blur, Panic Shield, persistent Zero-Flash site rules, and smart auto-detection are all unlocked for free with zero accounts required.",
      sandboxTitle: "Interactive Extension Test Sandbox",
      sandboxSub:
        "Load ZeroFlash Blur in Chrome and test Click-to-Blur, Auto-Detect, Reload Persistence, and SPA Updates right here.",
      addRowBtn: "+ Simulate SPA Row Update",
      kpi1: "Available Payout Balance",
      kpi2: "Monthly Net Revenue",
      kpi3: "Support Contact",
      secretLabel: "Production Webhook / API Key",
      cardLabel: "Corporate Test Card",
      freeTierTitle: "ZeroFlash Blur Free",
      free1: "Click-to-blur any element + Instant Panic Shield (Alt+Shift+P)",
      proPopular: "ALL FEATURES INCLUDED",
      onceLabel: "100% free",
      pro1: "Zero-Flash persistent rules per domain",
      pro2: "Smart Auto-Blur (Emails, $, Cards, Phones, API Keys)",
      pro3: "Adjustable blur intensity, Pause toggle & JSON export",
      supportTierTitle: "Optional Support",
      supportPrice: "Donate",
      sup1: "Zero ads, zero tracking, zero subscriptions",
      sup2: "Built as an independent developer tool",
      sup3: "Optional contribution if it saves you on calls",
      buyNowBtn: "Support this project ♥",
    },
    es: {
      navDemo: "Sandbox en Vivo",
      navPricing: "Funciones y Apoyo",
      heroPill: "Extensión de Chrome • Arquitectura Zero-Flash",
      heroTitle:
        "Comparte pantalla sin filtrar saldos, correos ni claves API.",
      heroSub:
        "Haz clic para difuminar cualquier elemento, oculta datos sensibles automáticamente en llamadas y recarga paneles sin parpadeos de datos ni romper apps web.",
      ctaPrimary: "Probar Sandbox Interactivo",
      ctaSecondary: "Ver Funciones Incluidas",
      trust1: "✓ Detección 100% local (nada sale de tu navegador)",
      trust2: "✓ Todas las funciones gratis — sin muros de pago",
      trust3: "✓ Sin suscripciones mensuales molestas",
      feat1Title: "Cero Parpadeos al Recargar",
      feat1Body:
        "Las reglas CSS guardadas se inyectan antes de pintar la página para que tus cifras nunca se filtren medio segundo en vivo.",
      feat2Title: "Compatible con SPAs",
      feat2Body:
        "Estilos no destructivos y CSS Highlight ranges para que Stripe, Gmail, Notion y React sigan funcionando intactos.",
      feat3Title: "100% Gratis y Sin Cuentas",
      feat3Body:
        "Selector manual, Escudo Pánico, reglas Zero-Flash persistentes y autodetección inteligente desbloqueados gratis sin registros.",
      sandboxTitle: "Sandbox Interactivo para Probar la Extensión",
      sandboxSub:
        "Carga ZeroFlash Blur en Chrome y prueba aquí el selector, autodetección, recarga sin parpadeos y mutaciones dinámicas SPA.",
      addRowBtn: "+ Simular Fila Dinámica SPA",
      kpi1: "Saldo Disponible de Pago",
      kpi2: "Ingresos Netos del Mes",
      kpi3: "Correo de Soporte",
      secretLabel: "Clave API / Webhook de Prueba",
      cardLabel: "Tarjeta Corporativa de Prueba",
      freeTierTitle: "ZeroFlash Blur Gratis",
      free1: "Clic para difuminar cualquier elemento + Escudo Pánico (Alt+Shift+P)",
      proPopular: "TODAS LAS FUNCIONES INCLUIDAS",
      onceLabel: "100% gratis",
      pro1: "Reglas Zero-Flash persistentes por dominio",
      pro2: "Auto-Blur inteligente (Emails, $, Tarjetas, Teléfonos, API Keys)",
      pro3: "Intensidad ajustable, pausa rápida y exportar reglas JSON",
      supportTierTitle: "Apoyo Opcional",
      supportPrice: "Donación",
      sup1: "Sin anuncios, sin rastreo, sin suscripciones",
      sup2: "Herramienta independiente creada por un desarrollador",
      sup3: "Aporte voluntario si te ahorra filtraciones en vivo",
      buyNowBtn: "Apoyar este proyecto ♥",
    },
  };

  let lang = navigator.language && navigator.language.toLowerCase().startsWith("es")
    ? "es"
    : "en";

  const langBtn = document.getElementById("langBtn");
  const secretEl = document.getElementById("demoSecretEl");
  const addRowBtn = document.getElementById("addDynamicRowBtn");
  const tableBody = document.getElementById("sandboxTableBody");

  // Assemble clearly synthetic token at runtime for sandbox testing
  secretEl.textContent = ["sk", "test", "ZeroFlashSandboxDemo9876543210"].join("_");

  function applyLang() {
    const dict = I18N[lang];
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const k = el.getAttribute("data-i18n");
      if (dict[k]) el.textContent = dict[k];
    });
    langBtn.textContent = lang === "en" ? "ES" : "EN";
  }

  langBtn.addEventListener("click", () => {
    lang = lang === "en" ? "es" : "en";
    applyLang();
  });

  let dynamicIdx = 1;
  const sampleRows = [
    ["Elena Torres", "elena.torres@fintech-demo.co", "+52 55 1234 5678", "$6,410.00"],
    ["David Kim", "dkim@cloud-ops.dev", "+1 206 555 0144", "$920.75"],
    ["Sofia Mendez", "sofia@estudio-latam.es", "+34 612 345 678", "EUR 2,150.00"],
  ];

  addRowBtn.addEventListener("click", () => {
    const rowData = sampleRows[(dynamicIdx - 1) % sampleRows.length];
    dynamicIdx += 1;
    const tr = document.createElement("tr");
    for (const cellText of rowData) {
      const td = document.createElement("td");
      td.textContent = cellText;
      tr.appendChild(td);
    }
    tableBody.appendChild(tr);
  });

  applyLang();
})();
