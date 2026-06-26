/**
 * Shared AgentRunner test setup, lifted so `agent-runner.test.js` and its
 * `agent-runner-privilege.test.js` sibling reuse one set of mock collaborators
 * (per .claude/rules/test-file-shape.md).
 */
import {
  spy,
  createTestRuntime,
  createMockFs,
  createMockProcess,
} from "@forwardimpact/libmock";

export const TEST_KB = "/work/outpost-test-kb";
export const POSTURE_PATH = "/home/u/.fit/outpost/posture.json";
export const MANIFEST_PATH = "/pkg/config/skill-postures.json";
export const MANIFEST = {
  "draft-emails": "draft",
  "organize-files": "draft",
  "send-chat": "draft",
  "meeting-prep": "brief",
  "extract-entities": "brief",
};
export const DRAFT_TOKENS =
  "Skill(draft-emails) Skill(organize-files) Skill(send-chat)";

/** The posture-config object every AgentRunner construction needs. */
export const postureCfg = () => ({
  posturePath: POSTURE_PATH,
  manifestPath: MANIFEST_PATH,
});

/**
 * Create a mock spawn module that records calls and returns a successful result.
 * Captures all six positional args, including the 5th (`runtime`) and 6th
 * (`disclaim`) so the privilege tests can assert the disclaim value.
 * @param {Object} [options]
 * @param {number} [options.exitCode=0]
 * @param {string} [options.stdout="ok"]
 * @returns {{ module: Object, calls: Array }}
 */
export function createMockSpawn({ exitCode = 0, stdout = "ok" } = {}) {
  const calls = [];
  return {
    calls,
    module: {
      spawn(executable, args, env, cwd, runtime, disclaim) {
        calls.push({ executable, args, env, cwd, runtime, disclaim });
        return {
          pid: 999,
          stdoutFile: "/tmp/mock-stdout",
          stderrFile: "/tmp/mock-stderr",
        };
      },
      readOutput: () => stdout,
      waitForExit: async () => exitCode,
    },
  };
}

/**
 * Create a mock StateManager whose `save`/`updateAgentState` are spies.
 * @returns {{ save: Function, updateAgentState: Function }}
 */
export function createMockStateManager() {
  return {
    save: spy(async () => {}),
    updateAgentState: spy(async () => {}),
  };
}

/**
 * Build a runtime whose mock fs reports TEST_KB as existing and whose proc env
 * carries the supplied vars.
 * @param {Record<string,string>} env
 * @param {Record<string,string>} [files]
 */
export function makeRuntime(env, files = {}) {
  const fs = createMockFs({
    [MANIFEST_PATH]: JSON.stringify(MANIFEST),
    ...files,
  });
  fs.dirs.add(TEST_KB);
  return createTestRuntime({ fs, proc: createMockProcess({ env }) });
}
