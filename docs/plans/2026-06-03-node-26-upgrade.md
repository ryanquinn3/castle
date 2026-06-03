# Node 26 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the project from Node 22/20 pins to Node current 26 across local development, dependency metadata, CI, and devcontainer setup.

**Architecture:** This is a tooling-only change. Keep runtime game code unchanged, pin all project entry points to Node 26, regenerate the npm lockfile under Node 26, then run the existing static and unit checks.

**Tech Stack:** Node 26, npm, Vite, TypeScript, Vitest, oxlint, GitHub Actions, Dev Containers.

---

## File structure

- Modify `.node-version`: source of truth for local Node version managers and GitHub Actions.
- Modify `package.json`: declare the supported Node major and update Node type definitions.
- Modify `package-lock.json`: regenerate npm metadata after the `package.json` change under Node 26.
- Modify `.github/workflows/deploy.yml`: make CI read `.node-version` instead of hard-coding Node 20.
- Modify `.devcontainer/Dockerfile`: move the devcontainer base image from Node 22 to Node 26.
- Modify `AGENTS.md`: update the debug script note that currently names Node 22.

## Implementation notes

- Do not start the dev server. The repo instructions say one is already running.
- Use `node --run ...` for project scripts where possible, matching existing repo docs.
- Run lockfile regeneration from a shell that is already using Node 26.
- Keep this upgrade limited to Node/tooling metadata unless verification exposes a real compatibility problem.
- If dependency installation changes unrelated package versions beyond what npm must resolve for `@types/node`, inspect the lockfile before committing.

### Task 1: Establish the Node 26 source of truth

**Files:**
- Modify: `.node-version`
- Modify: `package.json`

- [ ] **Step 1: Confirm the pre-upgrade mismatch**

Run:

```bash
node -e 'const major = Number(process.versions.node.split(".")[0]); if (major !== 26) { console.error(`expected Node 26, got ${process.version}`); process.exit(1); } console.log(process.version);'
```

Expected before switching versions: FAIL with output like `expected Node 26, got v22.22.0`.

- [ ] **Step 2: Update `.node-version`**

Replace the entire file with:

```text
26
```

- [ ] **Step 3: Add the Node engine and update Node types in `package.json`**

Change the top of `package.json` so it includes `engines` immediately after `type`:

```json
{
  "name": "castle",
  "version": "0.0.0",
  "description": "",
  "main": "src/main.ts",
  "type": "module",
  "engines": {
    "node": ">=26 <27"
  },
  "scripts": {
```

Change the Node type dependency to:

```json
    "@types/node": "^26.0.0",
```

- [ ] **Step 4: Switch the local shell to Node 26**

Run the version manager command available in the environment. For `fnm`:

```bash
fnm install 26 && fnm use 26
```

For `mise`:

```bash
mise install node@26 && mise use node@26
```

For `nvm`:

```bash
nvm install 26 && nvm use 26
```

Expected: `node --version` prints a version beginning with `v26.`.

- [ ] **Step 5: Verify the Node 26 assertion passes**

Run:

```bash
node -e 'const major = Number(process.versions.node.split(".")[0]); if (major !== 26) { console.error(`expected Node 26, got ${process.version}`); process.exit(1); } console.log(process.version);'
```

Expected: PASS with output beginning with `v26.`.

- [ ] **Step 6: Commit**

```bash
git add .node-version package.json
git commit -m "chore: pin project to node 26"
```

### Task 2: Regenerate npm metadata under Node 26

**Files:**
- Modify: `package-lock.json`

- [ ] **Step 1: Confirm npm sees Node 26**

Run:

```bash
node --version && npm --version
```

Expected: first line begins with `v26.`; second line prints the npm version bundled with that Node 26 install.

- [ ] **Step 2: Regenerate only the lockfile**

Run:

```bash
npm install --package-lock-only --ignore-scripts
```

Expected: exits 0 and updates `package-lock.json`. The root package metadata in `package-lock.json` includes:

```json
      "engines": {
        "node": ">=26 <27"
      },
```

Expected: the root `devDependencies` entry for Node types is:

```json
        "@types/node": "^26.0.0",
```

