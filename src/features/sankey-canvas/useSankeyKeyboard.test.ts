import { renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useSankeyKeyboard } from './useSankeyKeyboard';

const zoomSpies = () => ({ zoomIn: vi.fn(), zoomOut: vi.fn(), fit: vi.fn(), resetOne: vi.fn() });
type ZoomSpies = ReturnType<typeof zoomSpies>;

/**
 * The handler reads `key`, `target` and `preventDefault` only — but the exclusion guard calls
 * `target.closest(...)`, so the target has to be a real element rather than a stub. Each event
 * therefore carries a node built with `document.createElement`; a detached node is its own root,
 * which is all `closest` needs. The cast is the one place this stops being a real synthetic event.
 */
const keyEvent = (key: string, target: HTMLElement = document.createElement('div')) => {
  const preventDefault = vi.fn();
  const evt = { key, target, preventDefault } as unknown as KeyboardEvent<HTMLDivElement>;
  return { evt, preventDefault };
};

/** Renders the hook and returns `press`, which fires one key and hands back that event's spy. */
const setup = (focusMode: boolean) => {
  const zoom = zoomSpies();
  const onFocusModeChange = vi.fn();
  const { result } = renderHook(() => useSankeyKeyboard({ zoom, focusMode, onFocusModeChange }));
  const press = (key: string, target?: HTMLElement) => {
    const { evt, preventDefault } = keyEvent(key, target);
    result.current(evt);
    return preventDefault;
  };
  return { zoom, onFocusModeChange, press };
};

const expectNoZoomCall = (zoom: ZoomSpies) => {
  expect(zoom.zoomIn).not.toHaveBeenCalled();
  expect(zoom.zoomOut).not.toHaveBeenCalled();
  expect(zoom.fit).not.toHaveBeenCalled();
  expect(zoom.resetOne).not.toHaveBeenCalled();
};

describe('useSankeyKeyboard zoom shortcuts', () => {
  it('zooms in on both + and =, so the shifted and unshifted key agree', () => {
    const { zoom, press } = setup(false);
    expect(press('+')).toHaveBeenCalledTimes(1);
    expect(press('=')).toHaveBeenCalledTimes(1);
    expect(zoom.zoomIn).toHaveBeenCalledTimes(2);
    expect(zoom.zoomOut).not.toHaveBeenCalled();
  });

  it('zooms out on - and consumes the event', () => {
    const { zoom, press } = setup(false);
    expect(press('-')).toHaveBeenCalledTimes(1);
    expect(zoom.zoomOut).toHaveBeenCalledTimes(1);
    expect(zoom.zoomIn).not.toHaveBeenCalled();
  });

  it('fits the diagram to the container on 0 and consumes the event', () => {
    const { zoom, press } = setup(false);
    expect(press('0')).toHaveBeenCalledTimes(1);
    expect(zoom.fit).toHaveBeenCalledTimes(1);
    expect(zoom.resetOne).not.toHaveBeenCalled();
  });

  it('resets to 1:1 on 1 and consumes the event', () => {
    const { zoom, press } = setup(false);
    expect(press('1')).toHaveBeenCalledTimes(1);
    expect(zoom.resetOne).toHaveBeenCalledTimes(1);
    expect(zoom.fit).not.toHaveBeenCalled();
  });
});

describe('useSankeyKeyboard focus mode', () => {
  it('enters focus mode on f when it is off', () => {
    const { onFocusModeChange, press } = setup(false);
    expect(press('f')).toHaveBeenCalledTimes(1);
    expect(onFocusModeChange).toHaveBeenCalledWith(true);
  });

  it('enters focus mode on a shifted F exactly as on f', () => {
    const { onFocusModeChange, press } = setup(false);
    expect(press('F')).toHaveBeenCalledTimes(1);
    expect(onFocusModeChange).toHaveBeenCalledWith(true);
  });

  it('leaves focus mode on f or F when it is already on — the key is a toggle, not an entry', () => {
    const { onFocusModeChange, press } = setup(true);
    press('f');
    press('F');
    expect(onFocusModeChange).toHaveBeenCalledTimes(2);
    expect(onFocusModeChange).toHaveBeenNthCalledWith(1, false);
    expect(onFocusModeChange).toHaveBeenNthCalledWith(2, false);
  });

  it('leaves focus mode on Escape when it is on', () => {
    const { onFocusModeChange, press } = setup(true);
    expect(press('Escape')).toHaveBeenCalledTimes(1);
    expect(onFocusModeChange).toHaveBeenCalledWith(false);
  });

  it('lets Escape through untouched when focus mode is off, so an enclosing dialog still closes', () => {
    const { zoom, onFocusModeChange, press } = setup(false);
    expect(press('Escape')).not.toHaveBeenCalled();
    expect(onFocusModeChange).not.toHaveBeenCalled();
    expectNoZoomCall(zoom);
  });
});

describe('useSankeyKeyboard target exclusions', () => {
  it('ignores a key it has no shortcut for and leaves the event alone', () => {
    const { zoom, onFocusModeChange, press } = setup(false);
    expect(press('a')).not.toHaveBeenCalled();
    expect(onFocusModeChange).not.toHaveBeenCalled();
    expectNoZoomCall(zoom);
  });

  it('ignores a keydown targeting a native text or choice control, whose own key handling wins', () => {
    const { zoom, press } = setup(false);
    for (const tag of ['input', 'select', 'textarea'] as const) {
      expect(press('+', document.createElement(tag)), tag).not.toHaveBeenCalled();
    }
    expectNoZoomCall(zoom);
  });

  it('ignores a keydown targeting a role="radio" control, whose arrow and space keys are its own', () => {
    const { zoom, onFocusModeChange, press } = setup(false);
    const radio = document.createElement('div');
    radio.setAttribute('role', 'radio');
    expect(press('0', radio)).not.toHaveBeenCalled();
    expect(press('f', radio)).not.toHaveBeenCalled();
    expect(onFocusModeChange).not.toHaveBeenCalled();
    expectNoZoomCall(zoom);
  });

  it('ignores a keydown from a child of an excluded control — the guard walks ancestors, not just the target', () => {
    const { zoom, press } = setup(false);
    const radio = document.createElement('div');
    radio.setAttribute('role', 'radio');
    const label = document.createElement('span');
    radio.appendChild(label);
    expect(press('-', label)).not.toHaveBeenCalled();
    expectNoZoomCall(zoom);
  });

  it('does NOT exclude a plain button, so the zoom control bar keeps the shortcuts while focused', () => {
    const { zoom, onFocusModeChange, press } = setup(false);
    const button = document.createElement('button');
    expect(press('+', button)).toHaveBeenCalledTimes(1);
    expect(zoom.zoomIn).toHaveBeenCalledTimes(1);
    expect(press('f', button)).toHaveBeenCalledTimes(1);
    expect(onFocusModeChange).toHaveBeenCalledWith(true);
  });
});
