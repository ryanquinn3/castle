import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: ["tools/**/*.ts"],
  project: ["src/**/*.ts", "src/**/*.tsx"],
  ignoreDependencies: ["@playwright/cli"],
};

export default config;
