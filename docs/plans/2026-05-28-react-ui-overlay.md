# React UI Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace HUD and Toolbar Excalibur raster rendering with React HTML overlays while preserving existing public APIs.

**Architecture:** Hud and Toolbar classes keep their existing method signatures. Internally, instead of creating Excalibur Actors, they create a React root on a dedicated div inside `#game-ui` and re-render React components with updated props. The game session and planning phase are unchanged.

**Tech Stack:** React 19, ReactDOM, Vite with React plugin, CSS modules or plain CSS.

---

### Task 1: Add React dependencies and configure build

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `vite.config.js`

**Step 1: Install React**

Run:
```bash
npm install react react-dom
npm install -D @types/react @types/react-dom @vitejs/plugin-react
```

**Step 2: Update tsconfig.json**

Add `"jsx": "react-jsx"` to compilerOptions:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    ...existing options...
  }
}
```

**Step 3: Update vite.config.js**

The existing `tiledPlugin` externalizes ALL `.tsx` files to prevent Tiled tileset conflicts. No `.tsx` tiled files exist in this project (tilesets are `.tmx`), but if they're ever added they'd be in `public/map/`. Update the plugin to only match files outside `src/`, and add `@vitejs/plugin-react`:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const tiledPlugin = () => {
    return {
        name: 'tiled-tileset-plugin',
        resolveId: {
            order: 'pre',
            handler(sourceId, _importer, _options) {
                if (!sourceId.endsWith(".tsx")) return;
                if (sourceId.includes("/src/")) return;
                return { id: 'tileset:' + sourceId, external: 'relative' }
            }
        }
    };
}

export default defineConfig({
    base: './',
    plugins: [tiledPlugin(), react()],
    optimizeDeps: {
        exclude: ["excalibur"],
    },
    build: {
        assetsInlineLimit: 0,
        sourcemap: true,
        rollupOptions: {
            output: {
                format: 'umd'
            }
        }
    }
});
```

**Step 4: Verify build works**

Run:
```bash
npm run build
```
Expected: Clean build with no errors.

**Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.js
git commit -m "feat: add React and Vite React plugin for HTML UI overlay"
```

---

### Task 2: Set up HTML structure and Engine config

**Files:**
- Modify: `index.html`
- Modify: `src/main.ts`
- Modify: `src/style.css`

**Step 1: Update index.html**

Wrap the canvas and UI div in a `#root` container. Provide a named canvas for Excalibur:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <link rel="stylesheet" href="./src/style.css">
    <title>Castle</title>
  </head>
  <body>
    <div id="root">
      <canvas id="game"></canvas>
      <div id="game-ui"></div>
    </div>
    <script type="module" src="./src/main.ts"></script>
  </body>
</html>
```

**Step 2: Add CSS for the overlay structure**

Add to `src/style.css`:

```css
#root {
  position: relative;
}

#game-ui {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

#game-ui * {
  pointer-events: auto;
}
```

**Step 3: Update Engine config in src/main.ts**

Add `canvasElementId` and `pointerScope` to the Engine constructor:

```ts
import { Color, DisplayMode, Engine, FadeInOut, PointerScope } from 'excalibur';

