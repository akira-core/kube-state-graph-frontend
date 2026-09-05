import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

// Panel tests use Jest APIs (`jest.fn`, `jest.mock`). Alias them onto Vitest.
Object.assign(globalThis, { jest: vi });

// jsdom supplies Web Storage, but Node 26 ships its own `localStorage` global that is
// unusable without `--localstorage-file` and leaves the global undefined here. Every
// `localStorage` read in the app sits behind a try/catch (a browser can refuse storage),
// so on such a Node the persistence paths — view time range, theme choice — silently do
// nothing and their tests pass vacuously, while CI's Node 22 runs the real jsdom storage.
// Two environments testing different code is how a green local run became a red CI one.
// Install a working in-memory Storage whenever the global is unusable.
function storageWorks(candidate: unknown): boolean {
  try {
    const store = candidate as Storage | null | undefined;
    if (store == null) {
      return false;
    }
    store.setItem('__ksg_probe__', '1');
    const ok = store.getItem('__ksg_probe__') === '1';
    store.removeItem('__ksg_probe__');
    return ok;
  } catch {
    return false;
  }
}

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length(): number {
      return entries.size;
    },
    key(index: number): string | null {
      return [...entries.keys()][index] ?? null;
    },
    getItem(key: string): string | null {
      return entries.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      entries.set(key, String(value));
    },
    removeItem(key: string): void {
      entries.delete(key);
    },
    clear(): void {
      entries.clear();
    },
  };
}

for (const key of ['localStorage', 'sessionStorage'] as const) {
  if (!storageWorks(globalThis[key])) {
    Object.defineProperty(globalThis, key, { value: memoryStorage(), configurable: true, writable: true });
  }
}

// Storage is shared by every test in a file. Without this, a test that persists a value
// hands it to the next one, whose own "select that value" is then a no-op that fires no
// change — the refetch it asserts never happens, and the failure names the count, not the
// leak that caused it.
afterEach(() => {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // A storage that refuses to clear holds nothing worth leaking.
  }
});

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

if (typeof HTMLCanvasElement !== 'undefined') {
  const stub = (): CanvasRenderingContext2D =>
    ({
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: [] }),
      putImageData: () => {},
      createImageData: () => [],
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      fillText: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      arc: () => {},
      fill: () => {},
      measureText: () => ({ width: 0 }),
      transform: () => {},
      rect: () => {},
      clip: () => {},
    }) as unknown as CanvasRenderingContext2D;
  HTMLCanvasElement.prototype.getContext = stub as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Radix (and user-event) need pointer-capture APIs that jsdom does not implement.
if (typeof Element !== 'undefined') {
  if (typeof Element.prototype.hasPointerCapture !== 'function') {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (typeof Element.prototype.setPointerCapture !== 'function') {
    Element.prototype.setPointerCapture = () => undefined;
  }
  if (typeof Element.prototype.releasePointerCapture !== 'function') {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => undefined;
  }
}
