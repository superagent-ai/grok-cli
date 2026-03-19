import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export function loadCustomInstructions(): string | null {
  const candidates = [
    path.join(process.cwd(), ".grok", "GROK.md"),
    path.join(os.homedir(), ".grok", "GROK.md"),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, "utf-8").trim();
      }
    } catch {
      continue;
    }
  }

  return null;
}
