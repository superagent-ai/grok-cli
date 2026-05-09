import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getAccessTokenMock, googleAuthCtor } = vi.hoisted(() => {
  const getAccessTokenMock = vi.fn();
  const googleAuthCtor = vi.fn(function GoogleAuth() {
    return { getAccessToken: getAccessTokenMock };
  });
  return { getAccessTokenMock, googleAuthCtor };
});

vi.mock("google-auth-library", () => ({
  GoogleAuth: googleAuthCtor,
}));

beforeEach(() => {
  vi.resetModules();
  getAccessTokenMock.mockReset();
  googleAuthCtor.mockClear();
});

afterEach(() => {
  getAccessTokenMock.mockReset();
});

describe("getVertexAccessToken (adc)", () => {
  it("returns the ADC token when google-auth-library yields one", async () => {
    getAccessTokenMock.mockResolvedValue("adc-token-123");
    const auth = await import("./auth");
    const token = await auth.getVertexAccessToken({ mode: "adc" });
    expect(token).toBe("adc-token-123");
  });

  it("throws a descriptive error when ADC returns null/undefined", async () => {
    getAccessTokenMock.mockResolvedValue(null);
    const auth = await import("./auth");
    await expect(auth.getVertexAccessToken({ mode: "adc" })).rejects.toThrow(
      /Could not obtain a Google Cloud access token/,
    );
  });

  it("surfaces a re-auth message when ADC returns invalid_rapt", async () => {
    getAccessTokenMock.mockRejectedValue({
      response: { data: { error: "invalid_rapt", error_description: "Reauth required" } },
    });
    const auth = await import("./auth");
    await expect(auth.getVertexAccessToken({ mode: "adc" })).rejects.toThrow(/need reauthentication/);
  });

  it("surfaces a generic error message when ADC fails for an unknown reason", async () => {
    getAccessTokenMock.mockRejectedValue(new Error("network unreachable"));
    const auth = await import("./auth");
    await expect(auth.getVertexAccessToken({ mode: "adc" })).rejects.toThrow(/Google auth error: network unreachable/);
  });

  it("caches the GoogleAuth client across calls", async () => {
    getAccessTokenMock.mockResolvedValue("adc-token");
    const auth = await import("./auth");
    await auth.getVertexAccessToken({ mode: "adc" });
    await auth.getVertexAccessToken({ mode: "adc" });

    expect(googleAuthCtor).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the GoogleAuth client after resetVertexAuthClient", async () => {
    getAccessTokenMock.mockResolvedValue("adc-token");
    const auth = await import("./auth");
    await auth.getVertexAccessToken({ mode: "adc" });
    auth.resetVertexAuthClient();
    await auth.getVertexAccessToken({ mode: "adc" });

    expect(googleAuthCtor).toHaveBeenCalledTimes(2);
  });
});

describe("getVertexAccessToken (unsupported modes)", () => {
  it("throws a descriptive error when an unsupported mode is requested", async () => {
    const auth = await import("./auth");
    // Cast to bypass the union narrowing — defensive coverage for the day
    // VertexAuthMode widens beyond "adc".
    await expect(auth.getVertexAccessToken({ mode: "oauth_token" as unknown as "adc" })).rejects.toThrow(
      /Unsupported Vertex auth mode/,
    );
  });
});

describe("formatVertexAuthErrorMessage", () => {
  it("identifies invalid_grant as a re-auth scenario", async () => {
    const auth = await import("./auth");
    const message = auth.formatVertexAuthErrorMessage({
      response: { data: { error: "invalid_grant" } },
    });
    expect(message).toContain("need reauthentication");
  });

  it("falls back to generic guidance for unknown errors", async () => {
    const auth = await import("./auth");
    const message = auth.formatVertexAuthErrorMessage(new Error("DNS lookup failed"));
    expect(message).toContain("Google auth error: DNS lookup failed");
    expect(message).toContain("application-default login");
  });

  it("handles bare-string errors", async () => {
    const auth = await import("./auth");
    const message = auth.formatVertexAuthErrorMessage("something went wrong");
    expect(message).toContain("something went wrong");
  });

  it("handles JSON-string errors as if parsed", async () => {
    const auth = await import("./auth");
    const message = auth.formatVertexAuthErrorMessage('{"error":"invalid_rapt","error_description":"reauth needed"}');
    expect(message).toContain("need reauthentication");
  });
});
