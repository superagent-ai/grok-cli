# Safe Mode Guide — Grok CLI

Grok CLI is powerful — it can read, edit, and even execute commands from model suggestions.  
To protect you and your system, **Safe Mode** is **enabled by default**.

---

## 🔒 Safe Mode Levels

| Level | Description | Default |
|-------|--------------|----------|
| `interactive` | CLI asks before running or writing any command | ✅ Default |
| `semi-automated` | CLI previews command and asks for confirmation once | ⚠️ Optional |
| `automated` | CLI runs commands directly without asking | 🚫 Not recommended |

Change it globally:
```bash
grok config safetyLevel semi-automated
