import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export function loadCustomInstructions(): string | null {
  const candidates = [path.join(process.cwd(), ".grok", "GROK.md"), path.join(os.homedir(), ".grok", "GROK.md")];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, "utf-8").trim();
      }
    } catch {}
  }

  return null;
}
