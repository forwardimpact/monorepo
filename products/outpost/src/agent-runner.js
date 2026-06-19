/**
 * AgentRunner — spawn agent process, capture output, update state.
 */

import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { isoTimestamp } from "@forwardimpact/libutil";
import {
  readPosture,
  effectivePosture,
  loadManifest,
  draftSkills,
} from "./posture.js";

/**
 * System-prompt directive injected under the `brief` posture. Neutralises any
 * draft-side prose in a materialised agent definition and forbids writing the
 * posture record.
 */
const BRIEF_DIRECTIVE =
  "Adoption posture: brief. Run only read-and-brief work. Do not draft or " +
  "send content on the user's behalf for delivery to anyone else, do not move " +
  "or write files outside the knowledge base, and never write the posture " +
  "record (~/.fit/outpost/posture.json).";

/** Spawn agent CLI processes, capture their output, and update agent state. */
export class AgentRunner {
  #spawn;
  #stateManager;
  #log;
  #activeChildren;
  #cacheDir;
  #fs;
  #proc;
  #clock;
  #runtime;
  #posturePath;
  #manifestPath;

  /**
   * @param {Object | (() => Object | Promise<{default?: Object}>)} spawn -
   *   The posix-spawn module, or a (possibly async) loader returning it. A
   *   loader lets the Bun-FFI module load lazily so plain `node` invocations
   *   that never wake an agent don't pull in `bun:ffi`.
   * @param {import('./state-manager.js').StateManager} stateManager
   * @param {Function} logFn - Logging function
   * @param {string} cacheDir - Cache directory for state files
   * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
   *   Injected runtime bag (uses `fs` (async), `proc`, `clock`).
   * @param {{posturePath: string, manifestPath: string}} posture - Paths to the
   *   posture record (read-only on the wake path) and the skill-posture
   *   membership manifest.
   */
  constructor(spawn, stateManager, logFn, cacheDir, runtime, posture) {
    if (!spawn) throw new Error("spawn is required");
    if (!stateManager) throw new Error("stateManager is required");
    if (!logFn) throw new Error("logFn is required");
    if (!cacheDir) throw new Error("cacheDir is required");
    if (!runtime?.fs) throw new Error("runtime.fs is required");
    if (!runtime?.proc) throw new Error("runtime.proc is required");
    if (!runtime?.clock) throw new Error("runtime.clock is required");
    if (!posture?.posturePath)
      throw new Error("posture.posturePath is required");
    if (!posture?.manifestPath)
      throw new Error("posture.manifestPath is required");
    this.#spawn = spawn;
    this.#stateManager = stateManager;
    this.#log = logFn;
    this.#cacheDir = cacheDir;
    this.#fs = runtime.fs;
    this.#proc = runtime.proc;
    this.#clock = runtime.clock;
    this.#runtime = runtime;
    this.#posturePath = posture.posturePath;
    this.#manifestPath = posture.manifestPath;
    this.#activeChildren = new Set();
  }

  /** @returns {Set<number>} */
  get activeChildren() {
    return this.#activeChildren;
  }

