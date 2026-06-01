import { defineConfig } from "vitest/config";

export default defineConfig({
  publicDir: "public",
  define: {
    __SOUNDS_DISABLED__: true,
  },
  test: {
    api: { host: "0.0.0.0" },
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
