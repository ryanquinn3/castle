import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: ["tools/**/*.ts", "src/test/excalibur-browser-shared-test.ts"],
  project: ["src/**/*.ts", "src/**/*.tsx"],
  ignoreDependencies: ["@playwright/cli", "vitest-browser-react"],
  tags: ["-lintignore"],
};

export default config;
