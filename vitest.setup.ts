// Stub the browser window before any module under test imports `config.ts`,
// which reads `window.innerWidth`/`innerHeight` at module-load time to size the grid.
// Unit tests don't depend on the actual dimensions; any stable value works.
(globalThis as { window?: unknown }).window = { innerWidth: 1024, innerHeight: 768 };
