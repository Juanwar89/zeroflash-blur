/* ZeroFlash Blur - Local sensitive-data pattern detector (zero network calls) */

(function initZFDetector(globalScope) {
  if (globalScope.ZFDetector) return;

  const PATTERNS = {
    email: /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,15}\b/g,
    secret:
      /\b(?:sk_(?:live|test)_[A-Za-z0-9]{16,80}|pk_(?:live|test)_[A-Za-z0-9]{16,80}|sk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{20,120}|gh[pousr]_[A-Za-z0-9_]{20,80}|AIza[0-9A-Za-z_-]{30,45}|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{10,80}|Bearer\s+[A-Za-z0-9\-._~+/=]{20,180})\b/g,
    card: /\b(?:\d[ -]?){12,18}\d\b/g,
    currency:
      /(?:-?\s?(?:US|CA|AU|NZ|HK|SG)?[$€£¥₩₹]|-?\b(?:USD|EUR|GBP|COP|MXN|ARS|CLP|PEN|BRL)\b)\s?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,4})?\b|-?\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,4})?\s?(?:USD|EUR|GBP|COP|MXN|ARS|CLP|PEN|BRL)\b/gi,
    phone:
      /(?<!\d)(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{3}[\s.-])\d{3,4}[\s.-]?\d{3,4}(?!\d)/g,
  };

  const ISO_DATE_RE = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/;

  function luhnCheck(digits) {
    if (digits.length < 13 || digits.length > 19) return false;
    if (/^(\d)\1+$/.test(digits)) return false;

    let sum = 0;
    let shouldDouble = false;
    for (let i = digits.length - 1; i >= 0; i -= 1) {
      let digit = digits.charCodeAt(i) - 48;
      if (digit < 0 || digit > 9) return false;
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  function isValidMatch(kind, rawText) {
    if (kind === "card") {
      const digits = rawText.replace(/[\s-]/g, "");
      return luhnCheck(digits);
    }
    if (kind === "phone") {
      const trimmed = rawText.trim();
      if (ISO_DATE_RE.test(trimmed)) return false;
      const digits = trimmed.replace(/\D/g, "");
      return digits.length >= 8 && digits.length <= 15;
    }
    return true;
  }

  /**
   * Scan a string and return non-overlapping sensitive spans sorted by start index.
   * @param {string} text
   * @param {Record<string, boolean>} enabledDetectors
   * @returns {Array<{kind: string, start: number, end: number, text: string}>}
   */
  function findSensitiveSpans(text, enabledDetectors) {
    if (!text || text.length < 4 || !enabledDetectors) return [];

    // Order prioritizes specific tokens before broader patterns like phone numbers.
    const order = ["secret", "email", "card", "currency", "phone"];
    const matches = [];

    for (const kind of order) {
      if (!enabledDetectors[kind]) continue;
      const regex = PATTERNS[kind];
      regex.lastIndex = 0;

      let m;
      while ((m = regex.exec(text)) !== null) {
        const value = m[0];
        const start = m.index;
        const end = start + value.length;

        if (!isValidMatch(kind, value)) {
          if (regex.lastIndex === m.index) regex.lastIndex += 1;
          continue;
        }

        const overlaps = matches.some(
          (existing) => start < existing.end && end > existing.start
        );
        if (!overlaps) {
          matches.push({ kind, start, end, text: value });
        }

        if (regex.lastIndex === m.index) regex.lastIndex += 1;
      }
    }

    matches.sort((a, b) => a.start - b.start);
    return matches;
  }

  globalScope.ZFDetector = {
    findSensitiveSpans,
    luhnCheck,
  };
})(window);
