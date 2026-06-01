import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: { environment: "node", globalSetup: ["./src/test/global-setup.ts"], fileParallelism: false },
  resolve: { alias: { "@": resolve(__dirname, "./src") } },
});
