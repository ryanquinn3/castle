# Title Screen Splash Background Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Excalibur-rendered title scene with an HTML/React overlay that shows a responsive splash background image and styled menu buttons.

**Architecture:** Follow the existing Hud/Toolbar pattern: TitleScene becomes a thin Excalibur Scene shell that mounts/unmounts a React component into `#game-ui`. CSS handles responsive image selection via media queries and all visual styling. The splash images (`splash_desktop.png`, `splash_mobile.png`) are not added to the Excalibur loader since they are only used by CSS.

**Tech Stack:** React (createElement, no JSX needed but TSX is fine), CSS media queries, existing Excalibur scene lifecycle.

---

### Task 1: Create TitleMenuComponent

**Files:**
- Create: `src/ui/TitleMenuComponent.tsx`
- Create: `src/ui/title-menu.css`

**Step 1: Create the CSS file**

```css
.title-menu {
  position: absolute;
  inset: 0;
  background-image: url('/images/splash_desktop.png');
  background-size: cover;
  background-position: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding-bottom: 8%;
}

@media (orientation: portrait) {
  .title-menu {
    background-image: url('/images/splash_mobile.png');
  }
}

.title-menu__panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.6);
  padding: 24px 40px;
  border-radius: 8px;
}

.title-menu__title {
  color: white;
  font-size: 64px;
  font-family: sans-serif;
  margin: 0;
}

.title-menu__subtitle {
  color: rgba(255, 255, 255, 0.85);
  font-size: 16px;
  font-family: sans-serif;
  margin: 0;
  text-align: center;
  max-width: 400px;
}

.title-menu__btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 20px;
  font-family: sans-serif;
  padding: 8px 16px;
}

.title-menu__btn--tide {
  color: rgb(100, 180, 255);
}

.title-menu__btn--classic {
  color: rgb(160, 200, 160);
}

.title-menu__btn:hover {
  text-decoration: underline;
}
```

**Step 2: Create the React component**

```tsx
import type { FC } from 'react';
import './title-menu.css';

interface TitleMenuProps {
  onSelectTide: () => void;
  onSelectClassic: () => void;
}

const TitleMenuComponent: FC<TitleMenuProps> = ({ onSelectTide, onSelectClassic }) => {
  return (
    <div className="title-menu">
      <div className="title-menu__panel">
        <h1 className="title-menu__title">Castle</h1>
        <p className="title-menu__subtitle">
          Dig moats and build walls to protect your castle from the rising tide.
        </p>
        <button className="title-menu__btn title-menu__btn--tide" onClick={onSelectTide}>
          Tide Mode
        </button>
        <button className="title-menu__btn title-menu__btn--classic" onClick={onSelectClassic}>
          Classic Mode
        </button>
      </div>
    </div>
  );
};

export default TitleMenuComponent;
```

**Step 3: Verify build**

Run: `npm run build`
Expected: PASS (component is created but not yet mounted anywhere)

**Step 4: Commit**

```bash
git add src/ui/TitleMenuComponent.tsx src/ui/title-menu.css
git commit -m "feat: add TitleMenuComponent with splash background"
```

---

### Task 2: Rewire TitleScene to mount the React component

**Files:**
- Modify: `src/title-scene.ts`

**Step 1: Rewrite TitleScene**

Replace all Excalibur actor code with the HTML overlay pattern used by Hud/Toolbar.

```ts
import { Color, Engine, FadeInOut, Scene } from 'excalibur';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import TitleMenuComponent from './ui/TitleMenuComponent.tsx';

export class TitleScene extends Scene {
  private root: Root | null = null;
  private container: HTMLDivElement | null = null;

  override onActivate(): void {
    this.container = document.createElement('div');
    document.getElementById('game-ui')!.appendChild(this.container);
    this.root = createRoot(this.container);

    const fadeTransitions = {
      destinationIn: new FadeInOut({
        duration: 500,
        direction: 'in' as const,
        color: Color.Black,
      }),
      sourceOut: new FadeInOut({
        duration: 500,
        direction: 'out' as const,
        color: Color.Black,
      }),
    };

    this.root.render(
      createElement(TitleMenuComponent, {
        onSelectTide: () => {
          void this.engine.goToScene('tide', { ...fadeTransitions });
        },
        onSelectClassic: () => {
          void this.engine.goToScene('game', { ...fadeTransitions });
        },
      })
    );
  }

  override onDeactivate(): void {
    this.root?.unmount();
    this.root = null;
    this.container?.remove();
    this.container = null;
  }
}
```

Key changes:
- Removed `onInitialize` (was creating Excalibur actors)
- Added `onActivate`/`onDeactivate` lifecycle for mount/unmount
- Removed `computeLayout` import (no longer needed)
- Scene transitions are triggered via callback props

**Step 2: Verify build**

Run: `npm run build`
Expected: PASS

**Step 3: Visual verification**

Open the dev server in browser. Confirm:
- Splash image fills the background
- Title, subtitle, and buttons appear in lower-center dark panel
- Clicking "Tide Mode" transitions to tide scene
- Clicking "Classic Mode" transitions to classic scene
- Returning to title (via game over restart) re-mounts the menu correctly

**Step 4: Commit**

```bash
git add src/title-scene.ts
git commit -m "feat: rewire title scene to HTML/React overlay"
```

---

### Task 3: Handle scene transition cleanup

**Files:**
- Modify: `src/title-scene.ts` (if needed)
- Modify: `src/ui/title-menu.css` (if needed)

**Step 1: Verify the fade transition**

The Excalibur `FadeInOut` transition renders on the canvas layer. The HTML overlay sits on top of the canvas via `#game-ui`. During the fade-out transition, the title menu HTML will be visible on top of the fade.

Fix: in `onDeactivate`, unmount the React root immediately so the HTML disappears before/during the canvas fade. If the timing feels wrong, add a CSS transition on `.title-menu` opacity that the scene triggers before navigating.

Test by clicking both mode buttons and watching the transition. If the HTML overlay lingers over the fade, we need to hide the container before calling `goToScene`, then let `onDeactivate` do final cleanup.

Adjusted approach if needed in the callbacks:

```ts
onSelectTide: () => {
  this.container!.style.display = 'none';
  void this.engine.goToScene('tide', { ...fadeTransitions });
},
```

**Step 2: Verify round-trip**

- Start game from title
- Trigger game over
- Confirm title screen re-appears correctly with background and buttons

**Step 3: Commit (if changes were needed)**

```bash
git add src/title-scene.ts src/ui/title-menu.css
git commit -m "fix: clean up title overlay during scene transitions"
```

---

### Task 4: Remove unused splash images from Excalibur loader (cleanup)

**Files:**
- Verify: `src/resources.ts` has no references to splash images (it shouldn't, but confirm)

**Step 1: Verify no Excalibur references to splash images**

Run: `grep -r "splash" src/`
Expected: No results in `resources.ts`. Only references should be in `title-menu.css`.

**Step 2: Run full test suite**

Run: `npm run test:unit`
Expected: All tests pass.

Run: `npm run build`
Expected: PASS

**Step 3: Commit (if any cleanup was needed)**

```bash
git commit -m "chore: verify no stale splash image references"
```
