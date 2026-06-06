# Vitest Context Extend Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document Vitest's context extension API for this repo, refactor the new browser actor tests to use it, remove the old disabled mock unit tests, and commit the result.

**Architecture:** Add one shared browser-test fixture module under `src/test/` that provisions and disposes the Excalibur browser harness through `baseTest.extend(...)`. Keep the browser tests' domain helpers local, update docs with a concise repo-specific summary of the API, and delete the replaced disabled mock tests entirely.

**Tech Stack:** TypeScript, Vitest browser project, Excalibur test harness, Markdown

---

## File Structure

- Create: `docs/testing.md` - concise repo-specific note on Vitest's `baseTest.extend(...)` API and cleanup usage.
- Create: `src/test/excalibur-browser-test.ts` - shared custom `test` fixture that exposes `ctx` and handles disposal with `onCleanup`.
- Modify: `src/wave/wave-segment.browser.test.ts` - swap manual `afterEach`/shared state for the fixture-provided `ctx`.
- Modify: `src/wave/static-water-actor.browser.test.ts` - same refactor as above.
- Delete: `src/wave/wave-segment.test.ts` - old disabled mock unit test file replaced by browser coverage.
- Delete: `src/wave/static-water-actor.test.ts` - old disabled mock unit test file replaced by browser coverage.

### Task 1: Fetch Vitest API And Write Testing Note

**Files:**
- Create: `docs/testing.md`

- [ ] **Step 1: Fetch the Vitest docs page**

Run: `curl -L "https://vitest.dev/guide/test-context.html#extend-test-context"`
Expected: page content describing `test.extend(...)`, fixture values, and cleanup hooks.

- [ ] **Step 2: Write the repo-specific gist**

Create `docs/testing.md` with a short note that covers:

```md
# Testing Notes

## Vitest Context Extension

Vitest's `baseTest.extend(...)` API lets a test file define fixtures that are created per test and cleaned up automatically. A fixture can return a value to the test body and register teardown through `onCleanup(...)`, which replaces a lot of repeated `beforeEach` and `afterEach` wiring.

In this repo, browser actor tests should prefer a shared fixture when they need an Excalibur engine and scene. That keeps setup deterministic and ensures `dispose()` always runs even when a test fails.

```ts
const test = baseTest.extend<{ ctx: ExcaliburBrowserTestContext }>("ctx", async ({}, { onCleanup }) => {
  const ctx = await createExcaliburBrowserTestContext()
  onCleanup(() => {
    ctx.dispose()
  })
  return ctx
})
```

Use the fixture in tests via `test("name", async ({ ctx }) => { ... })` instead of file-level mutable state plus `afterEach`.
```

- [ ] **Step 3: Verify the doc is present and readable**

Run: `test -f docs/testing.md`
Expected: exit code `0`.

### Task 2: Add Shared Browser Fixture

**Files:**
- Create: `src/test/excalibur-browser-test.ts`
- Use: `src/test/excalibur-browser-test-utils.ts`

- [ ] **Step 1: Write the failing fixture import usage in a browser test**

Update one browser test file to import `{ test, expect }` from `../test/excalibur-browser-test.ts` before creating the fixture file.

- [ ] **Step 2: Run browser tests to confirm missing module failure**

Run: `node --run test:browser -- src/wave/wave-segment.browser.test.ts`
Expected: FAIL with module-not-found for `src/test/excalibur-browser-test.ts`.

- [ ] **Step 3: Create the shared fixture module**

Create `src/test/excalibur-browser-test.ts`:

```ts
import {
  expect,
  test as baseTest,
} from "vitest";
import {
  createExcaliburBrowserTestContext,
  type ExcaliburBrowserTestContext,
} from "./excalibur-browser-test-utils.ts";

export const test = baseTest.extend<{ ctx: ExcaliburBrowserTestContext }>(
  "ctx",
  async ({}, { onCleanup }) => {
    const ctx = await createExcaliburBrowserTestContext();
    onCleanup(() => {
      ctx.dispose();
    });
    return ctx;
  },
);

export { expect };
```

- [ ] **Step 4: Run the targeted browser test**

Run: `node --run test:browser -- src/wave/wave-segment.browser.test.ts`
Expected: PASS.

### Task 3: Refactor Browser Actor Tests To Use The Fixture

**Files:**
- Modify: `src/wave/wave-segment.browser.test.ts`
- Modify: `src/wave/static-water-actor.browser.test.ts`

- [ ] **Step 1: Refactor `WaveSegment` browser test**

Update the file to:

```ts
import { describe } from "vitest";
import { expect, test } from "../test/excalibur-browser-test.ts";
```

Then remove:
- `afterEach`
- file-level `ctx`
- manual `ctx = await createExcaliburBrowserTestContext()` setup

Make each test receive `ctx` from the fixture:

```ts
test("surges through rows and emits gameplay events", async ({ ctx }) => {
  const { segment, events } = await makeSegment(ctx);
  ...
});
```

- [ ] **Step 2: Refactor `StaticWaterActor` browser test**

Make the same change pattern:

```ts
import { describe } from "vitest";
import { expect, test } from "../test/excalibur-browser-test.ts";
```

Pass `ctx` through helpers instead of storing mutable file state.

- [ ] **Step 3: Run browser tests**

Run: `node --run test:browser`
Expected: all browser tests pass with fixture-based cleanup.

### Task 4: Remove Replaced Disabled Mock Tests

**Files:**
- Delete: `src/wave/wave-segment.test.ts`
- Delete: `src/wave/static-water-actor.test.ts`

- [ ] **Step 1: Delete the old disabled mock test files**

Remove both files entirely.

- [ ] **Step 2: Run unit tests**

Run: `node --run test:unit`
Expected: unit suite still passes; deleted disabled files are no longer part of the project.

### Task 5: Final Verification And Commit

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run browser tests**

Run: `node --run test:browser`
Expected: PASS.

- [ ] **Step 2: Run unit tests**

Run: `node --run test:unit`
Expected: PASS.

- [ ] **Step 3: Run build**

Run: `node --run build`
Expected: PASS.

- [ ] **Step 4: Run lint**

Run: `node --run lint`
Expected: PASS.

- [ ] **Step 5: Commit the changes**

Run:

```bash
git add docs/testing.md src/test/excalibur-browser-test.ts src/wave/wave-segment.browser.test.ts src/wave/static-water-actor.browser.test.ts src/wave/wave-segment.test.ts src/wave/static-water-actor.test.ts docs/plans/2026-06-06-vitest-context-extend-refactor.md
git commit -m "test: use Vitest context fixtures for browser actors"
```

Expected: commit succeeds with docs, fixture refactor, and test deletions.

## Self-Review

- Spec coverage: covers Vitest API note, shared fixture, both browser test refactors, deletion of the disabled mock files, verification, and commit.
- Placeholder scan: no placeholders or deferred steps remain.
- Type consistency: `ctx` is the single shared fixture name across docs, helper module, and both test files.
