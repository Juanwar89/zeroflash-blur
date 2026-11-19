/* ZeroFlash Blur - Stable CSS selector generator for persistent element rules */

(function initZFSelector(globalScope) {
  if (globalScope.ZFSelector) return;

  const STABLE_ATTRS = ["data-testid", "data-test", "data-qa", "aria-label", "name"];
  // Skip CSS-in-JS hashes or ephemeral utility prefixes when building fallback paths
  const EPHEMERAL_CLASS_RE = /^(?:zf-|css-[a-z0-9]+|sc-[a-zA-Z0-9]+|jsx-\d+|_[a-zA-Z0-9]{5,})$/;
  const EPHEMERAL_ID_RE = /^(?::r[0-9a-z]+:|react-|headlessui-|radix-|ember\d+)/i;

  function isUnique(selector, expectedEl) {
    try {
      const found = document.querySelectorAll(selector);
      return found.length === 1 && found[0] === expectedEl;
    } catch {
      return false;
    }
  }

  function escapeAttrValue(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function getStableClasses(el) {
    if (!el.classList || el.classList.length === 0) return [];
    const stable = [];
    for (const cls of el.classList) {
      if (!cls || cls.length > 40) continue;
      if (EPHEMERAL_CLASS_RE.test(cls)) continue;
      if (/^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(cls)) {
        stable.push(cls);
      }
      if (stable.length >= 2) break;
    }
    return stable;
  }

  function getNthOfTypePart(el) {
    const tag = el.tagName.toLowerCase();
    const classes = getStableClasses(el);
    let part = tag;
    if (classes.length > 0) {
      part += classes.map((c) => "." + CSS.escape(c)).join("");
    }

    const parent = el.parentElement;
    if (!parent) return part;

    const siblingsSameTag = Array.from(parent.children).filter(
      (child) => child.tagName === el.tagName
    );
    if (siblingsSameTag.length > 1) {
      const idx = siblingsSameTag.indexOf(el) + 1;
      part += `:nth-of-type(${idx})`;
    }
    return part;
  }

  /**
   * Generate a minimal, resilient CSS selector that uniquely targets `el`.
   * @param {Element} el
   * @returns {string|null}
   */
  function generate(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
    if (el === document.documentElement || el === document.body) return null;

    // 1. Unique non-ephemeral ID
    if (el.id && !EPHEMERAL_ID_RE.test(el.id)) {
      const idSel = "#" + CSS.escape(el.id);
      if (isUnique(idSel, el)) return idSel;
    }

    // 2. Stable semantic attributes
    const tag = el.tagName.toLowerCase();
    for (const attr of STABLE_ATTRS) {
      const val = el.getAttribute(attr);
      if (!val || val.length > 120) continue;
      const attrSel = `${tag}[${attr}="${escapeAttrValue(val)}"]`;
      if (isUnique(attrSel, el)) return attrSel;
    }

    // 3. Build ancestor path until unique (capped at 6 levels)
    const segments = [];
    let current = el;
    let depth = 0;

    while (current && current.nodeType === Node.ELEMENT_NODE && depth < 6) {
      if (current === document.body || current === document.documentElement) {
        break;
      }

      if (current.id && !EPHEMERAL_ID_RE.test(current.id)) {
        const anchor = "#" + CSS.escape(current.id);
        segments.unshift(anchor);
        const candidate = segments.join(" > ");
        if (isUnique(candidate, el)) return candidate;
        break;
      }

      segments.unshift(getNthOfTypePart(current));
      const candidate = segments.join(" > ");
      if (isUnique(candidate, el)) return candidate;

      current = current.parentElement;
      depth += 1;
    }

    return segments.length > 0 ? segments.join(" > ") : null;
  }

  globalScope.ZFSelector = { generate };
})(window);
