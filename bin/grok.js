#!/usr/bin/env bun
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { ensureBuilt } from "./ensure-built.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = ensureBuilt(root);

if (result.status !== 0) {
  process.exit(result.status);
}

if (result.rebuilt) {
  process.stderr.write(`Rebuilt CLI (${result.reason}).\n`);
} else if (result.reason.includes("newer than dist")) {
  process.stderr.write(`Using last good dist (${result.reason}; rebuild failed).\n`);
}

await import(pathToFileURL(path.join(root, "dist", "index.js")).href);
