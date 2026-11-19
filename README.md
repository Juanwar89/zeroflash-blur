# ZeroFlash Blur — Screen Share Privacy

Chrome Extension (**Manifest V3**) that visually blurs sensitive on-screen information during screen sharing, video calls, and product demos — without data flashes on reload or breaking modern SPAs (React, Gmail, Stripe, Notion).

## Key Features
- **Click-to-Blur Picker (`Alt+Shift+B`):** Hover and click any element to blur or unblur it instantly.
- **Instant Panic Shield (`Alt+Shift+P`):** Cover the entire active tab with a frosted privacy shield.
- **Zero-Flash Reload Protection:** Saved per-domain CSS rules inject before first paint so sensitive data never flashes when refreshing.
- **SPA-Safe Smart Auto-Blur:** 100% local regex + Luhn detection for emails, currency balances, credit cards, phone numbers, and API keys using non-destructive CSS & Highlight ranges.
- **100% Local & Private:** Zero external tracking, zero accounts, and no data leaves your browser.

## Load Locally in Chrome
1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the `extension/` folder.
3. Serve `landing/` locally (`python -m http.server 8080 --directory landing`) to try the interactive test sandbox.

## Privacy Policy & Support
- Privacy Policy: [PRIVACY.md](PRIVACY.md)
- Support this free project: https://ko-fi.com/juanwar89
