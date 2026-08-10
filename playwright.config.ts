import { defineConfig, devices } from "@playwright/test";

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // CI y Vercel inyectan variables sin depender de un archivo local.
  }
}

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/._*"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: externalBaseUrl ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalBaseUrl ? undefined : {
    command: "npm run build && npm run start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/ingresar",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
