import { defineConfig } from "@playwright/test";

// No database fixtures or backend mutations: only mocked UI scenarios and catalog GETs.
process.env.E2E_ADMIN_EMAIL = "admin@example.test";
process.env.E2E_ADMIN_PASSWORD = "test-password";
export default defineConfig({
  testDir: ".",
  testMatch: /(?:manager|settings|carousel)\.spec\.ts/,
  grep: /settings|dashboard stock shortcuts|variant availability|slider renders|autoplay pauses/,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4178", browserName: "chromium", headless: true },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4178 --strictPort",
    cwd: "..",
    url: "http://127.0.0.1:4178",
    env: { API_PROXY_TARGET: "http://127.0.0.1:3000", VITE_API_URL: "/api" },
    reuseExistingServer: false
  }
});
