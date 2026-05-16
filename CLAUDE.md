# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Gameplay Overview

Wave defense game. Each level has two phases:

1. **Planning phase** - player spends a scoop budget to reshape terrain (dig holes, build walls)
2. **Wave phase** - water advances column-by-column from the top of the grid downward

**Core mechanic**: Each scoop lowers one tile by 1 elevation and raises another by 1. Holes absorb/reduce incoming wave height; walls block or reduce it. Water that reaches the castle tile ends the game.

**Wave/elevation interaction**: Wave height tracks per column. A wall of height W reduces wave by W (blocks fully if W >= wave height). A hole of depth D reduces wave by D (absorbs fully if D >= wave height).

Full design doc: `docs/gameplay.md`. All project docs live in `docs/`.

**Key configurable constants** (all in one place, to be determined):
- `GRID_WIDTH` / `GRID_HEIGHT` (20×30)
- `MAX_ELEVATION` (10)
- `SCOOP_START` / `SCOOP_INCREMENT` (10, +2/level)
- `WAVE_HEIGHT_START` / `WAVE_HEIGHT_INCREMENT` (1, +1/level)

## Task Tracking

All work is tracked in `TASKS.md` at the repo root. Subagents should read it to find unclaimed tasks (`[ ]`), mark them `[~]` before starting, and `[x]` when complete.

## Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # Type-check + production build
npm run serve        # Preview production build at localhost:4173
npm test             # Build + run Playwright visual regression tests
npm run test:integration-update  # Rebuild snapshot baselines
```

## Architecture

This is a minimal Excalibur.js game (TypeScript + Vite). The structure follows Excalibur conventions:

- **`src/main.ts`** - Creates the `Engine` (800x600, pixel-art mode, FadeInOut transition), registers scenes, starts the game
- **`src/resources.ts`** - Centralizes all asset loading; exports a `Resources` object and `loader` to pass to `engine.start()`
- **`src/level.ts`** - Scene class (`MyLevel extends Scene`); `onInitialize` adds actors to the scene
- **`src/player.ts`** - Actor class (`Player extends Actor`); handles graphics, actions, and events

**Adding to the game:**
- New actors: create a class extending `Actor`, add to scene in `level.ts`
- New assets: register in `resources.ts`, use `ImageSource` for images
- New scenes: create a class extending `Scene`, register with engine in `main.ts`

## Testing

Tests are Playwright visual regression tests only (no unit tests). They build the game, start the preview server, click the Excalibur play button (`#excalibur-play`), then compare a screenshot against stored baselines in `tests/main.spec.ts-snapshots/`. Update baselines with `npm run test:integration-update`.

## Vite Config Notes

- Custom plugin strips the `.tsx` extension from Tiled tilemap imports (avoids React conflicts)
- Excalibur is excluded from Vite's dep optimization (CJS/ESM issue)
- Assets are not inlined (`assetsInlineLimit: 0`) due to an Excalibur XML limitation
- `base: './'` enables relative paths for itch.io deployments

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->