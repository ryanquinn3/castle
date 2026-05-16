# Excalibur.js Physics

Summary of Excalibur.js physics features, sourced from the official docs (excaliburjs.com/docs).

## Modes

Two simulation modes, selected via `SolverStrategy`:

- **Arcade** (default): AABB-style resolution for non-rotated rectangles. Best for platformers, tile-based, top-down. Does not honor `body.friction`.
- **Realistic**: Rigid-body dynamics with rotation, friction, restitution. Use for stacking, Angry Birds-style.

```ts
const game = new ex.Engine({
  physics: {
    solver: ex.SolverStrategy.Arcade, // or Realistic
    gravity: ex.vec(0, 700),
  },
});
```

## Global Config (`PhysicsConfig`)

- `enabled`: master toggle.
- `gravity`: `Vector` applied to `Active` bodies with `useGravity = true`.
- `solver`: `Arcade` or `Realistic`.
- `continuous`: continuous collision detection for fast movers (prevents tunneling).
- `positionIterations` / `velocityIterations`: realistic solver passes. More iterations = better overlap resolution and response stability, at CPU cost.

## Pipeline

1. **Broadphase**: dynamic AABB tree finds candidate pairs.
2. **Narrowphase**: exact overlap test on candidates.
3. **Solver**: applies impulses / position corrections per configured strategy.

## Components

Every `Actor` ships with both; raw `Entity` must add them manually.

### `BodyComponent`

Owns motion state and physical properties:

- Motion: `pos`, `vel`, `acc`, `rotation`, `angularVelocity`.
- Material: `mass`, `inertia`, `friction` (realistic only), `bounciness` (restitution, 0=absorb, 1=perfect bounce).
- Gravity: `useGravity` (only effective with `CollisionType.Active`).
- DoF locks: `limitDegreeOfFreedom` to restrict X, Y, or rotation.
- Sleeping: bodies auto-sleep when below thresholds; toggle with `setSleeping(true|false)`.

### `ColliderComponent`

Holds the shape; performs intersection, raycast, and point-containment tests. Geometry is local to the entity's `TransformComponent`.

Swap collider at runtime:

```ts
actor.collider.set(newCollider);
```

## Collider Shapes

```ts
ex.Shape.Circle(10);                  // CircleCollider, radius 10
ex.Shape.Box(100, 10);                // PolygonCollider as box
new ex.PolygonCollider({               // convex polygon, points clockwise
  points: [ex.vec(-100, 0), ex.vec(0, -50), ex.vec(100, 0)],
});
new ex.EdgeCollider({ begin: ex.vec(0,0), end: ex.vec(100,0) }); // line segment
new ex.CompositeCollider([             // multi-shape (e.g. capsule)
  ex.Shape.Circle(10, ex.vec(0, -20)),
  ex.Shape.Box(20, 40),
  ex.Shape.Circle(10, ex.vec(0,  20)),
]);
```

Actors auto-build a collider from `radius` or `width`/`height` in their constructor.

## Collision Types (`CollisionType`)

| Type              | Raises events | Resolved (pushed) |
|-------------------|---------------|-------------------|
| `PreventCollision`| no            | no                |
| `Passive`         | yes           | no                |
| `Active`          | yes           | yes (vs Active/Fixed) |
| `Fixed`           | yes           | no, but pushes Active |

Interaction matrix (rows vs cols, "events" = no resolution, "resolve" = events + physics):

|         | Prevent | Passive | Active  | Fixed   |
|---------|---------|---------|---------|---------|
| Prevent | -       | -       | -       | -       |
| Passive | -       | events  | events  | events  |
| Active  | -       | events  | resolve | resolve |
| Fixed   | -       | events  | resolve | -       |

Default for a freshly created `Collider` is `Passive`; explicitly set `Active` or `Fixed` to take part in resolution.

```ts
actor.body.collisionType = ex.CollisionType.Active;
actor.body.useGravity = true;
```

## Events

Fired on actor, body, or collider.

- `collisionstart`: bodies first touch; will not refire until separation. Good for pickups, surface contact.
- `collisionend`: bodies separate. Good for "left ground" detection.
- `precollision`: every frame of overlap, before resolution. Cancellable for custom response (e.g. breakout angle tweaks).
- `postcollision`: every frame after resolution; only fires for `Active`-`Active` or `Active`-`Fixed`.

```ts
actor.on('collisionstart', (e) => { /* e.other, e.contact */ });
actor.on('precollision',   (e) => { /* tweak or cancel */ });
```

## Practical Notes for Castle

- Wave water vs tiles: a `Passive` collider on each wave segment plus `Active`/`Fixed` tiles would let us listen for `collisionstart` to flag flooded columns without paying for resolution.
- For a column-by-column wave we likely do not need the solver at all; consider `PreventCollision` and run our own AABB checks per column to keep things deterministic.
- If we ever add tossed debris or splashes, switch those actors to `Active` with `useGravity = true` and keep `Arcade` solver.

## Sources

- https://excaliburjs.com/docs/physics/
- https://excaliburjs.com/docs/bodies/
- https://excaliburjs.com/docs/collisiontypes/
- https://excaliburjs.com/docs/colliders/
- https://excaliburjs.com/docs/collision-events/
