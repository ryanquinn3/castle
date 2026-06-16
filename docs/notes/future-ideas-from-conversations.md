# Future ideas mined from past conversations

Assembled 2026-06-15 by scanning all 127 prior Claude Code session transcripts for
this repo (825 user-typed messages across 121 sessions). These are forward-looking
hints the user dropped — deferred features, "someday" musings, and architectural
directions floated but not committed at the time. Citations point to the source
session and message number.

**Status legend:** 🔵 open · 🟡 partially done / superseded · ✅ likely shipped (verify before re-investing)

---

## Water / wave simulation

The single most recurring theme. The user repeatedly pushed away from the original
column-only water model toward a richer, physics-like simulation. Much of this
coalesced into the "pressure water" project; several sub-ideas remain open.

- 🟡 **Vector-based water momentum.** "momentum of water is a vector." Long-running
  ambition for realistic water; recurs May 19 → May 22 → Jun 9 → Jun 11.
  _(d960a14c #1)_
- 🔵 **Waves wrap/bend around obstacles.** "give wave segments the ability to more
  naturally wrap around obstacles instead of strictly moving vertical… when hitting
  a wall, the wave splits but tries to keep moving south when it can." _(b3e1b4be #10)_
  Explicitly deferred again later: "i dont want to make the lateral movement change
  yet" _(2bf6db5d #1)_.
- 🔵 **Horizontal (X) velocity component for wave segments.** "they will eventually
  have x direction too. adding that is out of scope for now though." _(658737c9 #7)_
- 🔵 **Depth-transfer dissipation on collision.** "each water cell dissipate via depth
  (eg a collision transfers depth vs merging)… curious to dig into that more." _(002d73c1 #3)_
- 🔵 **Replenish top-row depth as volume spreads south.** "resetting the top water
  rows depth back up as its volume spreads south… needs more exploration." _(002d73c1 #3)_
- 🔵 **Optional backward spreading of water** (Proposal A, phase 4) — flagged as future/optional.
- 🟡 **First-class water floor / offset modeling.** Model both a water floor and surface
  level, not just height: "if a wall is height 5 and a 7 wave hits it, 2 units should go
  over but with an offset of 5." Also: board slope is "as if there is a .5 wall at each
  row." Wanted as "first class modeling" since "its a core part of the water mechanics."
  _(1fba63fa #5, #9)_
- 🟡 **Unified gravity-driven water model.** "the lateral spread feature… might be a
  special case of this effect… water follows gravity down" — sees one universal model
  underneath the special cases. _(ce63e972 #5)_
- 🟡 **Frontal vs shear erosion.** Shear/glancing contact against wall edges should erode
  "at a lot lower of a cost as a direct hit." _(002d73c1 #9)_ — frontal-vs-shear now in
  `wave-erosion.ts`; confirm coverage matches the original vision.

## Architecture / refactor

- 🔵 **Excalibur-native collision for water↔terrain.** "while not implemented yet… i want
  to move towards more excalibur native primitives instead of re-implementing them
  ourselves" — replace hand-rolled wave-segment collision. _(002d73c1 #8)_
- 🔵 **Dedicated lightweight `Water` actor.** "create a fork… a 'Water' actor that just has
  our water component… but first migrate the wave-overlay to not directly depend on
  wave-segment." _(f55a0d92 #7)_
- 🔵 **ECS for the sand layer.** "could making an ECS system for the sand layer be a decent
  idea?" _(54e28691 #2)_
- 🔵 **Event-emitter / `.pipe()` decoupling to kill prop-drilling.** Excalibur actors have
  their own emitters with `.pipe()` — "might make things cleaner where we dont need to
  pass through a million prop drilling layers." _(54e28691 #7, also #3-#4)_
- 🔵 **Universal postUpdate water-drain model.** "changing the wave system to do a
  postUpdate hook… decrement the depth adjustment universally for all of them without…
  all of these additional considerations and state management." _(54e28691 #15-#16)_
- 🟡 **Sim/render separation for the wave overlay.** "i like having a separate system from
  the renderer" — a logic system that drives component-based overlay actor data. _(002d73c1 #11-#12)_
- 🟡 **Pluggable digging-strategy abstraction**, later self-questioned: "not so sure how
  valid that digging strategy interface is anymore." _(52cce6ab #4 → edb3bf92 #4)_
- 🟡 **Push tile-type branching into the terrain abstraction.** _(0a06252e #7)_ — terrain
  later became Actors; check whether branching was fully folded in.

## Game modes & progression

- ✅ **Continuous (non-level) mode.** Floated as deferred future direction; became Tide
  mode. _(74574c0e #1)_
- 🔵 **Near-unobtainable high-tide survival win.** "high tide survival to almost be
  unobtainable," score = waves survived. _(b5f9f406 #5)_
- 🔵 **Remove the wave/concurrency cap entirely.** "we can start with 1 but im tempted to
  just remove the limitation entirely." _(b5f9f406 #4)_
- 🟡 **Elevation caps scale with level.** Wall height → 15 and hole depth → -10 after
  level 10; ±20 at level 20. _(7b07ca35 #1)_
- 🟡 **Design constraint for pressure-water:** bigger waves must not make level duration
  grow unbounded — "i dont want levels to grow wildly in time duration." _(002d73c1 #6)_

## Rendering / visual

- 🔵 **Hybrid oblique wall view** — the wished-for ideal, deferred on art cost: "what i
  would want in an ideal world but… the most difficult from an art perspective." _(5ebcffd0 #3)_
- 🟡 **Full per-tier, per-orientation wall sprite set.** Start with one west-facing wall;
  spritesheet laid out with room to "extend in the future." _(117d58eb #1, 14a2af20 #24)_
- 🔵 **Top/bottom (N/S) autotile neighbor awareness.** "i will eventually want top bottom
  awareness too." _(14a2af20 #17)_
- 🔵 **Distinct heights per wall tier** for at-a-glance legibility — "shorter wall sprites
  for lower level walls." _(14a2af20 #19)_
- 🔵 **Full-width tower redesign.** "towers can be wider… wed need a totally new design to
  make them full width from the get-go." _(14a2af20 #18)_
- 🟡 **Wave texture emanating from off-grid water row** one tile above row 0. _(b3e1b4be #9)_
- 🔵 **Revisit tier-4 wall texture.** _(5ebcffd0 #11)_
- ✅ **Moist-sand wetness reveal** as water passes over sand. _(176104a5 #2)_ — appears
  shipped (in AGENTS.md); confirm it matches the described effect.

## UX / UI

- 🔵 **Mobile pinch-to-zoom camera.** Zoom into the game on pinch for a better mobile
  experience (design doc was drafted). _(ad221b19 #1)_
- 🟡 **Extensible toolbar with reserved empty slots** for future tools. _(2b04bbe6 #1, #4)_
  — shovel/wall/tower realized part of this; "empty slots for future tools" implies more.

## Meta / tooling

- 🔵 **Human-facing debug-state visualizer.** Debug serialization is "just for player <>
  agent interactions. we could always build a script to visualize it for humans." _(460918de #3)_
- 🔵 **`w` hotkey to trigger a wave on demand** (also lets tests skip the timer). _(002d73c1 #16)_
- 🔵 **Migrate tide countdown to Excalibur's clock system** so tests don't wait real time.
  _(002d73c1 #15)_
- 🟡 **Replay harness** to reproduce end-game bugs from serialized state. _(88f50eed #3)_ —
  built then retired in the terrain→Actor migration; rebuild as a browser-Vitest harness if needed.
- 🟡 **Extensible PreToolUse hook framework** (uv/python, "easy to add to"). _(89c44c14 #1)_
- 🟡 **Screenshot tool improvements for future agents** (auto-select game mode). _(201a1346 #1)_
- 🟡 **Parallelize the browser-test stage** of static-check. _(d971a322 #3)_

---

### Notes on method
- Source: `~/.claude/projects/-Users-ryanquinn-repos-castle/*.jsonl`, filtered to human-typed
  messages only (tool results, system reminders, and skill boilerplate stripped).
- Six parallel agents each scanned ~20 sessions.
- The user's style is overwhelmingly concrete/current-task; genuine "someday" musings are
  sparse, so this list is close to exhaustive rather than a sample.
- Status flags are best-effort from session context + AGENTS.md; verify ✅/🟡 items against
  current code before acting.
