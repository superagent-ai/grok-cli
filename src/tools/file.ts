import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve, isAbsolute } from "path";
import { createTwoFilesPatch } from "diff";

export interface FileDiff {
  filePath: string;
  additions: number;
  removals: number;
  patch: string;
  isNew: boolean;
}

export interface FileResult {
  success: boolean;
  output: string;
  diff?: FileDiff;
}

function resolvePath(filePath: string, cwd: string): string {
  return isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
}

function computeDiff(filePath: string, before: string, after: string): FileDiff {
  const patch = createTwoFilesPatch(filePath, filePath, before, after, "", "", {
    context: 3,
  });

  let additions = 0;
  let removals = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions++;
    if (line.startsWith("-") && !line.startsWith("---")) removals++;
  }

  return { filePath, additions, removals, patch, isNew: before === "" };
}

export function readFile(filePath: string, cwd: string, startLine?: number, endLine?: number): FileResult {
  try {
    const full = resolvePath(filePath, cwd);
    if (!existsSync(full)) {
      return { success: false, output: `File not found: ${filePath}` };
    }
    const content = readFileSync(full, "utf-8");
    const lines = content.split("\n");
    const totalLines = lines.length;

    const start = Math.max(0, (startLine ?? 1) - 1);
    const end = Math.min(totalLines, endLine ?? totalLines);
    const slice = lines.slice(start, end);

    const numbered = slice.map((line, i) => `${start + i + 1} | ${line}`).join("\n");
    const header = `[${filePath}: lines ${start + 1}-${end} of ${totalLines}]`;
    return { success: true, output: `${header}\n${numbered}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: `Failed to read file: ${msg}` };
  }
}

export function writeFile(filePath: string, content: string, cwd: string): FileResult {
  try {
    const full = resolvePath(filePath, cwd);
    const before = existsSync(full) ? readFileSync(full, "utf-8") : "";
    const dir = dirname(full);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(full, content, "utf-8");

    const diff = computeDiff(filePath, before, content);
    const verb = before === "" ? "Created" : "Updated";
    return {
      success: true,
      output: `${verb} ${filePath} (+${diff.additions} -${diff.removals})`,
      diff,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: `Failed to write file: ${msg}` };
  }
}

export function editFile(
  filePath: string,
  oldString: string,
  newString: string,
  cwd: string,
): FileResult {
  try {
    const full = resolvePath(filePath, cwd);
    if (!existsSync(full)) {
      return { success: false, output: `File not found: ${filePath}` };
    }
    const before = readFileSync(full, "utf-8");
    const count = before.split(oldString).length - 1;

    if (count === 0) {
      return { success: false, output: `old_string not found in ${filePath}` };
    }
    if (count > 1) {
      return {
        success: false,
        output: `old_string is not unique in ${filePath} (${count} occurrences). Include more surrounding context to make it unique.`,
      };
    }

    const after = before.replace(oldString, newString);
    writeFileSync(full, after, "utf-8");

    const diff = computeDiff(filePath, before, after);
    return {
      success: true,
      output: `Edited ${filePath} (+${diff.additions} -${diff.removals})`,
      diff,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: `Failed to edit file: ${msg}` };
  }
}
