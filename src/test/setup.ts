import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach } from "vitest";

const testUserSettingsPath = path.join(os.tmpdir(), `grok-cli-vitest-user-settings-${process.pid}.json`);

beforeEach(() => {
  process.env.GROK_USER_SETTINGS_PATH = testUserSettingsPath;
  rmSync(testUserSettingsPath, { force: true });
});
