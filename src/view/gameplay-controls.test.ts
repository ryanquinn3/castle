import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Scene } from 'excalibur';
import type { ReactElement } from 'react';

const render = vi.fn<(node: ReactElement<Record<string, unknown>>) => void>();
const unmount = vi.fn<() => void>();
const appendChild = vi.fn<(node: unknown) => void>();
const remove = vi.fn<() => void>();
const scene = {} as Scene;

function latestProps(): Record<string, unknown> {
  const element = render.mock.calls.at(-1)?.[0];
  expect(element).toBeDefined();
  return element!.props;
}

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn<() => { render: typeof render; unmount: typeof unmount }>(() => ({ render, unmount })),
}));

vi.mock('../ui/GameplayControlsComponent.tsx', () => ({
  default: 'gameplay-controls-component',
}));

describe('GameplayControls', () => {
  beforeEach(() => {
    render.mockClear();
    unmount.mockClear();
    appendChild.mockClear();
    remove.mockClear();

    const container = { remove };
    globalThis.document = {
      createElement: vi.fn<() => typeof container>(() => container),
      getElementById: vi.fn<() => { appendChild: typeof appendChild }>(() => ({ appendChild })),
    } as unknown as Document;
  });

  test('mounts controls into the game UI and unmounts them', async () => {
    const { GameplayControls } = await import('./gameplay-controls.ts');
    const controls = new GameplayControls();
    const onExitConfirmed = vi.fn<() => void>();
    const onExitDialogOpenChange = vi.fn<(open: boolean) => void>();

    controls.activate(scene, { onExitConfirmed, onExitDialogOpenChange });

    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
    expect(latestProps()).toMatchObject({
      isExitDialogOpen: false,
      onExitConfirmed,
    });

    controls.openExitDialog();

    expect(latestProps().isExitDialogOpen).toBe(true);
    expect(onExitDialogOpenChange).toHaveBeenLastCalledWith(true);

    controls.closeExitDialog();

    expect(latestProps().isExitDialogOpen).toBe(false);
    expect(onExitDialogOpenChange).toHaveBeenLastCalledWith(false);

    controls.openExitDialog();
    onExitDialogOpenChange.mockClear();

    controls.deactivate(scene);

    expect(onExitDialogOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
