/**
 * This module holds the shared AgentRunner test setup. It is lifted here so
 * `agent-runner.test.js` and its `agent-runner-privilege.test.js` sibling
 * reuse one set of mock collaborators (per .claude/rules/test-file-shape.md).
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

/** The posture-config object every AgentRunner needs when you build it. */
export const postureCfg = () => ({
  posturePath: POSTURE_PATH,
  manifestPath: MANIFEST_PATH,
});

/**
 * Create a mock spawn module that records calls and returns a successful
 * result. The mock captures all six positional args. These include the 5th
 * (`runtime`) and the 6th (`disclaim`). The privilege tests can then assert
 * the disclaim value.
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
 * Build a runtime whose mock fs reports that TEST_KB exists. The proc env of
 * that runtime carries the supplied vars.
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
