import { defineConfig, configDefaults } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  publicDir: "public",
  define: {
    __SOUNDS_DISABLED__: true,
  },
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "src/**/*.browser.test.ts"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts"],
          setupFiles: ["./vitest.browser.setup.ts"],
          isolate: true,
          browser: {
            headless: true,
            viewport: { width: 1024, height: 768 },
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
            screenshotDirectory: "test-results/screenshots",
          },
        },
      },
    ],
  },
});
