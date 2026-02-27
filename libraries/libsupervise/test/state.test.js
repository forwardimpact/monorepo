import { describe, test } from "node:test";
import assert from "node:assert";

import { ProcessState } from "../state.js";

describe("ProcessState", () => {
  describe("constructor", () => {
    test("initializes with down state", () => {
      const state = new ProcessState();
      assert.strictEqual(state.getState(), "down");
    });

    test("initializes with null pid", () => {
      const state = new ProcessState();
      assert.strictEqual(state.getPid(), null);
    });

    test("initializes with zero restart count", () => {
      const state = new ProcessState();
      assert.strictEqual(state.getRestartCount(), 0);
    });
  });

  describe("transitionTo", () => {
    test("transitions to starting state with pid", () => {
      const state = new ProcessState();
      state.transitionTo("starting", { pid: 1234 });

      assert.strictEqual(state.getState(), "starting");
      assert.strictEqual(state.getPid(), 1234);
    });

    test("transitions to up state with pid", () => {
      const state = new ProcessState();
      state.transitionTo("up", { pid: 5678 });

      assert.strictEqual(state.getState(), "up");
      assert.strictEqual(state.getPid(), 5678);
    });

    test("transitions to down state clears pid", () => {
      const state = new ProcessState();
      state.transitionTo("up", { pid: 1234 });
      state.transitionTo("down", { exitCode: 0 });

      assert.strictEqual(state.getState(), "down");
      assert.strictEqual(state.getPid(), null);
    });

    test("transitions to backoff increments restart count", () => {
      const state = new ProcessState();
      state.transitionTo("backoff", { exitCode: 1 });

      assert.strictEqual(state.getState(), "backoff");
      assert.strictEqual(state.getRestartCount(), 1);
    });

    test("multiple backoffs increment restart count", () => {
      const state = new ProcessState();
      state.transitionTo("backoff");
      state.transitionTo("starting", { pid: 1 });
      state.transitionTo("backoff");
      state.transitionTo("starting", { pid: 2 });
      state.transitionTo("backoff");

      assert.strictEqual(state.getRestartCount(), 3);
    });
  });

  describe("isRunning", () => {
    test("returns true when starting", () => {
      const state = new ProcessState();
      state.transitionTo("starting", { pid: 1234 });

      assert.strictEqual(state.isRunning(), true);
    });

    test("returns true when up", () => {
      const state = new ProcessState();
      state.transitionTo("up", { pid: 1234 });

      assert.strictEqual(state.isRunning(), true);
    });

    test("returns false when down", () => {
      const state = new ProcessState();
      assert.strictEqual(state.isRunning(), false);
    });

    test("returns false when stopping", () => {
      const state = new ProcessState();
      state.transitionTo("stopping");

      assert.strictEqual(state.isRunning(), false);
    });

    test("returns false when in backoff", () => {
      const state = new ProcessState();
      state.transitionTo("backoff");

      assert.strictEqual(state.isRunning(), false);
    });
  });

  describe("resetRestartCount", () => {
    test("resets count to zero", () => {
      const state = new ProcessState();
      state.transitionTo("backoff");
      state.transitionTo("backoff");
      state.transitionTo("backoff");
      state.resetRestartCount();

      assert.strictEqual(state.getRestartCount(), 0);
    });
  });

  describe("toJSON", () => {
    test("serializes state correctly", () => {
      const state = new ProcessState();
      state.transitionTo("up", { pid: 9876 });

      const json = state.toJSON();

      assert.strictEqual(json.state, "up");
      assert.strictEqual(json.pid, 9876);
      assert.strictEqual(json.restartCount, 0);
      assert.ok(json.startedAt === null || typeof json.startedAt === "number");
    });

    test("includes exit code after down transition", () => {
      const state = new ProcessState();
      state.transitionTo("up", { pid: 1234 });
      state.transitionTo("down", { exitCode: 137 });

      const json = state.toJSON();

      assert.strictEqual(json.lastExitCode, 137);
    });
  });
});
