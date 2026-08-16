import { getBundledPlugin } from "./catalog.js";

const GITHUB_OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?$/;
const GITHUB_REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const GITHUB_REF_RE = /^[A-Za-z0-9._/-]{1,200}$/;
const GITHUB_SUBDIR_RE = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;

export interface BundledPluginSpec {
  kind: "bundled";
  id: string;
}

export interface GitHubPluginSpec {
  kind: "github";
  owner: string;
  repo: string;
  ref: string;
  subdir: string;
  spec: string;
}

export interface InvalidPluginSpec {
  kind: "invalid";
  input: string;
  reason: "missing" | "unknown" | "unsafe";
}

export type PluginSpec = BundledPluginSpec | GitHubPluginSpec | InvalidPluginSpec;

export function parsePluginSpec(raw: string): PluginSpec {
  const input = raw.trim();
  if (!input) return { kind: "invalid", input, reason: "missing" };

  const bundled = getBundledPlugin(input);
  if (bundled) return { kind: "bundled", id: bundled.id };

  const github = parseGitHubSpec(input);
  if (github) return github;

  return { kind: "invalid", input, reason: looksLikeRemote(input) ? "unsafe" : "unknown" };
}

export function githubPluginId(spec: GitHubPluginSpec): string {
  const base = `${spec.owner}/${spec.repo}${spec.subdir ? `/${spec.subdir}` : ""}`;
  return spec.ref ? `${base}@${spec.ref}` : base;
}

function looksLikeRemote(input: string): boolean {
  return (
    input.includes("/") ||
    input.includes(":") ||
    input.startsWith(".") ||
    input.toLowerCase().includes("github") ||
    input.toLowerCase().includes("http")
  );
}

function parseGitHubSpec(input: string): GitHubPluginSpec | null {
  let rest = input;
  if (/^https:\/\//i.test(rest)) {
    try {
      const url = new URL(rest);
      if (url.protocol !== "https:") return null;
      if (url.hostname.toLowerCase() !== "github.com") return null;
      rest = url.pathname.replace(/^\/+|\/+$/g, "");
    } catch {
      return null;
    }
  } else if (/^github\.com\//i.test(rest)) {
    rest = rest.slice("github.com/".length);
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(rest)) {
    return null;
  }

  const at = rest.lastIndexOf("@");
  let ref = "";
  if (at > 0) {
    ref = rest.slice(at + 1);
    rest = rest.slice(0, at);
  }
  rest = rest.replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  const parts = rest.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const [owner, repo, ...subdirParts] = parts;
  if (!GITHUB_OWNER_RE.test(owner) || !GITHUB_REPO_RE.test(repo)) return null;
  if (ref && !GITHUB_REF_RE.test(ref)) return null;
  const subdir = subdirParts.join("/");
  if (subdir && (!GITHUB_SUBDIR_RE.test(subdir) || subdir.includes(".."))) return null;

  return {
    kind: "github",
    owner,
    repo,
    ref,
    subdir,
    spec: input,
  };
}
