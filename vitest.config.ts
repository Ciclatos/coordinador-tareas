import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/._*"],
    coverage: { reporter: ["text", "json-summary"] },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
