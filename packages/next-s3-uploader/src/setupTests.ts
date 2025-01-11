import "@testing-library/react";
import { afterEach, vi } from "vitest";

// Mock fetch globally
global.fetch = vi.fn();

// Mock AbortController
class MockAbortController {
  signal: AbortSignal;
  constructor() {
    this.signal = {
      aborted: false,
      onabort: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as AbortSignal;
  }
  abort() {
    (this.signal as any).aborted = true;
  }
}

global.AbortController = MockAbortController as any;

// Mock File API
class MockFile {
  name: string;
  size: number;
  type: string;
  lastModified: number;

  constructor(parts: any[], filename: string, options: any = {}) {
    this.name = filename;
    this.size = parts.reduce((acc, curr) => acc + curr.length, 0);
    this.type = options.type || "";
    this.lastModified = options.lastModified || Date.now();
  }

  slice(start?: number, end?: number) {
    return new Blob(["mock data"]);
  }
}

global.File = MockFile as any;

// Mock Blob
class MockBlob {
  size: number;
  type: string;

  constructor(parts: any[], options: any = {}) {
    this.size = parts.reduce((acc, curr) => acc + curr.length, 0);
    this.type = options.type || "";
  }
}

global.Blob = MockBlob as any;

// Clean up
afterEach(() => {
  vi.clearAllMocks();
});
