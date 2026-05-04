import fs from "fs";
import path from "path";

export function findGitRoot(start: string): string | null {
  let current = start;

  while (true) {
    const gitPath = path.join(current, ".git");
    if (isValidGitMarker(gitPath)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function isValidGitMarker(gitPath: string): boolean {
  try {
    const stat = fs.statSync(gitPath);
    if (stat.isDirectory()) return isValidGitDir(gitPath);
    if (!stat.isFile()) return false;

    const content = fs.readFileSync(gitPath, "utf8").trim();
    const match = content.match(/^gitdir:\s*(.+)$/i);
    if (!match?.[1]) return false;

    const gitDir = path.resolve(path.dirname(gitPath), match[1]);
    return isValidGitDir(gitDir);
  } catch {
    return false;
  }
}

function isValidGitDir(gitDir: string): boolean {
  try {
    const headPath = path.join(gitDir, "HEAD");
    if (!fs.statSync(headPath).isFile()) return false;
    return fs.readFileSync(headPath, "utf8").trim().length > 0;
  } catch {
    return false;
  }
}