const game = new Engine({
  canvasElementId: 'game',
  pointerScope: PointerScope.Canvas,
  width: canvasWidth,
  height: canvasHeight,
  displayMode: DisplayMode.FillScreen,
  pixelArt: true,
  backgroundColor: Color.Black,
  ...rest unchanged...
});
```

**Step 4: Verify dev server shows the game unchanged**

Open the dev server in a browser. The game should look and play identically.

**Step 5: Commit**

```bash
git add index.html src/style.css src/main.ts
git commit -m "feat: add game-ui overlay div and configure Excalibur canvas element"
```

---

### Task 3: Extract ToolType to shared types

**Files:**
- Modify: `src/view/toolbar.ts` (remove `ToolType` enum)
- Create: `src/tool-type.ts`
- Modify: `src/view/digging-strategy.ts` (update import)
- Modify: `src/view/planning-phase.ts` (update import)
- Modify: `src/view/single-cell-digging.ts` (update import if it imports ToolType)
- Modify: `src/view/drag-digging.ts` (update import if it imports ToolType)

Currently `ToolType` is defined in `src/view/toolbar.ts` and imported by digging strategies and planning phase. Move it to `src/tool-type.ts` so both Excalibur code and React components can import it without pulling in Excalibur dependencies.

**Step 1: Create src/tool-type.ts**

```ts
export enum ToolType {
  Shovel = 'shovel',
  Wall = 'wall',
}
```

**Step 2: Update src/view/toolbar.ts**

Remove the `ToolType` enum definition. Add re-export for backwards compat during transition:

```ts
export { ToolType } from '../tool-type.ts';
```

No, actually: update all import sites to import from `src/tool-type.ts` directly, then remove the enum from toolbar.ts entirely. Re-export `ToolType` from toolbar.ts so any remaining importers still work.

**Step 3: Update all files that import ToolType from toolbar**

Search for `from './toolbar.ts'` or `from '../toolbar.ts'` etc. that import `ToolType` and update them to import from `../tool-type.ts` (or appropriate relative path).

Files to check and update:
- `src/view/digging-strategy.ts:3` - `import type { ToolType } from './toolbar.ts'`
- `src/view/planning-phase.ts:6` - `import { ToolType } from './toolbar.ts'`
- `src/view/single-cell-digging.ts` - check for ToolType import
- `src/view/drag-digging.ts` - check for ToolType import

**Step 4: Run typecheck**

```bash
npx tsc --noEmit
```
Expected: No errors.

**Step 5: Run unit tests**

```bash
npm run test:unit
```
Expected: All pass.

**Step 6: Commit**

```bash
git add src/tool-type.ts src/view/toolbar.ts src/view/digging-strategy.ts src/view/planning-phase.ts src/view/single-cell-digging.ts src/view/drag-digging.ts
git commit -m "refactor: extract ToolType enum to shared module"
```

---

### Task 4: Build HUD React component

**Files:**
- Create: `src/ui/HudComponent.tsx`
- Create: `src/ui/hud.css`

**Step 1: Create src/ui/HudComponent.tsx**

This component replicates the visual output of the current Hud class. It renders a semi-transparent panel in the top-right corner with level info, and optionally state text and wave info during planning.

```tsx
import type { FC } from 'react';
import './hud.css';

interface HudProps {
  level: number;
  planning: {
    stateText: string;
    waveText: string;
  } | null;
}

const HudComponent: FC<HudProps> = ({ level, planning }) => {
  return (
    <div className="hud">
      <div className="hud__level">Level: {level}</div>
      {planning && (
        <>
          <div className="hud__state">{planning.stateText}</div>
          <div className="hud__wave">{planning.waveText}</div>
        </>
      )}
    </div>
  );
};

export default HudComponent;
```

**Step 2: Create src/ui/hud.css**

Match the existing visual style: top-right, semi-transparent black background, white/gray/orange text.

```css
.hud {
  position: absolute;
  top: 4px;
  right: 10px;
  min-width: 260px;
  background: rgba(0, 0, 0, 0.45);
  padding: 8px;
  font-family: sans-serif;
  pointer-events: none;
}

.hud__level {
  color: white;
  font-size: 16px;
  line-height: 20px;
}

.hud__state {
  color: rgb(180, 180, 180);
  font-size: 12px;
  line-height: 20px;
}

.hud__wave {
  color: rgb(255, 200, 80);
  font-size: 14px;
  line-height: 20px;
}
```

**Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: No errors.

**Step 4: Commit**

```bash
git add src/ui/HudComponent.tsx src/ui/hud.css
git commit -m "feat: add HUD React component"
```

---

### Task 5: Rewrite Hud class to render React

**Files:**
- Modify: `src/view/hud.ts`

The Hud class keeps its existing public API (`activate`, `deactivate`, `updateLevel`, `showPlanning`, `hidePlanning`, `updateState`). Internally it creates a React root on a div inside `#game-ui` and re-renders on each state change.

**Step 1: Rewrite src/view/hud.ts**

