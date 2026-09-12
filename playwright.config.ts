import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",

  timeout: 30_000,

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",

    // Use the Chrome already installed on the system instead
    // of requiring Playwright's bundled Chromium download.
    launchOptions: {
      executablePath: "/usr/bin/google-chrome",
    },

    // Useful for debugging failed E2E tests.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },

    {
      name: "mobile",
      use: {
        ...devices["Pixel 5"],
      },
    },
  ],

  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : [
        {
          // Mock-backed API (deterministic, no keys, no live network).
          command: "npx tsx src/server/index.ts",
          port: 3000,
          reuseExistingServer: true,
          timeout: 60_000,
          env: { NODE_ENV: "test", GROQ_API_KEY: "", PORT: "3000" },
        },
        {
          command: "npm run dev",
          port: 5173,
          reuseExistingServer: true,
          timeout: 60_000,
        },
      ],
});
