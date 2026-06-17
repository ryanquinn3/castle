# Knip Unused-Export Policy

`node --run static-check` runs [Knip](https://knip.dev), which fails the build on unused files, exports, types, and dependencies. During multi-task work it is common for one subtask to introduce a producer (a new export, helper, or type) one commit before the consumer subtask wires it up. This doc defines how to handle that case so each leaf task can still end in an independently green state.

## Default: keep producer and consumer in the same task

Plans should be decomposed so each leaf task lands the producer and at least one consumer together. This is the existing rule in [agent-workflow.md](./agent-workflow.md) under Planning: every leaf must end with passing tests, clean lint/typecheck, and no unused variables. The `@lintignore` escape hatch below exists for cases where co-locating is genuinely not possible, not as a routine convenience.

## Escape hatch: `@lintignore` JSDoc tag

When a leaf task must introduce an export that a later subtask will wire up, annotate the export with `@lintignore`:

```ts
/**
 * @lintignore wired up by TASK-NNN.MM
 */
export function notYetWired() {}
```

`knip.config.ts` opts this tag into Knip's tag-filter via `tags: ["-lintignore"]`. The configured behavior is:

- **Unused export, tagged**: Knip suppresses the unused-export error. ✓
- **Used export, tagged**: Knip emits a "Tag hint" telling you the tag is stale. The `knip` script in `package.json` runs with `--treat-tag-hints-as-errors`, so this fails `static-check` with a non-zero exit. Remove the tag to unblock.

This is why `@lintignore` is preferred over the built-in `@beta` tag: `@beta` suppresses unused-reports but gives no signal when the tag becomes stale.

## Rules of use

- The `@lintignore` JSDoc block must name the follow-up task ID that will consume the export, e.g. `@lintignore wired up by TASK-012.03`.
- The consuming subtask must remove the `@lintignore` tag in the same commit that adds the consumer. List this removal as an explicit step in that subtask's plan.
- If Knip reports a Tag hint for `@lintignore`, the consumer has landed and the tag is now stale. `static-check` will be red until you remove it.
- Never leave a `@lintignore` tag in the tree at parent-task completion. The parent task's verification step should run `rg '@lintignore' src/` and confirm zero hits introduced by the branch.
- Do not silence Knip by adding entries to `knip.config.ts` (`ignore`, `ignoreIssues`, `ignoreDependencies`) for temporary task state. Those keys are for permanently unreferenced code (generated files, fixtures, peer deps not in `package.json`).
- Do not use `@public` or `@beta` for this purpose. `@public` semantically marks library API surface; `@beta` is a real release tag that gives no stale-tag signal. `@lintignore` reads as "intentionally suppressed, pending wiring" and is easy to grep for cleanup.
