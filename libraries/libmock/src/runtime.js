import { createMockClock } from "./mock/clock.js";
import { createMockFs } from "./mock/fs.js";
import { createMockProcess } from "./mock/infra.js";
import { createMockSubprocess } from "./mock/subprocess.js";
import { createMockFinder } from "./mock/finder.js";

/**
 * Build a frozen mock runtime bag for tests, matching the production
 * `Runtime` typedef. Every field defaults to its canonical
 * libmock fake and is independently overridable via `overrides`.
 *
 * @param {object} [overrides] - Per-field replacements.
 * @param {object} [overrides.fs] - Async fs surface (default `createMockFs()`).
 * @param {object} [overrides.fsSync] - Sync fs surface (defaults to `fs`).
 * @param {object} [overrides.proc] - Process surface.
 * @param {object} [overrides.clock] - Clock surface.
 * @param {object} [overrides.subprocess] - Subprocess surface.
 * @param {object} [overrides.finder] - Finder collaborator.
 * @returns {Readonly<import('../../libutil/src/runtime.js').Runtime>}
 */
export function createTestRuntime(overrides = {}) {
  const fs = overrides.fs ?? createMockFs();
  const fsSync = overrides.fsSync ?? fs;
  const proc = overrides.proc ?? createMockProcess();
  const clock = overrides.clock ?? createMockClock();
  const subprocess = overrides.subprocess ?? createMockSubprocess();
  const finder = overrides.finder ?? createMockFinder();
  return Object.freeze({ fs, fsSync, proc, clock, subprocess, finder });
}
