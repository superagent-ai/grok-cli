import * as fs from "fs";
import * as path from "path";
import { getCodesurfConfigDir } from "../utils/config-dir";
import type { PaymentAuditRecord } from "./types";

function syncDirectory(dirPath: string): void {
  const fd = fs.openSync(dirPath, "r");
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export class PaymentHistory {
  static getLogPath(): string {
    return path.join(getCodesurfConfigDir(), "payment_log.jsonl");
  }

  record(entry: PaymentAuditRecord): void {
    const logPath = PaymentHistory.getLogPath();
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 });
      const fd = fs.openSync(logPath, "a", 0o600);
      try {
        fs.writeFileSync(fd, `${JSON.stringify(entry)}\n`, { encoding: "utf-8" });
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      syncDirectory(path.dirname(logPath));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to persist payment receipt at ${logPath}: ${msg}`, { cause: err });
    }
  }

  list(limit = 20): PaymentAuditRecord[] {
    const logPath = PaymentHistory.getLogPath();
    if (!fs.existsSync(logPath)) return [];

    const lines = fs
      .readFileSync(logPath, "utf-8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const records: PaymentAuditRecord[] = [];
    for (let i = lines.length - 1; i >= 0 && records.length < limit; i -= 1) {
      const line = lines[i];
      if (!line) continue;
      try {
        records.push(JSON.parse(line) as PaymentAuditRecord);
      } catch {
        // Skip malformed lines so one bad entry doesn't break the whole log.
      }
    }
    return records;
  }
}
