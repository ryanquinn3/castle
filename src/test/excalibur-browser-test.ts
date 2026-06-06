import { expect, test as baseTest } from "vitest";
import {
  createExcaliburBrowserTestContext,
} from "./excalibur-browser-test-utils.ts";

export const test = baseTest.extend(
  "ctx",
  async ({ task }, { onCleanup }) => {
    void task;
    const ctx = await createExcaliburBrowserTestContext();
    onCleanup(() => {
      ctx.dispose();
    });
    return ctx;
  },
);

export { expect };
