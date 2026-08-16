import { existsSync, readdirSync, statSync } from "fs";
import { isAbsolute, join, normalize, relative, resolve, sep } from "path";
import { readFile } from "../tools/file.js";
import { executeGrep } from "../tools/grep.js";

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "coverage", ".grok"]);

export type SeederToolName = "ls" | "find" | "grep" | "read";

export interface SeederToolCall {
  tool: SeederToolName;
  arguments: Record<string, unknown>;
}

export function confinePath(cwd: string, inputPath?: string): string | null {
  const root = resolve(cwd);
  const target = resolve(root, inputPath?.trim() ? inputPath : ".");
  if (target !== root && !target.startsWith(`${root}${sep}`)) return null;
  return target;
}

export async function runSeederTool(cwd: string, call: SeederToolCall): Promise<string> {
  const tool = call.tool;
  const args = call.arguments ?? {};
  if (tool === "ls") return runLs(cwd, asString(args.path), asNumber(args.limit, 80));
  if (tool === "find")
    return runFind(cwd, asString(args.pattern) || "*", asString(args.path), asNumber(args.limit, 40));
  if (tool === "grep") {
    const pattern = asString(args.pattern);
    if (!pattern) return "grep error: pattern is required";
    const result = await executeGrep(
      {
        pattern,
        path: asString(args.path) || undefined,
        include: asString(args.glob) || undefined,
      },
      cwd,
    );
    const text = result.success ? result.output || "No matches found." : result.error || "grep failed";
    return cap(text, 4000);
  }
  if (tool === "read") {
    const filePath = asString(args.path);
    if (!filePath) return "read error: path is required";
    const confined = confinePath(cwd, filePath);
    if (!confined) return `read error: path escapes workspace (${filePath})`;
    const offset = asNumber(args.offset, 1);
    const limit = asNumber(args.limit, 200);
    const result = readFile(filePath, cwd, offset, offset + limit - 1);
    return cap(result.output, 6000);
  }
  return `unknown tool: ${String(tool)}`;
}

function runLs(cwd: string, inputPath: string, limit: number): string {
  const confined = confinePath(cwd, inputPath);
  if (!confined) return `ls error: path escapes workspace (${inputPath})`;
  if (!existsSync(confined)) return `ls error: not found (${inputPath || "."})`;
  const entries = readdirSync(confined, { withFileTypes: true })
    .slice(0, Math.max(1, limit))
    .map((entry) => `${entry.isDirectory() ? "dir" : "file"} ${join(inputPath || ".", entry.name)}`);
  return entries.join("\n") || "(empty)";
}

function runFind(cwd: string, pattern: string, inputPath: string, limit: number): string {
  const confined = confinePath(cwd, inputPath);
  if (!confined) return `find error: path escapes workspace (${inputPath})`;
  const needle = pattern.replace(/^\*/, "").replace(/\*$/, "").toLowerCase();
  const matches: string[] = [];
  walk(confined, cwd, (rel, isDir) => {
    if (isDir) return;
    if (needle && !rel.toLowerCase().includes(needle) && !rel.split(sep).pop()?.toLowerCase().includes(needle)) return;
    matches.push(rel);
    return matches.length >= limit;
  });
  return matches.join("\n") || "No files found.";
}

function walk(absolute: string, cwd: string, visit: (rel: string, isDir: boolean) => boolean | undefined): void {
  let entries: Array<{ name: string; isDirectory: () => boolean }>;
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(absolute, entry.name);
    const rel = normalize(relative(cwd, full)) || entry.name;
    if (entry.isDirectory()) {
      if (visit(rel, true)) return;
      walk(full, cwd, visit);
    } else if (visit(rel, false)) {
      return;
    }
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function cap(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}\n…[truncated]`;
}

export function toRepoRelative(cwd: string, inputPath: string): string | null {
  const confined = confinePath(cwd, inputPath);
  if (!confined) return null;
  const rel = relative(resolve(cwd), confined);
  if (!rel || rel === ".") return null;
  if (rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return rel;
}

export function fileExistsInRepo(cwd: string, relPath: string): boolean {
  const confined = confinePath(cwd, relPath);
  if (!confined) return false;
  try {
    return existsSync(confined) && statSync(confined).isFile();
  } catch {
    return false;
  }
}
