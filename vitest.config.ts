/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/client/test-setup.ts"],
    environmentMatchGlobs: [
      ["src/client/**", "jsdom"],
      ["src/server/**", "node"],
      ["src/shared/**", "node"],
    ],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/server/services/**/*.ts", "src/shared/**/*.ts"],
      thresholds: {
        statements: 80,
      },
    },
  },
});
