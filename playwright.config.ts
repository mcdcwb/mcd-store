import { defineConfig } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";

process.env.E2E_ADMIN_EMAIL ??= "browser-" + randomUUID() + "@example.test";
process.env.E2E_ADMIN_PASSWORD ??= randomBytes(3).toString("hex").slice(0, 5);
process.env.E2E_USER_EMAIL ??= "customer-" + randomUUID() + "@example.test";
process.env.E2E_USER_PASSWORD ??= randomBytes(3).toString("hex").slice(0, 5);
process.env.E2E_REGISTER_EMAIL ??= "register-" + randomUUID() + "@example.test";
process.env.E2E_PROFILE_PREFIX ??= "profile-" + randomUUID();

export default defineConfig({
  testDir: "./tests",
  testMatch: /(?:auth|filters|manager|orders|hours|categories|settings|shopping|account|checkout|colors|uploads|session-tabs|carousel|cooldown|product-card-geometry|favorites|product-corrections|badges|product-footer)\.spec\.ts/,
  globalSetup: "./tests/browser-setup.ts",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4178",
    browserName: "chromium",
    headless: true
  },
  webServer: [
    {
      command: "node --import tsx tests/helpers/frontend-server.ts",
      cwd: "./backend",
      url: "http://127.0.0.1:3187/produtos",
      reuseExistingServer: false,
      timeout: 30000
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4178 --strictPort",
      url: "http://127.0.0.1:4178",
      env: { API_PROXY_TARGET: "http://127.0.0.1:3187", VITE_API_URL: "/api" },
      reuseExistingServer: false,
      timeout: 30000
    }
  ]
});
