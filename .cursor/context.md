# Grok CLI – Cursor Context

Kurze Referenz für zukünftige Arbeit an diesem Projekt. Das vollständige Chat-Transcript liegt in **`cursor_project_explanation.md`** in diesem Ordner.

---

## Durchgeführte Anpassungen (Feb 2026)

### 1. xAI 410 Deprecation (Live Search)
- **Problem:** API antwortete mit `410 "Live search is deprecated. Please switch to the Agent Tools API"`.
- **Lösung:** Alle `search_parameters` aus den API-Requests entfernt (kein `mode: "auto"` / `mode: "off"` mehr).
- **Geänderte Dateien:** `src/grok/client.ts`, `src/agent/grok-agent.ts`.
- **Entfernt:** `SearchParameters`/`SearchOptions`, Methode `shouldUseSearchFor()`.
- Eingebauter Grok-Web-/X-Search ist damit abgeschaltet; eigener `search`-Tool (ripgrep) und andere Tools unverändert.

### 2. Syntax-Highlighting
- Chalk-basierter Highlighter in `src/ui/utils/code-colorizer.tsx` (JS/TS, Python, Bash, JSON, generisch).
- **Chat:** Dateiinhalte (view_file/create_file) werden mit Syntax-Highlighting gerendert (`chat-history.tsx`).
- **Diffs:** Geänderte Zeilen in `diff-renderer.tsx` mit Highlighting.
- Hilfsfunktion `getLanguageFromFilename()` für Spracherkennung aus Dateinamen.

### 3. Dependencies
- **OpenAI SDK:** auf `^6.17.0` upgegradet (Kompatibilität mit xAI).
- **MCP SDK:** bewusst bei `^1.17.0` belassen (1.25+ hat Breaking Changes bei Client-Capabilities und CallToolResult).

### 4. xAI Responses API (geplant, nicht umgesetzt)
- Migrationsplan in **`docs/xai-responses-api-migration.md`**.
- README verweist darauf. Später: Wechsel von Chat Completions auf Responses API für native web_search/x_search etc.

### 5. Keine system-spezifischen Tools
- Keine Ubuntu/System-Tools (apt, systemctl, disk, network) gewünscht; nur die bestehenden CLI-Tools.

---

## Relevante Branches / Commits
- Branch: `fix/depreciation`
- Commits: 410-Fix + Syntax + Dependencies + Docs; `package-lock.json`; `docs/xai-responses-api-migration.md`; ggf. weitere kleine Docs-Updates.

---

Zusammen mit **`cursor_project_explanation.md`** (Export unseres Chats) hast du hier den vollen Kontext für spätere Cursor-Sessions in diesem Projekt.
