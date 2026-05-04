import { GoogleAuth } from "google-auth-library";

const VERTEX_AUTH_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"];
const fetchImplementation: typeof fetch = (input, init) => globalThis.fetch(input, init);

export async function getVertexAccessToken(): Promise<string> {
  const auth = new GoogleAuth({
    scopes: VERTEX_AUTH_SCOPES,
    clientOptions: {
      transporterOptions: {
        fetchImplementation,
      },
    },
  });
  let token: string | null | undefined;
  try {
    token = await auth.getAccessToken();
  } catch (err: unknown) {
    throw new Error(formatVertexAuthErrorMessage(err));
  }

  if (!token) {
    throw new Error(
      "Could not obtain a Google Cloud access token from Application Default Credentials. Run `gcloud auth application-default login` or configure ADC for this environment.",
    );
  }

  return token;
}

export function formatVertexAuthErrorMessage(err: unknown): string {
  const detail = extractGoogleAuthDetail(err);
  if (isReauthError(detail)) {
    return [
      "Google Application Default Credentials need reauthentication.",
      "",
      "Run `gcloud auth application-default login` in a terminal, then restart `grok`.",
      "If that still fails, run `gcloud auth application-default revoke` and then `gcloud auth application-default login` again.",
      "For SSH/headless environments, use `gcloud auth application-default login --no-launch-browser`.",
    ].join("\n");
  }

  return [
    "Could not obtain a Google Cloud access token from Application Default Credentials.",
    detail ? `Google auth error: ${detail}` : "Google auth returned an unknown error.",
    "",
    "Run `gcloud auth application-default login` or configure ADC for this environment.",
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
