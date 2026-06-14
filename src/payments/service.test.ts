import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaymentAuditRecord } from "./types";

const originalCodesurfConfigDir = process.env.CODESURF_CONFIG_DIR;
const tempDirs: string[] = [];

afterEach(() => {
  vi.doUnmock("../utils/settings");
  vi.doUnmock("../wallet/manager");
  vi.doUnmock("./agentkit-loader");
  vi.doUnmock("./brin");
  vi.doUnmock("./history");
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalCodesurfConfigDir === undefined) delete process.env.CODESURF_CONFIG_DIR;
  else process.env.CODESURF_CONFIG_DIR = originalCodesurfConfigDir;
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function base64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf-8").toString("base64");
}

function paymentTermsHeader(): string {
  return base64Json({
    accepts: [
      {
        scheme: "exact",
        network: "base-sepolia",
        asset: "USDC",
        amount: "0.01",
      },
    ],
  });
}

async function importServiceWithMocks(options: {
  paidResponse: Response;
  record?: (entry: PaymentAuditRecord) => void;
}) {
  vi.resetModules();
  const recordMock = vi.fn<(entry: PaymentAuditRecord) => void>(options.record ?? (() => {}));
  const x402Fetch = vi.fn(async () => options.paidResponse);
  const fetchMock = vi.fn(async () => {
    return new Response("payment required", {
      status: 402,
      headers: { "payment-required": paymentTermsHeader() },
    });
  });

  vi.stubGlobal("fetch", fetchMock);
  vi.doMock("../utils/settings", () => ({
    loadPaymentSettings: () => ({
      enabled: true,
      chain: "base-sepolia",
      approval: { autoApprove: true },
    }),
  }));
  vi.doMock("../wallet/manager", () => ({
    WalletManager: class {
      static exists(): boolean {
        return true;
      }

      getStoredWallet(): { privateKey: `0x${string}`; address: string; chain: "base-sepolia"; createdAt: string } {
        return {
          privateKey: `0x${"1".repeat(64)}` as `0x${string}`,
          address: "0xwallet",
          chain: "base-sepolia",
          createdAt: "2026-06-14T00:00:00.000Z",
        };
      }
    },
  }));
  vi.doMock("./brin", () => ({
    scanUrl: vi.fn(async () => null),
  }));
  vi.doMock("./agentkit-loader", () => ({
    createX402Fetch: vi.fn(async () => x402Fetch),
  }));
  vi.doMock("./history", () => ({
    PaymentHistory: class {
      static getLogPath(): string {
        return "/tmp/payment_log.jsonl";
      }

      record(entry: PaymentAuditRecord): void {
        recordMock(entry);
      }
    },
  }));

  const { X402Service } = await import("./service");
  return { service: new X402Service(), recordMock };
}

describe("X402Service.paidRequest receipt handling", () => {
  it("surfaces an unparseable proof on a successful payment instead of recording txHash=null", async () => {
    const malformedProof = Buffer.from("{not-json", "utf-8").toString("base64");
    const { service, recordMock } = await importServiceWithMocks({
      paidResponse: new Response("paid body", {
        status: 200,
        headers: { "payment-response": malformedProof },
      }),
    });

    await expect(service.paidRequest({ url: "https://merchant.test/paid" })).rejects.toThrow(
      /Payment succeeded, but the payment proof header could not be parsed/,
    );
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("surfaces receipt write failures after a successful payment with transaction context", async () => {
    const { service, recordMock } = await importServiceWithMocks({
      paidResponse: new Response("paid body", {
        status: 200,
        headers: { "payment-response": base64Json({ transaction: "0xabc123" }) },
      }),
      record: () => {
        throw new Error("disk full");
      },
    });

    await expect(service.paidRequest({ url: "https://merchant.test/paid" })).rejects.toThrow(
      /Payment succeeded but the receipt could not be persisted .*tx=0xabc123.*disk full/,
    );
    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock.mock.calls[0]?.[0]).toMatchObject({
      status: "success",
      txHash: "0xabc123",
    });
  });
});

describe("PaymentHistory", () => {
  it("stores receipts in the Codesurf config directory", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codesurf-payment-history-test-"));
    tempDirs.push(tempDir);
    process.env.CODESURF_CONFIG_DIR = tempDir;
    vi.resetModules();
    vi.doUnmock("./history");

    const { PaymentHistory } = await import("./history");
    const logPath = path.join(tempDir, "payment_log.jsonl");
    expect(PaymentHistory.getLogPath()).toBe(logPath);

    new PaymentHistory().record({
      id: "receipt-1",
      sessionId: null,
      url: "https://merchant.test/paid",
      domain: "merchant.test",
      method: "GET",
      chain: "base-sepolia",
      network: "base-sepolia",
      asset: "USDC",
      amount: "0.01",
      txHash: "0xabc123",
      status: "success",
      createdAt: "2026-06-14T00:00:00.000Z",
    });

    expect(fs.readFileSync(logPath, "utf-8")).toContain('"txHash":"0xabc123"');
  });
});
