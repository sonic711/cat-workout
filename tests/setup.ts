import { vi } from 'vitest'

declare global {
  interface Window {
    ResizeObserver?: typeof ResizeObserver
  }
}

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  // @ts-expect-error - assigning stub to global scope for tests
  window.ResizeObserver = ResizeObserverStub
  // @ts-expect-error - assign stub for node env
  global.ResizeObserver = ResizeObserverStub
}

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}
