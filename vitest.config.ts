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
          maxWorkers: 3,
          browser: {
            headless: true,
            viewport: { width: 1024, height: 768 },
            enabled: true,
            provider: playwright({
                launchOptions: {
                    channel:"chromium",
                    args: [
                '--no-default-browser-check',
                '--no-first-run',
                '--disable-default-apps',
                '--disable-popup-blocking',
                '--disable-translate',
                '--disable-background-timer-throttling',
                // --disable-gpu removed: Xvfb provides virtual display, GPU acceleration works
                '--disable-dev-shm-usage',

                // on macOS, disable-background-timer-throttling is not enough
                // and we need disable-renderer-backgrounding too
                // see https://github.com/karma-runner/karma-chrome-launcher/issues/123
                '--disable-renderer-backgrounding',
                '--disable-device-discovery-notifications',

                '--autoplay-policy=no-user-gesture-required',
                '--mute-audio',
                '--no-sandbox',
                '--enable-precise-memory-info',
                '--js-flags="--max_old_space_size=8192" --expose-gc',

                // Additional flags for better rendering in CI
                '--force-device-scale-factor=1',
                '--window-size=1920,1080',
                '--use-gl=swiftshader'
              ]
                    
                }
            }),
            instances: [
                {
                     browser: "chromium",
                }
            ],
            screenshotDirectory: "test-results/screenshots",
          },
        },
      },
    ],
  },
});
