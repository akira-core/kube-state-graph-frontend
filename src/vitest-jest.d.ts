import 'vitest/globals';

declare global {
  const jest: (typeof import('vitest'))['vi'];
  namespace jest {
    type Mock = import('vitest').Mock;
    type SpyInstance = import('vitest').MockInstance;
    // Vitest's Mock is generic over a function type, not (Return, Args).
    type MockedFunction<T extends (...args: never[]) => unknown> = import('vitest').Mock<T>;
  }
}

export {};
