import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Scene } from 'excalibur';
import type { ReactElement } from 'react';
import { ActionType } from '../action-type.ts';

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

vi.mock('../ui/ToolbarComponent.tsx', () => ({
  default: 'toolbar-component',
}));

describe('Toolbar', () => {
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

  test('mounts into game-ui on activate and unmounts on deactivate', async () => {
    const { Toolbar } = await import('./toolbar.ts');
    const toolbar = new Toolbar();

    toolbar.activate(scene);
    expect(appendChild).toHaveBeenCalledTimes(1);
    // activate() calls render() once, then setDisabled(true) calls it again
    expect(render.mock.calls.length).toBeGreaterThanOrEqual(1);

    toolbar.deactivate(scene);
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test('setActions(null) renders with actions=null — shows the empty-state prompt', async () => {
    const { Toolbar } = await import('./toolbar.ts');
    const toolbar = new Toolbar();
    toolbar.activate(scene);

    toolbar.setActions(null);

    expect(latestProps().actions).toBeNull();
  });

  test('setActions with views renders with the provided action list', async () => {
    const { Toolbar } = await import('./toolbar.ts');
    const toolbar = new Toolbar();
    toolbar.activate(scene);

    const views = [
      {
        type: ActionType.Dig,
        hotkey: 'S',
        label: 'Dig',
        sandEffect: { amount: 1, variant: 'earn' as const },
        disabled: false,
      },
      {
        type: ActionType.BuildWall,
        hotkey: 'W',
        label: 'Build Wall',
        sandEffect: { amount: 1, variant: 'spend' as const },
        disabled: true,
      },
    ];
    toolbar.setActions(views);

    const props = latestProps();
    expect(props.actions).toEqual(views);
  });

  test('disabled action views pass the disabled flag through', async () => {
    const { Toolbar } = await import('./toolbar.ts');
    const toolbar = new Toolbar();
    toolbar.activate(scene);

    const views = [
      {
        type: ActionType.BuildTower,
        hotkey: 'T',
        label: 'Build Tower',
        sandEffect: { amount: 15, variant: 'spend' as const },
        disabled: true,
      },
    ];
    toolbar.setActions(views);

    const props = latestProps();
    const actionList = props.actions as typeof views;
    expect(actionList[0].disabled).toBe(true);
  });

  test('setDisabled passes disabled flag to component', async () => {
    const { Toolbar } = await import('./toolbar.ts');
    const toolbar = new Toolbar();
    toolbar.activate(scene);

    toolbar.setDisabled(false);
    expect(latestProps().disabled).toBe(false);

    toolbar.setDisabled(true);
    expect(latestProps().disabled).toBe(true);
  });

  test('onActionTriggered fires when the component calls onActionTriggered', async () => {
    const { Toolbar } = await import('./toolbar.ts');
    const toolbar = new Toolbar();
    toolbar.activate(scene);

    const handler = vi.fn<(action: ActionType) => void>();
    toolbar.onActionTriggered = handler;

    // Simulate the component calling back
    const props = latestProps();
    const onActionTriggered = props.onActionTriggered as (action: ActionType) => void;
    onActionTriggered(ActionType.Dig);

    expect(handler).toHaveBeenCalledExactlyOnceWith(ActionType.Dig);
  });

  test('setSandCount is a no-op (sand affordability is reflected via ActionView.disabled)', async () => {
    const { Toolbar } = await import('./toolbar.ts');
    const toolbar = new Toolbar();
    toolbar.activate(scene);
    const callsBefore = render.mock.calls.length;

    toolbar.setSandCount(42);
    // setSandCount does not trigger a re-render; affordability is reflected per-action in ActionView.disabled
    expect(render.mock.calls.length).toBe(callsBefore);
  });
});
