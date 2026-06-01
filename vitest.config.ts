import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./src/test/global-setup.ts"],
    setupFiles: ["./src/test/setup.ts"],
    fileParallelism: false,
  },
  resolve: { alias: { "@": resolve(__dirname, "./src") } },
});
