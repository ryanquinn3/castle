# Sand Inventory HUD

Move the sand inventory display from the toolbar (Wall tool slot) to the HUD as a "Resources" section. Applies to both Level Mode and Tide Mode.

## What changes

### New: Resources section in HUD

Both `HudComponent.tsx` and `TideHudComponent.tsx` gain a Resources section below existing top-left info.

```
Level 1                          Click a tile to dig
Waves: 3 x 2.0h

[sand_icon] Sand: 3
```

- Icon: `public/images/sand_inventory_sprite.png`
- Label: "Sand:"
- Animated count that ticks toward target value over ~300ms
- Gold color flash on the number during animation, fading back to white
- Animation via CSS transition + `requestAnimationFrame` stepping the displayed number

### Data flow

No changes to `InventoryModel`. Redirect the update path:

**Before:** dig/build action -> `inventory.addSand()`/`removeSand()` -> `toolbar.updateSandCount(inventory.sand)`

**After:** dig/build action -> `inventory.addSand()`/`removeSand()` -> HUD receives updated sand count

### Toolbar cleanup

Remove from `ToolbarComponent.tsx`:
- `sandCount` prop
- `<span className="toolbar__sand-count">` on Wall tool slot
- Associated CSS in `toolbar.css`

Remove from `toolbar.ts`:
- `updateSandCount()` method and `sandCount` state

Remove `toolbar.updateSandCount()` calls from `SingleCellDigging` / planning phase code.

## Files to modify

- `src/ui/HudComponent.tsx` -- add Resources section with animated sand count
- `src/ui/TideHudComponent.tsx` -- add Resources section with animated sand count
- `src/ui/hud.css` -- styles for Resources section + animation
- `src/view/hud.ts` -- add `updateSand(count)` method
- `src/view/tide-hud.ts` -- add `updateSand(count)` method
- `src/view/single-cell-digging.ts` -- redirect sand updates to HUD instead of toolbar
- `src/view/toolbar.ts` -- remove `updateSandCount()`
- `src/ui/ToolbarComponent.tsx` -- remove sand count display
- `src/ui/toolbar.css` -- remove sand count styles