```ts
import { Scene } from 'excalibur';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import HudComponent from '../ui/HudComponent.tsx';

export class Hud {
  private root: Root | null = null;
  private container: HTMLDivElement | null = null;
  private level = 1;
  private planning: { stateText: string; waveText: string } | null = null;

  activate(_scene: Scene, level: number): void {
    this.level = level;
    this.planning = null;
    this.container = document.createElement('div');
    document.getElementById('game-ui')!.appendChild(this.container);
    this.root = createRoot(this.container);
    this.render();
  }

  updateLevel(level: number): void {
    this.level = level;
    this.render();
  }

  showPlanning(_scene: Scene, waveText: string): void {
    this.planning = { stateText: '', waveText };
    this.render();
  }

  hidePlanning(_scene: Scene): void {
    this.planning = null;
    this.render();
  }

  updateState(text: string): void {
    if (this.planning) {
      this.planning = { ...this.planning, stateText: text };
      this.render();
    }
  }

  deactivate(_scene: Scene): void {
    this.root?.unmount();
    this.root = null;
    this.container?.remove();
    this.container = null;
  }

  private render(): void {
    this.root?.render(
      createElement(HudComponent, {
        level: this.level,
        planning: this.planning,
      })
    );
  }
}
```

Note: method signatures keep the `scene: Scene` parameter even though it's unused, to preserve the existing call sites. Prefix with `_` to satisfy the linter.

**Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```
Expected: No errors.

**Step 3: Verify in browser**

Open the game. The HUD should appear in the top-right corner with level info. Start a planning phase and confirm state text and wave info appear/disappear correctly.

**Step 4: Run unit tests**

```bash
npm run test:unit
```
Expected: All pass.

**Step 5: Commit**

```bash
git add src/view/hud.ts
git commit -m "feat: rewrite Hud class to render React component"
```

---

### Task 6: Build Toolbar React component

**Files:**
- Create: `src/ui/ToolbarComponent.tsx`
- Create: `src/ui/toolbar.css`

**Step 1: Create src/ui/ToolbarComponent.tsx**

Renders 8 tool slots (2 populated, 6 empty). Active tool gets a golden border. Wall tool shows sand count badge. Keyboard shortcuts handled via useEffect.

```tsx
import { useEffect, type FC } from 'react';
import { ToolType } from '../tool-type.ts';
import './toolbar.css';

interface ToolDef {
  type: ToolType;
  hotkeyLabel: string;
  spriteUrl: string;
}

interface ToolbarProps {
  tools: ToolDef[];
  activeTool: ToolType;
  disabled: boolean;
  sandCount: number;
  onToolSelected: (tool: ToolType) => void;
}

const TOTAL_SLOTS = 8;

