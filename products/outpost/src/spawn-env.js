/**
 * spawn-env — env allow-set and the pure spawn-environment filter.
 *
 * The daemon-mediated wake paths forward `config.env` from
 * `~/.fit/outpost/scheduler.json` into spawned `claude` processes. This module
 * is the single trust contract that decides which keys are honored.
 */

import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Build a Set whose mutators are neutralised. `Object.freeze` alone does not
 * stop `Set.prototype.add`/`delete`/`clear` from mutating internal state, so
 * the trust contract (design Decision #1) is only durable if the mutators
 * themselves throw.
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
 * code review — this is the trust contract (design Decision #1).
 * @type {ReadonlySet<string>}
 */
export const AGENT_ENV_ALLOWSET = frozenSet(["ANTHROPIC_API_KEY"]);

/**
 * Build the spawn environment from a base env plus allow-set members of
 * `configEnv`. Keys outside the allow-set are dropped and returned in
 * `rejections`. Tilde-prefixed values are home-expanded. Pure; the caller logs.
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
