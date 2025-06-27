import "@testing-library/react";
import { webcrypto } from "node:crypto";
import { afterEach, vi } from "vitest";

// Polyfill crypto for Node.js 18 compatibility
if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = webcrypto as any;
}
if (typeof global.crypto === "undefined") {
  global.crypto = webcrypto as any;
}

// Mock fetch globally - ensure compatibility with Node.js 18
if (typeof globalThis.fetch === "undefined") {
  globalThis.fetch = vi.fn();
}
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

// Ensure AbortController is available globally for Node.js 18 compatibility
if (typeof globalThis.AbortController === "undefined") {
  globalThis.AbortController = MockAbortController as any;
}
global.AbortController = MockAbortController as any;

// Mock File API - ensure compatibility with Node.js 18
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

// Ensure File is available globally for Node.js 18 compatibility
if (typeof globalThis.File === "undefined") {
  globalThis.File = MockFile as any;
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
