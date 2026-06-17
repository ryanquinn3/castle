import { defineConfig, mergeConfig, configDefaults } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import viteConfig from "./vite.config.js";

// Tests run through the same Vite pipeline as dev. Without this merge a standalone
// vitest config drops vite.config.js entirely, so `optimizeDeps.exclude: ["excalibur"]`
// and the tiled/react plugins are absent during tests — which lets Vite discover and
// pre-bundle a dep mid-run and reload the browser tester (a known browser-mode flake
// that surfaces as "connection" / "failed to connect to the browser session" errors).
export default mergeConfig(
  viteConfig,
  defineConfig({
    publicDir: "public",
    define: {
      __SOUNDS_DISABLED__: true,
    },
    optimizeDeps: {
      // Pre-bundle these up front so nothing new is discovered mid-run.
      include: ["react", "react-dom", "react-dom/client", "vitest-browser-react"],
      // Concatenated with vite.config.js's `exclude: ["excalibur"]` by mergeConfig.
      exclude: ["@excaliburjs/plugin-tiled"],
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
            maxWorkers: 2,
            browser: {
              headless: true,
              viewport: { width: 1024, height: 768 },
              enabled: true,
              provider: playwright({
                launchOptions: {
                  channel: "chromium",
                  args: [
                    "--no-default-browser-check",
                    "--no-first-run",
                    "--disable-default-apps",
                    "--disable-popup-blocking",
                    "--disable-translate",
                    "--disable-background-timer-throttling",
                    "--disable-dev-shm-usage",

                    // on macOS, disable-background-timer-throttling is not enough
                    // and we need disable-renderer-backgrounding too
                    // see https://github.com/karma-runner/karma-chrome-launcher/issues/123
                    "--disable-renderer-backgrounding",
                    "--disable-device-discovery-notifications",

                    "--autoplay-policy=no-user-gesture-required",
                    "--mute-audio",
                    "--no-sandbox",
                    "--enable-precise-memory-info",
                    '--js-flags="--max_old_space_size=8192" --expose-gc',

                    "--force-device-scale-factor=1",
                    "--window-size=1920,1080",
                    // --use-gl=swiftshader removed: forcing software WebGL is a poor
                    // fit on Apple Silicon (swiftshader WebGL is unstable on ARM and
                    // saturates CPU under parallel engines). Let Chromium use ANGLE/Metal.
                  ],
                },
              }),
              instances: [
                {
                  browser: "chromium",
                },
              ],
              screenshotDirectory: "test-results/screenshots",
              connectTimeout: 15_000,
            },
          },
        },
      ],
    },
  }),
);