  /**
   * Resolve the injected spawn collaborator to the posix-spawn module,
   * invoking and unwrapping a loader thunk on first use.
   * @returns {Promise<Object>}
   */
  async #resolveSpawn() {
    if (typeof this.#spawn === "function" && !this.#spawn.spawn) {
      const loaded = await this.#spawn();
      this.#spawn = loaded?.spawn ? loaded : (loaded?.default ?? loaded);
    }
    return this.#spawn;
  }

  /**
   * Test whether a path exists, via the async fs surface.
   * @param {string} p
   * @returns {Promise<boolean>}
   */
  async #exists(p) {
    return this.#fs.access(p).then(
      () => true,
      () => false,
    );
  }

  /**
   * Find the claude CLI binary
   * @returns {Promise<string>}
   */
  async #findClaude() {
    const HOME = homedir();
    const paths = [
      "/usr/local/bin/claude",
      join(HOME, ".claude", "bin", "claude"),
      join(HOME, ".local", "bin", "claude"),
      "/opt/homebrew/bin/claude",
    ];
    for (const p of paths) if (await this.#exists(p)) return p;
    return "claude";
  }

  /**
   * Expand ~ paths
   * @param {string} p
   * @returns {string}
   */
  #expandPath(p) {
    return p.startsWith("~/") ? join(homedir(), p.slice(2)) : resolve(p);
  }

  /**
   * Mark an agent as failed
   * @param {Object} agentState
   * @param {string} error
   */
  #failAgent(agentState, error) {
    Object.assign(agentState, {
      status: "failed",
      startedAt: null,
      lastWokeAt: isoTimestamp(this.#clock.now()),
      lastError: String(error).slice(0, 500),
    });
  }

  /**
   * Resolve the spawn flags the recorded posture adds. Under `brief` (also the
   * default when no posture is recorded), deny every draft-side skill by name
   * and inject the brief directive — a deterministic gate the woken agent
   * cannot override under `bypassPermissions`. Under `brief+draft`, add
   * nothing. The posture record is read here, never written.
   * @returns {Promise<string[]>} Extra args to append to the spawn argv.
   */
  async #postureArgs() {
    const posture = effectivePosture(
      await readPosture(this.#fs, this.#posturePath),
    );
    if (posture !== "brief") return [];
    const manifest = await loadManifest(this.#fs, this.#manifestPath);
    const denied = draftSkills(manifest)
      .map((s) => `Skill(${s})`)
      .join(" ");
    const args = ["--append-system-prompt", BRIEF_DIRECTIVE];
    if (denied) args.unshift("--disallowedTools", denied);
    return args;
  }

  /**
   * Build environment for a child process.
   * Merges the current process env with config-level env overrides.
   * Expands ~ in values to the user's home directory.
   * @param {Record<string, string>} [configEnv]
   * @returns {Record<string, string>}
   */
  #buildSpawnEnv(configEnv) {
    const env = { ...this.#proc.env };
    if (configEnv) {
      const home = homedir();
      for (const [key, value] of Object.entries(configEnv)) {
        const v = String(value);
        env[key] = v.startsWith("~/") ? join(home, v.slice(2)) : v;
      }
    }
    return env;
  }

  /**
   * Validate the agent's kb path exists, spawn `claude --agent` with the prompt "Observe and act.", and update agent state to active/idle/failed.
   * @param {string} agentName
   * @param {Object} agent
   * @param {Object} state
   * @param {Record<string, string>} [configEnv] - Extra env vars from config
   */
  async wake(agentName, agent, state, configEnv) {
    if (!agent.kb) {
      this.#log(`Agent ${agentName}: no "kb" specified, skipping.`);
      return;
    }
    const kbPath = this.#expandPath(agent.kb);
    if (!(await this.#exists(kbPath))) {
      this.#log(
        `Agent ${agentName}: path "${kbPath}" does not exist, skipping.`,
      );
      return;
    }

    const claude = await this.#findClaude();

    this.#log(`Waking agent: ${agentName} (kb: ${agent.kb})`);

    const as = (state.agents[agentName] ||= {});
    as.status = "active";
    as.startedAt = isoTimestamp(this.#clock.now());
    await this.#stateManager.save(state);

    const spawnArgs = [
      "--chrome",
      "--agent",
      agentName,
      "--print",
      ...(await this.#postureArgs()),
      "-p",
      "Observe and act.",
    ];

    const env = this.#buildSpawnEnv(configEnv);
    const spawnMod = await this.#resolveSpawn();

    try {
      const { pid, stdoutFile, stderrFile } = spawnMod.spawn(
        claude,
        spawnArgs,
        env,
        kbPath,
        this.#runtime,
      );
      this.#activeChildren.add(pid);

      const exitCode = await spawnMod.waitForExit(
        pid,
        undefined,
        this.#runtime,
      );
      this.#activeChildren.delete(pid);

      const stdout = spawnMod.readOutput(stdoutFile, this.#runtime);
      const stderr = spawnMod.readOutput(stderrFile, this.#runtime);

      if (exitCode === 0) {
        this.#log(
          `Agent ${agentName} completed. Output: ${stdout.slice(0, 200)}...`,
        );
        await this.#stateManager.updateAgentState(
          as,
          stdout,
          agentName,
          this.#cacheDir,
        );
      } else {
        const errMsg = stderr || stdout || `Exit code ${exitCode}`;
        this.#log(`Agent ${agentName} failed: ${errMsg.slice(0, 300)}`);
        this.#failAgent(as, errMsg);
      }
    } catch (err) {
      this.#log(`Agent ${agentName} failed: ${err.message}`);
      this.#failAgent(as, err.message);
    }
    await this.#stateManager.save(state);
  }

  /**
   * Send SIGTERM to all tracked child processes
   */
  killActiveChildren() {
    for (const pid of this.#activeChildren) {
      try {
        this.#proc.kill(pid, "SIGTERM");
        this.#log(`Sent SIGTERM to child PID ${pid}`);
      } catch {
        // Already exited
      }
    }
    this.#activeChildren.clear();
  }
}
