/**
 * Config-shape guard on the shipped `config/scheduler.json`.
 *
 * Every bundled agent must declare a valid privilege level and a knowledge base
 * outside every TCC-protected folder. This asserts the shipped file only — it
 * adds no runtime path constraint in the code. Paths are stored `~`-prefixed
 * and unexpanded, so the checks are literal `startsWith`.
 */
import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PRIVILEGE_LEVELS } from "../src/privilege.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(
  readFileSync(join(__dirname, "..", "config", "scheduler.json"), "utf8"),
);

const TCC_PREFIXES = ["~/Documents", "~/Desktop", "~/Downloads", "~/Library"];
const DATA_HOME_PREFIX = "~/.local/share/fit/outpost/";

describe("bundled scheduler.json shape", () => {
  const agents = Object.entries(CONFIG.agents || {});

  test("ships at least one agent", () => {
    assert.ok(agents.length > 0, "no agents in bundled config");
  });

  for (const [name, agent] of agents) {
    test(`${name} declares a valid privilege level`, () => {
      assert.ok(
        PRIVILEGE_LEVELS.includes(agent.privilege),
        `${name}.privilege "${agent.privilege}" not in ${PRIVILEGE_LEVELS.join(", ")}`,
      );
    });

    test(`${name} kb is not in a TCC-protected folder`, () => {
      for (const prefix of TCC_PREFIXES) {
        assert.ok(
          !agent.kb.startsWith(prefix),
          `${name}.kb "${agent.kb}" is under TCC-protected ${prefix}`,
        );
      }
    });

    test(`${name} kb is under the data home`, () => {
      assert.ok(
        agent.kb.startsWith(DATA_HOME_PREFIX),
        `${name}.kb "${agent.kb}" is not under ${DATA_HOME_PREFIX}`,
      );
    });
  }
});
