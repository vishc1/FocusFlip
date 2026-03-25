# ⚡ FocusFlip

**AI-powered focus guardian that detects when you sit down, scores the current page, and flips you to something productive.**

---

## Demo App (Fastest — just open in browser)

```bash
# From the focusflip/ folder:
open index.html
# or double-click index.html in Finder
```

> Requires internet for TensorFlow.js CDN. Camera permission needed for live detection.

### Demo flow for judges

1. Open `index.html` in Chrome
2. Click **YouTube Shorts** in the quick-pick examples → see score: ~14/100
3. Step away from camera (no one detected)
4. Step back in → camera detects you → overlay fires automatically
5. Watch the countdown, or click "Go Now →"
6. Then click **Khan Academy** → score: ~92/100 → "No redirect needed ✓"

---

## Chrome Extension (Real tab monitoring)

### Load the extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `focusflip/extension/` folder
5. Pin FocusFlip to your toolbar

### What it does

- Click the extension icon → popup shows current tab score
- Click **FocusFlip Now** → injects the overlay into the active tab
- Overlay counts down 5s then redirects to a smarter page

---

## How scoring works

> "We use lightweight AI-inspired page classification based on URL metadata and content signals to estimate an educational productivity score."

| Score     | Category                                          |
|-----------|---------------------------------------------------|
| 10–35     | Entertainment, social media, gaming, streaming    |
| 36–65     | Neutral browsing, news, general content           |
| 66–96     | Khan Academy, Quizlet, Wikipedia, Docs, LMS sites |

### Smart redirect — based on *why* the page is bad

| Bad page type   | Redirects to       | Why                             |
|-----------------|--------------------|---------------------------------|
| Entertainment   | Khan Academy 📚    | Replace passive with active     |
| Social media    | Quizlet 📝         | Channel social energy to study  |
| Gaming          | Code.org 💻        | Keep the interactive energy     |
| Shopping        | Google Docs 📄     | Back to the assignment          |

---

## Tech stack

- **HTML / CSS / JS** — zero build step, zero dependencies beyond CDN
- **TensorFlow.js + COCO-SSD** — real person detection via webcam
- **Chrome Extension Manifest V3** — real tab monitoring + redirect injection
- **Rule-based scorer** — fast, interpretable, demo-safe

---

## Pitch in one line

> FocusFlip detects when a student sits down, scores the current webpage for educational value, and instantly redirects to a productive alternative — all without any server, app install, or student login.
