# Testing Notes

## Vitest Context Extension

Vitest's `baseTest.extend(...)` builder API creates fixtures that are set up per test and injected into the test callback. In this repo, that is the preferred replacement for repeated `beforeEach` and `afterEach` when browser tests need an Excalibur engine and scene.

If a fixture allocates resources, register teardown once with `onCleanup(...)`. Vitest runs that cleanup after the fixture scope ends, so `ctx.dispose()` still runs when a test fails.

```ts
import { expect, test as baseTest } from "vitest";
import {
  createExcaliburBrowserTestContext,
  type ExcaliburBrowserTestContext,
} from "../src/test/excalibur-browser-test-utils.ts";

const test = baseTest.extend<{ ctx: ExcaliburBrowserTestContext }>(
  "ctx",
  async ({}, { onCleanup }) => {
    const ctx = await createExcaliburBrowserTestContext();
    onCleanup(() => {
      ctx.dispose();
    });
    return ctx;
  },
);

test("renders with a shared harness", async ({ ctx }) => {
  expect(ctx.scene).toBeDefined();
});
```

Use `test("name", async ({ ctx }) => { ... })` instead of file-level mutable state plus manual `afterEach` disposal.
