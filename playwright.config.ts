import { defineConfig } from "@playwright/test";

const port = 4173;

export default defineConfig({
  testDir: "tests",
  timeout: 30000,
  webServer: {
    command: "pnpm exec vite dev --config tests/vite.config.ts --host 127.0.0.1 --port 4173",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
  },
});