- [ ] **Step 3: Verify a clean install works from the regenerated lockfile**

Run:

```bash
npm ci
```

Expected: exits 0 without engine warnings.

- [ ] **Step 4: Commit**

```bash
git add package-lock.json
git commit -m "chore: refresh lockfile for node 26"
```

### Task 3: Update CI and devcontainer Node versions

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `.devcontainer/Dockerfile`

- [ ] **Step 1: Update GitHub Actions to read `.node-version`**

In `.github/workflows/deploy.yml`, replace the setup-node block with:

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: npm
```

Expected: the workflow no longer contains `node-version: 20`.

- [ ] **Step 2: Update the devcontainer base image**

In `.devcontainer/Dockerfile`, replace the `FROM` line with:

```dockerfile
FROM mcr.microsoft.com/devcontainers/typescript-node:1-26-bookworm
```

- [ ] **Step 3: Verify the devcontainer tag can be resolved**

Run if Docker is available:

```bash
docker manifest inspect mcr.microsoft.com/devcontainers/typescript-node:1-26-bookworm
```

Expected: exits 0 and prints manifest JSON for the `1-26-bookworm` image tag.

If Docker is not available on the machine, run:

```bash
curl -fsSL -H 'Accept: application/vnd.docker.distribution.manifest.list.v2+json' https://mcr.microsoft.com/v2/devcontainers/typescript-node/manifests/1-26-bookworm
```

Expected: exits 0 and prints registry manifest JSON for the `1-26-bookworm` image tag.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml .devcontainer/Dockerfile
git commit -m "ci: use node 26"
```

### Task 4: Update local docs that mention Node 22

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update the debug serialization note**

In `AGENTS.md`, replace:

```markdown
You do not need npx or tsx to run this script. Node 22 supports running typescript directly.
```

with:

```markdown
You do not need npx or tsx to run this script. Node 26 supports running TypeScript directly.
```

- [ ] **Step 2: Search for stale Node major references in tracked project files**

Run:

```bash
git grep -n -E 'node-version: 20|Node 22|node 22|typescript-node:1-22|@types/node.*22|22\.22\.0'
```

Expected: no matches in tracked files.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update node version note"
```

### Task 5: Run project verification under Node 26

**Files:**
- No planned file edits.

- [ ] **Step 1: Verify install and Node version**

Run:

```bash
node --version && npm ci
```

Expected: Node prints `v26.x.x`; `npm ci` exits 0 without engine warnings.

- [ ] **Step 2: Run lint**

Run:

```bash
node --run lint
```

Expected: PASS.

- [ ] **Step 3: Run unit tests**

Run:

```bash
node --run test:unit
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
node --run build
```

Expected: PASS and `dist/` is produced or updated locally.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git diff --stat HEAD~4..HEAD
git diff HEAD~4..HEAD -- .node-version package.json package-lock.json .github/workflows/deploy.yml .devcontainer/Dockerfile AGENTS.md
```

Expected: only the Node 26 metadata, lockfile, CI, devcontainer, and docs changes from this plan are present.

### Task 6: Final cleanup and handoff

**Files:**
- No planned file edits.

- [ ] **Step 1: Check repository status**

Run:

```bash
git status --short
```

Expected: either clean, or only expected generated files such as `dist/` if the repo leaves build output untracked.

- [ ] **Step 2: Confirm recent commits**

Run:

```bash
git log --oneline -5
```

Expected: the recent commits include:

```text
chore: pin project to node 26
chore: refresh lockfile for node 26
ci: use node 26
docs: update node version note
```

- [ ] **Step 3: Final verification summary**

Record the exact results of:

```bash
node --version
node --run lint
node --run test:unit
node --run build
```

Expected: `node --version` begins with `v26.` and all three project commands pass.

## Self-review

- Spec coverage: the plan upgrades local version pinning, package metadata, lockfile, GitHub Actions, devcontainer, and the only tracked Node 22 documentation note found during inspection.
- Placeholder scan: no banned placeholder markers or unspecified test steps remain.
- Type consistency: every Node version reference uses major `26`; package metadata uses `>=26 <27`; Node type definitions use `^26.0.0`; CI reads `.node-version`.
