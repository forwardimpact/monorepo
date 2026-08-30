/**
 * This module holds the shared AgentRunner test setup, lifted here so
 * `agent-runner.test.js` and its `agent-runner-privilege.test.js` sibling
 * reuse one set of mock collaborators, plus the shared KB vault fixtures the
 * kb-validator and kb-migration suites build on the real filesystem
 * (per .claude/rules/test-file-shape.md).
 */
import fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
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

// --- Shared KB vault fixtures --------------------------------------------
// The kb-validator and kb-migration suites build small vaults under mkdtemp
// because resolution and symlink traversal need real fs semantics.

export const KB_RUNTIME = { fs: fsp };
export const KB_TIERS = {
  "0-Draft/": null,
  "1-Management/": null,
  "2-Confidential/": null,
  "3-Team/": null,
  "4-Public/": null,
};
export const KB_FM =
  "---\ntype: note\ncreated: 2026-01-01\nupdated: 2026-01-02\n---\n";

const vaultRoots = [];

/**
 * Write one file inside a vault, creating parents.
 * @param {string} root @param {string} rel @param {string} content
 * @returns {Promise<void>}
 */
export async function writeVaultFile(root, rel, content) {
  await fsp.mkdir(dirname(join(root, rel)), { recursive: true });
  await fsp.writeFile(join(root, rel), content);
}

/**
 * Build a temp vault. A `null` value creates a directory; a string writes a
 * file (parents auto-created). `removeVaults` cleans every root up.
 * @param {Record<string, string|null>} spec
 * @returns {Promise<string>} The vault root.
 */
export async function makeVault(spec) {
  const root = await fsp.mkdtemp(join(tmpdir(), "kb-vault-"));
  vaultRoots.push(root);
  for (const [rel, content] of Object.entries(spec)) {
    if (content === null) {
      await fsp.mkdir(join(root, rel), { recursive: true });
    } else {
      await writeVaultFile(root, rel, content);
    }
  }
  return root;
}

/**
 * Track an externally created temp directory for cleanup.
 * @param {string} root
 * @returns {string} The same root.
 */
export function trackVault(root) {
  vaultRoots.push(root);
  return root;
}

/** Remove every vault this run created. @returns {Promise<void>} */
export async function removeVaults() {
  for (const root of vaultRoots) {
    await fsp.rm(root, { recursive: true, force: true });
  }
}
