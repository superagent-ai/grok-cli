import { beforeEach, describe, expect, it, vi } from "vitest";

const googleAuthConstructor = vi.hoisted(() => vi.fn());
const getAccessTokenMock = vi.hoisted(() => vi.fn(async () => "adc-token"));

vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    constructor(options: unknown) {
      googleAuthConstructor(options);
    }

    async getAccessToken() {
      return getAccessTokenMock();
    }
  },
}));

describe("Vertex auth", () => {
  beforeEach(() => {
    vi.resetModules();
    googleAuthConstructor.mockClear();
    getAccessTokenMock.mockReset();
    getAccessTokenMock.mockResolvedValue("adc-token");
  });

  it("passes an explicit fetch implementation to google-auth-library", async () => {
    const { getVertexAccessToken } = await import("./vertex-auth");

    await expect(getVertexAccessToken()).resolves.toBe("adc-token");

    expect(googleAuthConstructor).toHaveBeenCalledWith({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      clientOptions: {
        transporterOptions: {
          fetchImplementation: expect.any(Function),
        },
      },
    });
  });

  it("turns invalid_rapt refresh failures into an actionable ADC reauth message", async () => {
    getAccessTokenMock.mockRejectedValueOnce({
      response: {
        data: {
          error: "invalid_grant",
          error_description: "reauth related error (invalid_rapt)",
          error_subtype: "invalid_rapt",
        },
      },
    });
    const { getVertexAccessToken } = await import("./vertex-auth");

    let message = "";
    try {
      await getVertexAccessToken();
    } catch (caught: unknown) {
      message = caught instanceof Error ? caught.message : String(caught);
    }

    expect(message).toContain("Google Application Default Credentials need reauthentication.");
    expect(message).toContain("gcloud auth application-default login");
    expect(message).toContain("gcloud auth application-default revoke");
    expect(message).not.toContain('{"error"');
  });

  it("reuses the GoogleAuth client so token caching can work", async () => {
    const { getVertexAccessToken } = await import("./vertex-auth");

    await expect(getVertexAccessToken()).resolves.toBe("adc-token");
    await expect(getVertexAccessToken()).resolves.toBe("adc-token");

    expect(googleAuthConstructor).toHaveBeenCalledTimes(1);
    expect(getAccessTokenMock).toHaveBeenCalledTimes(2);
  });
});