const ToolbarComponent: FC<ToolbarProps> = ({
  tools,
  activeTool,
  disabled,
  sandCount,
  onToolSelected,
}) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (disabled) {
        return;
      }
      for (const tool of tools) {
        if (e.key === tool.hotkeyLabel) {
          onToolSelected(tool.type);
          return;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [disabled, tools, onToolSelected]);

  const slots = [];
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const tool = tools[i];
    const isActive = tool && tool.type === activeTool;
    slots.push(
      <div
        key={i}
        className={`toolbar__slot ${isActive ? 'toolbar__slot--active' : ''} ${tool ? 'toolbar__slot--filled' : ''}`}
        onClick={() => {
          if (!disabled && tool) {
            onToolSelected(tool.type);
          }
        }}
      >
        {tool && (
          <>
            <span className="toolbar__hotkey">{tool.hotkeyLabel}</span>
            <img className="toolbar__sprite" src={tool.spriteUrl} alt={tool.type} />
            {tool.type === ToolType.Wall && (
              <span className="toolbar__sand-count">{sandCount}</span>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`toolbar ${disabled ? 'toolbar--disabled' : ''}`}>
      <div className="toolbar__label">Build Tools</div>
      <div className="toolbar__slots">{slots}</div>
    </div>
  );
};

export default ToolbarComponent;
```

**Step 2: Create src/ui/toolbar.css**

Match existing visual style: centered above sand area, dark rounded background, golden active border.

```css
.toolbar {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.toolbar--disabled {
  opacity: 0.4;
  pointer-events: none;
}

.toolbar__label {
  background: rgba(20, 20, 30, 0.85);
  color: white;
  font-family: sans-serif;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 2px;
}

.toolbar__slots {
  display: flex;
  gap: 4px;
  background: rgba(20, 20, 30, 0.85);
  padding: 8px;
  border-radius: 2px;
}

.toolbar__slot {
  width: 48px;
  height: 48px;
  background: rgba(40, 40, 50, 0.9);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
}

.toolbar__slot--filled {
  cursor: pointer;
}

.toolbar__slot--active {
  outline: 2px solid rgb(255, 220, 50);
  outline-offset: 0px;
}

.toolbar__hotkey {
  position: absolute;
  top: 2px;
  left: 4px;
  color: rgb(200, 200, 200);
  font-family: sans-serif;
  font-size: 10px;
}

.toolbar__sprite {
  width: 40px;
  height: 40px;
  image-rendering: pixelated;
}

.toolbar__sand-count {
  position: absolute;
  bottom: 2px;
  right: 4px;
  color: rgb(255, 220, 100);
  font-family: sans-serif;
  font-size: 11px;
}
```

**Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: No errors.

**Step 4: Commit**

```bash
git add src/ui/ToolbarComponent.tsx src/ui/toolbar.css
git commit -m "feat: add Toolbar React component"
```

---

### Task 7: Rewrite Toolbar class to render React

**Files:**
- Modify: `src/view/toolbar.ts`

The Toolbar class keeps its existing public API (`activate`, `deactivate`, `selectTool`, `setDisabled`, `updateSandCount`, `onToolSelected`, `active`, `disabled`). Internally it renders via React.

The tricky part: the current toolbar uses `Resources.Shovel.toSprite()` etc. for Excalibur sprites. For React, we need the raw image URLs. The sprite assets are loaded via the Excalibur loader, but we need the URL paths to pass as `<img src>`. Check `src/resources.ts` for how assets are loaded to get the paths.

**Step 1: Check src/resources.ts for asset paths**

Read `src/resources.ts` to find the shovel and wall-tool image paths. These will be passed as `spriteUrl` to the React component.

**Step 2: Rewrite src/view/toolbar.ts**

```ts
import { Scene, Keys } from 'excalibur';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ToolType } from '../tool-type.ts';
import ToolbarComponent from '../ui/ToolbarComponent.tsx';

export { ToolType };

// These paths must match the asset paths in resources.ts
import shovelUrl from '/public/images/shovel.png';  // adjust path based on resources.ts
import wallToolUrl from '/public/images/wall-tool.png';  // adjust path based on resources.ts

const TOOL_DEFS = [
  { type: ToolType.Shovel, hotkeyLabel: '1', spriteUrl: shovelUrl },
  { type: ToolType.Wall, hotkeyLabel: '2', spriteUrl: wallToolUrl },
];

export class Toolbar {
  private root: Root | null = null;
  private container: HTMLDivElement | null = null;
  private activeTool: ToolType = ToolType.Shovel;
  private _disabled = true;
  private sandCount = 0;

  onToolSelected: ((tool: ToolType) => void) | null = null;

  get active(): ToolType {
    return this.activeTool;
  }

  get disabled(): boolean {
    return this._disabled;
  }

  activate(_scene: Scene): void {
    this.container = document.createElement('div');
    document.getElementById('game-ui')!.appendChild(this.container);
    this.root = createRoot(this.container);
    this.setDisabled(true);
    this.render();
  }

  selectTool(tool: ToolType): void {
    this.activeTool = tool;
    this.render();
    this.onToolSelected?.(tool);
  }

  setDisabled(disabled: boolean): void {
    this._disabled = disabled;
    this.render();
  }

  updateSandCount(count: number): void {
    this.sandCount = count;
    this.render();
  }

  deactivate(_scene: Scene): void {
    this.root?.unmount();
    this.root = null;
    this.container?.remove();
    this.container = null;
  }

  private render(): void {
    this.root?.render(
      createElement(ToolbarComponent, {
        tools: TOOL_DEFS,
        activeTool: this.activeTool,
        disabled: this._disabled,
        sandCount: this.sandCount,
        onToolSelected: (tool: ToolType) => this.selectTool(tool),
      })
    );
  }
}
```

**Important:** The exact import paths for shovel/wall-tool images need to be determined from `src/resources.ts`. Use Vite static asset imports (`import url from './path/to/image.png'`) so Vite handles the asset correctly in dev and production builds.

**Step 3: Remove keyboard handler from Excalibur**

The old toolbar attached keyboard listeners via `scene.engine.input.keyboard.on('press', ...)`. The React component now handles keyboard shortcuts via `window.addEventListener('keydown', ...)`. No Excalibur keyboard binding needed.

**Step 4: Verify typecheck**

```bash
npx tsc --noEmit
```
Expected: No errors.

**Step 5: Verify in browser**

Open the game. The toolbar should appear centered above the sand area. Verify:
- Tool slots render with sprites
- Clicking a tool selects it (golden border)
- Pressing 1/2 switches tools
- Toolbar grays out during wave phase
- Sand count updates on wall tool badge
- Digging still works with both tools

**Step 6: Run unit tests**

```bash
npm run test:unit
```
Expected: All pass.

**Step 7: Commit**

```bash
git add src/view/toolbar.ts
git commit -m "feat: rewrite Toolbar class to render React component"
```

---

### Task 8: Position toolbar relative to game layout

**Files:**
- Modify: `src/ui/toolbar.css` or `src/view/toolbar.ts`

The current Excalibur toolbar is positioned using `computeLayout(window)` to sit above the sand area. The React toolbar uses CSS `bottom: 80px` as a rough placeholder. This task refines positioning.

Two approaches:
1. **CSS variables** - the Toolbar class sets CSS custom properties on the container based on `computeLayout()`, and the CSS references them
2. **Inline styles** - pass position as props to the React component

Use approach 1 (CSS variables):

**Step 1: Set CSS variables in Toolbar.activate()**

```ts
activate(_scene: Scene): void {
  const { tileSize, gridLeft, gridTop, gridPixelWidth } = computeLayout(window);
  const sandBottom = gridTop + TILEMAP_SAND_ROWS * tileSize;

  this.container = document.createElement('div');
  this.container.style.setProperty('--toolbar-bottom', `${window.innerHeight - sandBottom + 5}px`);
  this.container.style.setProperty('--toolbar-center-x', `${gridLeft + gridPixelWidth / 2}px`);
  document.getElementById('game-ui')!.appendChild(this.container);
  this.root = createRoot(this.container);
  this.render();
}
```

**Step 2: Update toolbar.css**

```css
.toolbar {
  position: absolute;
  bottom: var(--toolbar-bottom, 80px);
  left: var(--toolbar-center-x, 50%);
  transform: translateX(-50%);
  ...
}
```

**Step 3: Verify positioning matches the old toolbar**

Open the game and compare toolbar position to the original. It should sit in the same spot above the sand beach.

**Step 4: Commit**

```bash
git add src/view/toolbar.ts src/ui/toolbar.css
git commit -m "fix: position React toolbar using game layout coordinates"
```

---

### Task 9: Verify full game flow and clean up

**Files:**
- Possibly: `src/view/tide-hud.ts` (verify it still works independently)

**Step 1: Full playthrough test**

Play through the game in the browser:
- [ ] HUD shows level number on game start
- [ ] Planning phase: HUD expands to show state text and wave info
- [ ] Toolbar enables during planning, disables during waves
- [ ] Clicking tools and pressing 1/2 switches active tool
- [ ] Sand count updates when digging with shovel
- [ ] Wave phase: HUD collapses, toolbar grays out
- [ ] Level complete: HUD updates level number
- [ ] Game over and restart: HUD and toolbar reset correctly
- [ ] Tide mode (if accessible): tide-hud still renders via Excalibur

**Step 2: Run full test suite**

```bash
npm run build
npm run test:unit
```
Expected: All pass.

**Step 3: Run lint**

```bash
npm run lint
```
Expected: No errors.

**Step 4: Commit any cleanup**

```bash
git add -A
git commit -m "chore: clean up after React UI migration"
```

---

## Notes

- **Sprite URLs**: Task 7 needs the actual image paths from `src/resources.ts`. The implementer should read that file and use Vite static asset imports (`import shovelUrl from '../assets/shovel.png'` or similar).
- **TideHud**: `src/view/tide-hud.ts` implements `PlanningHud` and still uses Excalibur rendering. It's untouched by this plan. A follow-up can migrate it to React later.
- **Screen overlays**: Level complete, game over, wave banners remain in Excalibur. Future migration scope.
- **No store needed**: The Toolbar and Hud classes act as bridges, holding state and calling `root.render()` with fresh props on each mutation. No external state management library required.
