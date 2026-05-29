# HUD Overlay Refactor

## Goal

Refactor the HUD to overlay on top of the tilemap instead of reserving dedicated space above the grid. Remove the `HUD_TOP = 80` gap that wastes vertical space on small viewports. Polish the HUD with glassmorphism styling.

## Layout Changes

### Remove HUD_TOP gap

Set `HUD_TOP = 0` in `config.ts`. The tilemap and grid move up, reclaiming vertical space. Tile size calculation benefits from the extra height.

### Panel positioning

Two panels anchored to the **tilemap edges** (not the game grid or viewport):

- **Left panel**: top-left of tilemap bounds (`mapLeft`, `mapTop`)
- **Right panel**: top-right of tilemap bounds (`mapLeft + mapPixelWidth`, `mapTop`)

The top ~6 rows are ocean tilemap (non-interactive), so the HUD won't block gameplay.

`computeLayout()` must export `mapLeft`, `mapTop`, and `mapPixelWidth` if not already. The HUD receives these as props and positions via inline styles (runtime-computed values).

On window resize, layout recomputes and HUD repositions.

## Split Layout

### Left panel (always visible)

- Level number ("Level 1")
- Wave info ("Wave 2 of 3, height x2") -- shown during both phases

### Right panel (always visible, content swaps)

- **Planning phase**: active tool + scoop budget
- **Wave phase**: status text ("Sending wave...")
- Crossfade transition between content states

## Glassmorphism Style

### Panel base

```css
background: rgba(0, 0, 0, 0.35);
backdrop-filter: blur(8px);
border: 1px solid rgba(255, 255, 255, 0.12);
border-radius: 6px;
padding: 8px 12px;
```

### Typography

- System sans-serif font stack
- Level text: white, 14px, semi-bold
- Wave/state info: rgba(255,255,255,0.7), 12px
- Budget/tool: white, scoop count in orange accent (existing color)

### Transitions

- Right panel content fades with `opacity` + `transition: opacity 0.3s ease`

## Component Structure

Refactor `HudComponent` into:

- `<Hud>` -- parent, receives tilemap bounds, positions children
- `<HudLeft>` -- level + wave info
- `<HudRight>` -- tool/budget or status text

### API surface (unchanged)

- `hud.showPlanning(data)` / `hud.hidePlanning()`
- `hud.updateState(text)` / `hud.updateLevel(n)`

These route to the appropriate panel internally.

## Files to change

- `src/config.ts` -- set `HUD_TOP = 0`, export tilemap bounds from layout
- `src/view/hud.ts` -- split into left/right panels, accept layout bounds
- `src/ui/hud.css` -- glassmorphism styling, split panel positioning
- `src/game-session.ts` -- pass layout bounds to HUD on activate and resize
