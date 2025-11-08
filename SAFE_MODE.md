# Safe Mode Guide — Grok CLI

Grok CLI is powerful — it can read, edit, and even execute commands from model suggestions.  
To protect you and your system, **Safe Mode** is **enabled by default**.

---

## 🔒 Safe Mode Levels

| Level | Description | Default |
|-------|-------------|---------|
| `interactive` | CLI asks before running or writing any command | ✅ Default |
| `semi-automated` | CLI previews commands and asks for confirmation once per session | ⚠️ Optional |
| `automated` | CLI runs commands directly without asking | 🚫 Not recommended |

---

## ⚙️ Changing Safe Mode

You can change Safe Mode **globally**:

```bash
grok config safetyLevel semi-automated
````

Or **per session**:

```bash
grok --safetyLevel automated
```

---

## 🛡️ Safety Flags

Grok CLI provides additional flags to enhance safety:

| Flag                 | Description                                            |
| -------------------- | ------------------------------------------------------ |
| `--dry-run`          | Preview the changes or commands without executing them |
| `--confirm`          | Force explicit confirmation before running any command |
| `--never-send-files` | Prevent any file content from being uploaded to APIs   |

**Usage example:**

```bash
grok --dry-run --prompt "refactor example.js"
grok --confirm --prompt "delete unused files"
```

> Recommended for critical projects or sensitive environments.

---
