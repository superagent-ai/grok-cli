# Privacy & Data Use Policy for Grok CLI

_Last updated: November 2025_

The Grok CLI enables developers to interact with the Grok (X.AI) model directly from the terminal.  
This document explains **what data may be sent**, **how it is handled**, and **how to stay safe**.

---

## 🔐 1. Data Sent to Third Parties

When you use Grok CLI features that call the Grok or Morph APIs, the following information **may be transmitted**:

| Type | Purpose | Sent to |
|------|---------|---------|
| User prompts (your questions) | Provide model responses | Grok API |
| Optional project file snippets | Provide context for editing | Grok API |
| Edit diffs (optional) | For "Fast Apply" edits | Morph API |
| Error telemetry (opt-in) | Debug and improve CLI | Maintainers (optional) |

> By default, **file uploads are disabled**.  
> You must explicitly opt-in to share code or context with `--allow-file-uploads` or in settings.

---

## ⚙️ 2. Local Storage

Local configuration is stored at:
- `~/.grok/user-settings.json`
- `.grok/settings.json`
- `.env` (optional)

These files contain preferences and API keys. They are **never uploaded automatically**.

---

## 🛡️ 3. API Keys

You must provide your own:
- `GROK_API_KEY`
- (Optional) `MORPH_API_KEY` (enables Fast Apply high-speed editing)

Keep them private.  
Do **not** commit `.env` files or user-settings to Git. The repository `.gitignore` protects this by default.

---

## 🧩 4. Telemetry

Telemetry is **disabled by default**.  
To enable anonymous usage metrics:

```bash
grok config telemetry true
````

To disable it again:

```bash
grok config telemetry false
```

---

## ⚠️ 5. Recommendations

* Review what data will be sent before confirming.
* Never include credentials, API keys, or internal-only code in prompts.
* Use `--never-send-files` in secure environments.
* Always use `--dry-run` before allowing command execution.

---
