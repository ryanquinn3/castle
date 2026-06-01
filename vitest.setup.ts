// Stub the browser globals that Excalibur reads at module-load time when the
// unit tests transitively import resources/tile. Unit tests never actually
// render, so the stubs only need to satisfy constructors, not behave like
// real DOM nodes.
(globalThis as { window?: unknown }).window = {
  innerWidth: 1024,
  innerHeight: 768,
};
(globalThis as { Image?: unknown }).Image = class {};

function makeFakeCanvas(): unknown {
  const noop = (): void => {};
  const fakeCtx = new Proxy(
    {},
    {
      get: () => noop,
    },
  );
  // A bare object satisfies width/height/getContext/setAttribute/etc. via the
  // Proxy fallback: properties default to a no-op function, assignments are
  // simply stored. Excalibur's Raster touches setAttribute, width, height,
  // getContext, and similar.
  const store: Record<string, unknown> = { getContext: () => fakeCtx };
  return new Proxy(store, {
    get: (target, prop) => {
      if (prop in target) {
        return target[prop as string];
      }
      return noop;
    },
    set: (target, prop, value) => {
      target[prop as string] = value;
      return true;
    },
  });
}
(globalThis as { document?: unknown }).document = {
  createElement: (tag: string) => {
    if (tag === "canvas") {
      return makeFakeCanvas();
    }
    return {};
  },
};
HTMLMediaElement.prototype.canPlayType = () => "probably" as CanPlayTypeResult;
