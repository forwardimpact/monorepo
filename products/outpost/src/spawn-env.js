/**
 * spawn-env — env allow-set and the pure spawn-environment filter.
 *
 * The daemon-mediated wake paths forward `config.env` from
 * `~/.fit/outpost/scheduler.json` into spawned `claude` processes. This module
 * is the single trust contract that decides which keys the daemon honors.
 */

import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Build a Set with neutralised mutators. `Object.freeze` alone does not stop
 * `Set.prototype.add`/`delete`/`clear`. They still mutate internal state. So
 * the allow-set is a durable trust contract only when the mutators themselves
 * throw.
 * @param {string[]} keys
 * @returns {ReadonlySet<string>}
 */
function frozenSet(keys) {
  const set = new Set(keys);
  for (const m of ["add", "delete", "clear"]) {
    Object.defineProperty(set, m, {
      value: () => {
        throw new TypeError(`AGENT_ENV_ALLOWSET is immutable: ${m}() denied`);
      },
    });
  }
  return Object.freeze(set);
}

/**
 * Env keys the daemon honors for spawned agents. Add new keys here under
 * code review. This single point is the env trust contract.
 * @type {ReadonlySet<string>}
 */
export const AGENT_ENV_ALLOWSET = frozenSet(["ANTHROPIC_API_KEY"]);

/**
 * Build the spawn environment from a base env plus allow-set members of
 * `configEnv`. This function drops keys outside the allow-set and returns them
 * in `rejections`. It expands tilde-prefixed values to the home directory. It
 * is pure, so the caller logs.
 * @param {Record<string,string>=} configEnv
 * @param {NodeJS.ProcessEnv} baseEnv
 * @returns {{ env: Record<string,string>, rejections: string[] }}
 */
export function buildSpawnEnv(configEnv, baseEnv) {
  const env = { ...baseEnv };
  const rejections = [];
  if (configEnv) {
    const home = homedir();
    for (const [key, value] of Object.entries(configEnv)) {
      if (!AGENT_ENV_ALLOWSET.has(key)) {
        rejections.push(key);
        continue;
      }
      const v = String(value);
      env[key] = v.startsWith("~/") ? join(home, v.slice(2)) : v;
    }
  }
  return { env, rejections };
}
