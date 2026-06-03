# Gameplay controls design

## Goal

Add two gameplay-only controls:

- A mute toggle.
- An `Exit` button that returns to the title screen after confirmation.

The controls appear in Classic and Tide gameplay. They do not appear on the title screen.

## User experience

The controls sit in a fixed menu at the top-left of the screen, relative to the viewport rather than the grid. The menu uses the same dark translucent style as the HUD and toolbar.

The menu contains two controls:

- One mute button that flips between sound states.
- One `Exit` text button.

Mute icon states:

- Unmuted: minimal speaker SVG.
- Muted: the same speaker SVG with a red X.

Clicking `Exit` opens a confirmation modal:

- Title: `Exit to main menu?`
- Body: `Your current run will be lost.`
- Actions: `Cancel` and `Exit`.

`Cancel` closes the modal and keeps the run. `Exit` returns to the title screen.

## Architecture

Use a shared React overlay, mounted by gameplay scenes only.

New pieces:

- `src/view/gameplay-controls.ts`: wrapper class that owns the React root, matching the current `Hud` and `Toolbar` pattern.
- `src/ui/GameplayControlsComponent.tsx`: renders the fixed menu, mute icon state, and exit confirmation modal.
- `src/ui/gameplay-controls.css`: styling for the top-left menu and modal.

Changed pieces:

- `src/sound.ts`: owns muted state and makes `playSound()` return early when muted.
- `src/level-session.ts`: mounts controls and handles confirmed exit for Classic mode.
- `src/tide-session.ts`: mounts controls and handles confirmed exit for Tide mode.

## Sound state

`src/sound.ts` exposes a small API:

- `isMuted()`
- `setMuted(muted: boolean)`
- `toggleMuted()`
- `playSound(sound: Sound)`

Muted state persists in `localStorage`, so a refresh or browser restart keeps the last choice.

`playSound()` keeps the existing `__SOUNDS_DISABLED__` guard for tests. If sounds are disabled or muted, it returns without calling `.play()`.

Muting affects future sounds. It does not stop sound instances that are already playing.

## Exit behavior

Classic mode:

- Opening the modal blocks gameplay clicks through the modal backdrop.
- Confirmed exit deactivates active planning state if present.
- Confirmed exit cancels follow-up work for the current session, removes gameplay UI, and transitions to `title`.

Tide mode:

- Opening the modal pauses the wave countdown and locks planning interaction.
- `Cancel` resumes the countdown with the remaining time and unlocks planning.
- Confirmed exit cancels follow-up work for the current session, clears timers, deactivates planning, removes gameplay UI, and transitions to `title`.

If a wave animation is already running, opening the modal does not pause the animation. Confirmed exit still returns to title and prevents the old session from advancing level, scheduling another wave, or updating UI after scene transition.

Both gameplay scenes get reliable `onDeactivate()` cleanup so switching scenes does not leave React roots, timers, overlays, or input state behind.

## Testing

Unit tests for `sound.ts`:

- `playSound()` does not call `.play()` when muted.
- `setMuted()` persists to `localStorage`.
- Saved muted state is read on startup.

If the existing test setup can test React DOM cleanly, add a small component test for the confirmation flow. Otherwise keep component logic thin and rely on typecheck plus manual browser checks.

Manual checks:

- Classic: mute toggles icon and suppresses new sounds.
- Tide: mute toggles icon and suppresses new sounds.
- `Exit` opens confirmation.
- `Cancel` keeps the current run.
- Confirmed `Exit` returns to title.
- Tide countdown freezes while the modal is open and resumes after cancel.
- Controls do not appear on the title screen.

## Documentation

Update `docs/gameplay.md` in the implementation change because these are player-facing gameplay controls.
