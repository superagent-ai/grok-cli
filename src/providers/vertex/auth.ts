import { GoogleAuth } from "google-auth-library";

import type { VertexAuthMode } from "../../utils/settings";

const VERTEX_AUTH_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"];

/**
 * Forwards to the global fetch so test environments and CLIs that override
 * `globalThis.fetch` (e.g. for proxying or recording) continue to work
 * through the Google auth client.
 */
const fetchImplementation: typeof fetch = (input, init) => globalThis.fetch(input, init);

/**
 * Singleton GoogleAuth client. Re-used across requests so token caching and
 * refresh handled by the client are not bypassed. Use resetVertexAuthClient
 * to clear it (test isolation, recovery from auth failure).
 */
let cachedAuthClient: GoogleAuth | undefined;

export interface VertexAuthOptions {
  mode: VertexAuthMode;
}

/**
 * Resolves a Google Cloud access token for Vertex AI requests.
 *
 * Currently only Application Default Credentials (`mode: "adc"`) is
 * supported. ADC looks up `gcloud auth application-default login`
 * credentials, GOOGLE_APPLICATION_CREDENTIALS, or workload identity, in
 * that order.
 *
 * Other auth modes (pre-minted OAuth bearer tokens, service-account-bound
 * API keys) are documented in the Vertex AI quickstart but require
 * additional settings/env wiring and live verification against the
 * Grok-on-Vertex endpoint before being safe to expose. Tracked as a
 * follow-up.
 */
export async function getVertexAccessToken(options: VertexAuthOptions): Promise<string> {
  if (options.mode !== "adc") {
    // VertexAuthMode currently narrows to "adc"; this branch is defensive
    // for the future when the type union widens.
    throw new Error(`Unsupported Vertex auth mode "${String(options.mode)}". Only "adc" is wired up.`);
  }
  return resolveAdcAccessToken();
}

/** Clears the cached GoogleAuth client. Call after an auth failure or in tests. */
export function resetVertexAuthClient(): void {
  cachedAuthClient = undefined;
}

async function resolveAdcAccessToken(): Promise<string> {
  if (!cachedAuthClient) {
    cachedAuthClient = new GoogleAuth({
      scopes: VERTEX_AUTH_SCOPES,
      clientOptions: {
        transporterOptions: {
          fetchImplementation,
        },
      },
    });
  }

  let token: string | null | undefined;
  try {
    token = await cachedAuthClient.getAccessToken();
  } catch (err: unknown) {
    throw new Error(formatVertexAuthErrorMessage(err));
  }

  if (!token) {
    throw new Error(
      "Could not obtain a Google Cloud access token from Application Default Credentials. Run `gcloud auth application-default login`, or configure ADC for this environment.",
    );
  }

  return token;
}

/**
 * Builds a human-friendly error message from whatever Google's auth client
 * actually threw. Detects the re-auth flow specifically because that's the
 * single most common failure when a long-lived ADC session expires.
 */
export function formatVertexAuthErrorMessage(err: unknown): string {
  const detail = extractGoogleAuthDetail(err);
  if (isReauthError(detail)) {
    return [
      "Google Application Default Credentials need reauthentication.",
      "",
      "Application Default Credentials (ADC) are the separate local credentials Google client libraries use; they are not the same as the active account shown by `gcloud auth list`.",
      "Run `gcloud auth application-default login` exactly as shown in another terminal, then return to Grok and retry Vertex auth.",
      "Verify ADC with `gcloud auth application-default print-access-token`.",
      "If that still fails, run `gcloud auth application-default revoke` and then `gcloud auth application-default login` again.",
      "For SSH/headless environments, use `gcloud auth application-default login --no-launch-browser`.",
    ].join("\n");
  }

  return [
    "Could not obtain a Google Cloud access token from Application Default Credentials.",
    detail ? `Google auth error: ${detail}` : "Google auth returned an unknown error.",
    "",
    "Application Default Credentials (ADC) are separate from the active account shown by `gcloud auth list`.",
    "Run `gcloud auth application-default login`, verify with `gcloud auth application-default print-access-token`, then retry Vertex auth.",
  ].join("\n");
}

function isReauthError(detail: string): boolean {
  return /invalid_rapt|invalid_grant|reauth|application-default login|cannot prompt/i.test(detail);
}

function extractGoogleAuthDetail(err: unknown): string {
  const fields = extractGoogleAuthFields(err);
  const joined = [fields.error, fields.errorDescription, fields.errorSubtype, fields.message]
    .filter(Boolean)
    .join(": ");
  if (joined) return joined;
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "";
}

function extractGoogleAuthFields(value: unknown): {
  error?: string;
  errorDescription?: string;
  errorSubtype?: string;
  message?: string;
} {
  if (typeof value === "string") {
    return parseGoogleAuthJson(value) ?? { message: value };
  }
  if (!value || typeof value !== "object") return {};

  const record = value as Record<string, unknown>;
  const data = getNestedRecord(record, "response", "data") ?? getNestedRecord(record, "data");
  const parsedMessage = typeof record.message === "string" ? parseGoogleAuthJson(record.message) : undefined;
  const source = data ?? parsedMessage ?? record;

  return {
    error: stringField(source, "error"),
    errorDescription: stringField(source, "error_description") ?? stringField(source, "errorDescription"),
    errorSubtype: stringField(source, "error_subtype") ?? stringField(source, "errorSubtype"),
    message: typeof record.message === "string" && !parsedMessage ? record.message : stringField(source, "message"),
  };
}

function parseGoogleAuthJson(value: string): Record<string, unknown> | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function getNestedRecord(record: Record<string, unknown>, ...path: string[]): Record<string, unknown> | undefined {
  let current: unknown = record;
  for (const part of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current && typeof current === "object" && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : undefined;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
