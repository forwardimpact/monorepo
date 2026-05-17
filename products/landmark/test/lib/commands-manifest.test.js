/**
 * Drift-guard tests for `products/landmark/src/lib/commands-manifest.js`.
 *
 * Two directions of drift are guarded:
 *
 *   1. `SUBCOMMAND_EXPANSIONS`/`FLAT_SMOKE_OPTIONS` cover every
 *      needsSupabase command from the canonical COMMANDS map.
 *   2. The bin's libcli `commands` array — read as text + regex-extracted
 *      — declares user-visible subcommands whose top-level name is
 *      represented by either `SUBCOMMAND_EXPANSIONS[top]` (space-separated
 *      names) or `FLAT_SMOKE_OPTIONS[top]` (flat names).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMMANDS,
  SUBCOMMAND_EXPANSIONS,
  FLAT_SMOKE_OPTIONS,
} from "../../src/lib/commands-manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_PATH = join(__dirname, "..", "..", "bin", "fit-landmark.js");

describe("commands-manifest covers every gated command", () => {
  test("each needsSupabase: true command has a smoke entry", () => {
    for (const [name, entry] of Object.entries(COMMANDS)) {
      if (!entry.needsSupabase) continue;
      const inSubcommands = Object.hasOwn(SUBCOMMAND_EXPANSIONS, name);
      const inFlat = Object.hasOwn(FLAT_SMOKE_OPTIONS, name);
      const noRequiredFlags = name === "health";
      assert.ok(
        inSubcommands || inFlat || noRequiredFlags,
        `gated command "${name}" is in neither SUBCOMMAND_EXPANSIONS nor FLAT_SMOKE_OPTIONS`,
      );
    }
  });

  test("every needsSupabase command in libcli array appears in the manifest", () => {
    const binSource = readFileSync(BIN_PATH, "utf8");
    // Pull every `name:` literal from the libcli definition.
    const nameRegex = /name:\s*"([^"]+)"/g;
    const names = [];
    let m;
    while ((m = nameRegex.exec(binSource))) names.push(m[1]);

    // Filter to the user-visible command names (those that match a top-level
    // COMMANDS key). marker is the only top-level name we permit to lack
    // smoke options since marker.needsSupabase is false.
    for (const fullName of names) {
      const top = fullName.split(" ")[0];
      if (!Object.hasOwn(COMMANDS, top)) continue;
      if (!COMMANDS[top].needsSupabase) continue;
      const isExpanded =
        Object.hasOwn(SUBCOMMAND_EXPANSIONS, top) ||
        Object.hasOwn(FLAT_SMOKE_OPTIONS, top);
      const noRequiredFlags = top === "health";
      assert.ok(
        isExpanded || noRequiredFlags,
        `libcli surface "${fullName}" (top="${top}") missing from manifest`,
      );
    }
  });

  test("SUBCOMMAND_EXPANSIONS entries reference real top-level commands", () => {
    for (const top of Object.keys(SUBCOMMAND_EXPANSIONS)) {
      assert.ok(
        Object.hasOwn(COMMANDS, top),
        `SUBCOMMAND_EXPANSIONS["${top}"] has no matching COMMANDS entry`,
      );
    }
  });
});
