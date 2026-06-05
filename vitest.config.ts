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
          browser: {
            headless: true,
            viewport: { width: 1024, height: 768 },
            testerHtmlPath: "./index.html",
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
