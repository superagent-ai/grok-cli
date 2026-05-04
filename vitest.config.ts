import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["dist/**", "node_modules/**", "tmp/**", ".claude/**", ".cursor/**"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
