/**
 * AgentRunner — spawn agent process, capture output, update state.
 */

import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

export class AgentRunner {
  #spawn;
  #stateManager;
  #log;
  #activeChildren;
  #cacheDir;

  /**
   * @param {Object} spawn - posix-spawn module
   * @param {import('./state-manager.js').StateManager} stateManager
   * @param {Function} logFn - Logging function
   * @param {string} cacheDir - Cache directory for state files
   */
  constructor(spawn, stateManager, logFn, cacheDir) {
    if (!spawn) throw new Error("spawn is required");
    if (!stateManager) throw new Error("stateManager is required");
    if (!logFn) throw new Error("logFn is required");
    if (!cacheDir) throw new Error("cacheDir is required");
    this.#spawn = spawn;
    this.#stateManager = stateManager;
    this.#log = logFn;
    this.#cacheDir = cacheDir;
    this.#activeChildren = new Set();
  }

  /** @returns {Set<number>} */
  get activeChildren() {
    return this.#activeChildren;
  }

  /**
   * Find the claude CLI binary
   * @returns {string}
   */
  #findClaude() {
    const HOME = homedir();
    const paths = [
      "/usr/local/bin/claude",
      join(HOME, ".claude", "bin", "claude"),
      join(HOME, ".local", "bin", "claude"),
      "/opt/homebrew/bin/claude",
    ];
    for (const p of paths) if (existsSync(p)) return p;
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
      lastWokeAt: new Date().toISOString(),
      lastError: String(error).slice(0, 500),
    });
  }

  /**
   * Build environment for a child process.
   * Merges the current process env with config-level env overrides.
   * Expands ~ in values to the user's home directory.
   * @param {Record<string, string>} [configEnv]
   * @returns {Record<string, string>}
   */
  #buildSpawnEnv(configEnv) {
    const env = { ...process.env };
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
   * Wake an agent by spawning its process
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
    if (!existsSync(kbPath)) {
      this.#log(
        `Agent ${agentName}: path "${kbPath}" does not exist, skipping.`,
      );
      return;
    }

    const claude = this.#findClaude();

    this.#log(`Waking agent: ${agentName} (kb: ${agent.kb})`);

    const as = (state.agents[agentName] ||= {});
    as.status = "active";
    as.startedAt = new Date().toISOString();
    this.#stateManager.save(state);

    const spawnArgs = [
      "--agent",
      agentName,
      "--print",
      "-p",
      "Observe and act.",
    ];

    const env = this.#buildSpawnEnv(configEnv);

    try {
      const { pid, stdoutFd, stderrFd } = this.#spawn.spawn(
        claude,
        spawnArgs,
        env,
        kbPath,
      );
      this.#activeChildren.add(pid);

      const [stdout, stderr] = await Promise.all([
        this.#spawn.readAll(stdoutFd),
        this.#spawn.readAll(stderrFd),
      ]);
      const exitCode = await this.#spawn.waitForExit(pid);
      this.#activeChildren.delete(pid);

      if (exitCode === 0) {
        this.#log(
          `Agent ${agentName} completed. Output: ${stdout.slice(0, 200)}...`,
        );
        this.#stateManager.updateAgentState(
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
    this.#stateManager.save(state);
  }

  /**
   * Send SIGTERM to all tracked child processes
   */
  killActiveChildren() {
    for (const pid of this.#activeChildren) {
      try {
        process.kill(pid, "SIGTERM");
        this.#log(`Sent SIGTERM to child PID ${pid}`);
      } catch {
        // Already exited
      }
    }
    this.#activeChildren.clear();
  }
}
