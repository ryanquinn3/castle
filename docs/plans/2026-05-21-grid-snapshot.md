# Grid Snapshot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Press `D` to copy an ASCII representation of the grid's elevation state to clipboard for debugging.

**Architecture:** Add a `serialize()` method to `GridModel` that produces a right-aligned ASCII grid. Castle tile renders as `C`. Register a `D` keypress handler in `GameSession` that calls serialize and writes to clipboard.

**Tech Stack:** TypeScript, Excalibur.js (keyboard input), Clipboard API

---

### Task 1: Add `serialize()` to GridModel

**Files:**
- Test: `src/model/grid-model.test.ts`
- Modify: `src/model/grid-model.ts`

**Step 1: Write the failing test**

Add a new describe block at the end of `grid-model.test.ts`:

```ts
describe('serialize', () => {
  test('renders elevations right-aligned with C for castle', () => {
    const grid = new GridModel({ width: 4, height: 3, castleCol: 2, castleRow: 1 });
    grid.setElevation(0, 0, 3);
    grid.setElevation(1, 0, -2);

    const result = grid.serialize();

    expect(result).toBe(
      [
        '  3 -2  0  0',
        '  0  0  C  0',
        '  0  0  0  0',
      ].join('\n'),
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `rtk vitest run src/model/grid-model.test.ts`
Expected: FAIL -- `grid.serialize is not a function`

**Step 3: Write minimal implementation**

Add this method to the `GridModel` class in `grid-model.ts`, after the `reset()` method:

```ts
serialize(): string {
  const rows: string[] = [];
  for (let row = 0; row < this.height; row++) {
    const cells: string[] = [];
    for (let col = 0; col < this.width; col++) {
      if (this.isCastle(col, row)) {
        cells.push('  C');
      } else {
        const e = this.elevations[row][col];
        cells.push(e.toString().padStart(3));
      }
    }
    rows.push(cells.join(''));
  }
  return rows.join('\n');
}
```

The 3-char width handles -10 through 10 plus the `C` token. Values are right-aligned so columns stay visually aligned.

**Step 4: Run test to verify it passes**

Run: `rtk vitest run src/model/grid-model.test.ts`
Expected: PASS

**Step 5: Run typecheck**

Run: `rtk tsc --noEmit`
Expected: clean

**Step 6: Commit**

```bash
rtk git add src/model/grid-model.ts src/model/grid-model.test.ts
rtk git commit -m "feat: add GridModel.serialize() for ASCII grid snapshots"
```

---

### Task 2: Register D keypress to copy snapshot to clipboard

**Files:**
- Modify: `src/game-session.ts`

**Step 1: Add keyboard handler**

In `GameSession.onInitialize`, after the existing `Keys.L` release handler (line 85), add:

```ts
_engine.input.keyboard.on('press', (evt) => {
  if (evt.key === Keys.D) {
    const text = this.model.serialize();
    void navigator.clipboard.writeText(text);
  }
});
```

**Step 2: Run typecheck**

Run: `rtk tsc --noEmit`
Expected: clean

**Step 3: Manual verification**

Run: `npm run dev`
- Open browser, start a game
- Scoop a few tiles to create non-zero elevations
- Press `D`
- Paste into a text editor and confirm the ASCII grid shows correct elevation values with `C` at castle position

**Step 4: Commit**

```bash
rtk git add src/game-session.ts
rtk git commit -m "feat: press D to copy grid snapshot to clipboard"
```
