import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"]);
const TEST_SUFFIXES = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx", ".test.js", ".spec.js"];

export function isSourceCheckout(root) {
  return fs.existsSync(path.join(root, "src", "index.ts")) && fs.existsSync(path.join(root, "tsconfig.json"));
}

export function findLocalTsc(root) {
  const candidate = path.join(root, "node_modules", "typescript", "bin", "tsc");
  return fs.existsSync(candidate) ? candidate : null;
}

export function shouldRebuild(root, options = {}) {
  const env = options.env ?? process.env;
  if (env.GROK_SKIP_REBUILD) {
    return { needed: false, reason: "GROK_SKIP_REBUILD is set" };
  }
  if (!isSourceCheckout(root)) {
    return { needed: false, reason: "not a source checkout" };
  }

  const distIndex = path.join(root, "dist", "index.js");
  if (!fs.existsSync(distIndex)) {
    return { needed: true, reason: "dist/index.js is missing" };
  }

  const distMtime = fs.statSync(distIndex).mtimeMs;
  const watched = [
    path.join(root, "package.json"),
    path.join(root, "tsconfig.json"),
    ...listSourceFiles(path.join(root, "src")),
  ];

  for (const file of watched) {
    if (!fs.existsSync(file)) continue;
    if (fs.statSync(file).mtimeMs > distMtime) {
      return { needed: true, reason: `${toPosix(path.relative(root, file))} is newer than dist` };
    }
  }

  return { needed: false, reason: "dist is up to date" };
}

export function ensureBuilt(root, options = {}) {
  const decision = shouldRebuild(root, options);
  if (!decision.needed) {
    return { rebuilt: false, reason: decision.reason, status: 0 };
  }

  const runBuild = options.runBuild ?? defaultRunBuild;
  const result = runBuild(root);
  const status = typeof result?.status === "number" ? result.status : 1;
  if (status === 0) {
    return { rebuilt: true, reason: decision.reason, status: 0 };
  }

  const hasDist = fs.existsSync(path.join(root, "dist", "index.js"));
  return {
    rebuilt: false,
    reason: decision.reason,
    status: hasDist ? 0 : status,
  };
}

function defaultRunBuild(root) {
  const tsc = findLocalTsc(root);
  if (!tsc) {
    console.error("Cannot rebuild: TypeScript is not installed. Run `bun install` first.");
    return { status: 1 };
  }

  return spawnSync(process.execPath, [tsc, "-p", "tsconfig.json"], {
    cwd: root,
    stdio: "inherit",
  });
}

function listSourceFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(full, files);
      continue;
    }
    if (isTestFile(entry.name)) continue;
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }

  return files;
}

function isTestFile(name) {
  return TEST_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}
