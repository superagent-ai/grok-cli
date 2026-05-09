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

describe("getVertexAccessToken (oauth_token)", () => {
  it("returns the explicit token verbatim", async () => {
    const auth = await import("./auth");
    const token = await auth.getVertexAccessToken({ mode: "oauth_token", oauthToken: "ya29.explicit-token" });
    expect(token).toBe("ya29.explicit-token");
  });

  it("trims whitespace from the explicit token", async () => {
    const auth = await import("./auth");
    const token = await auth.getVertexAccessToken({ mode: "oauth_token", oauthToken: "  ya29.token  " });
    expect(token).toBe("ya29.token");
  });

  it("throws when no token is provided", async () => {
    const auth = await import("./auth");
    await expect(auth.getVertexAccessToken({ mode: "oauth_token" })).rejects.toThrow(/no token was provided/);
  });

  it("does not call google-auth-library", async () => {
    const auth = await import("./auth");
    await auth.getVertexAccessToken({ mode: "oauth_token", oauthToken: "abc" });
    expect(getAccessTokenMock).not.toHaveBeenCalled();
  });
});

describe("getVertexAccessToken (service_account_api_key)", () => {
  it("returns the API key verbatim", async () => {
    const auth = await import("./auth");
    const token = await auth.getVertexAccessToken({ mode: "service_account_api_key", apiKey: "AIza-test-key" });
    expect(token).toBe("AIza-test-key");
  });

  it("throws when no API key is provided", async () => {
    const auth = await import("./auth");
    await expect(auth.getVertexAccessToken({ mode: "service_account_api_key" })).rejects.toThrow(
      /no API key was provided/,
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
