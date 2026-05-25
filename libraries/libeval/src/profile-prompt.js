/**
 * System prompt composition for agent runners.
 *
 * Two helpers:
 *
 * - `composeProfilePrompt(name, opts)` — profile + `claude_code` preset.
 *   Used by agent participants that need the full Claude Code tool surface.
 *
 * - `composeLeadPrompt(opts)` — plain string, no preset. Used by lead
 *   roles (supervisor, facilitator, discuss lead) that should only see
 *   the orchestration instructions and optionally a profile body.
 *
 * - `composeSystemPrompt(opts)` — unified entry point. Delegates to one
 *   of the above based on `opts.role`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Compose a `claude_code`-preset system prompt from a profile file.
 * @param {string} name - Profile basename (no `.md` suffix)
 * @param {object} opts
 * @param {string} opts.profilesDir - Directory containing `<name>.md`
 * @param {string} [opts.trailer] - Mode-specific trailer appended after a blank line
 * @returns {{type: "preset", preset: "claude_code", append: string}}
 */
export function composeProfilePrompt(name, { profilesDir, trailer }) {
  const path = join(profilesDir, `${name}.md`);
  const raw = readFileSync(path, "utf8");
  const body = stripFrontmatter(raw).trim();
  const append = trailer && trailer.length > 0 ? `${body}\n\n${trailer}` : body;
  return { type: "preset", preset: "claude_code", append };
}

/**
 * Compose a plain-string system prompt for a lead role (no Claude Code preset).
 * @param {object} opts
 * @param {string} [opts.profile] - Profile basename (no `.md` suffix)
 * @param {string} [opts.profilesDir] - Directory containing profile files
 * @param {string} opts.trailer - Mode-specific orchestration instructions
 * @returns {string}
 */
export function composeLeadPrompt({ profile, profilesDir, trailer }) {
  if (!trailer) throw new Error("trailer is required");
  if (!profile) return trailer;
  const path = join(profilesDir, `${profile}.md`);
  const raw = readFileSync(path, "utf8");
  const body = stripFrontmatter(raw).trim();
  return `${body}\n\n${trailer}`;
}

/**
 * Unified entry point for composing system prompts.
 *
 * @param {object} opts
 * @param {"lead"|"agent"} opts.role - `"lead"` produces a plain string;
 *   `"agent"` produces a `claude_code` preset object.
 * @param {string} [opts.profile] - Profile basename
 * @param {string} [opts.profilesDir]
 * @param {string} opts.trailer - Mode-specific instructions
 * @returns {string | {type: "preset", preset: "claude_code", append: string}}
 */
export function composeSystemPrompt({ role, profile, profilesDir, trailer }) {
  if (!trailer) throw new Error("trailer is required");
  if (role === "lead") {
    return composeLeadPrompt({ profile, profilesDir, trailer });
  }
  if (profile) {
    return composeProfilePrompt(profile, { profilesDir, trailer });
  }
  return { type: "preset", preset: "claude_code", append: trailer };
}

/**
 * Strip a leading YAML frontmatter fence (`---\n…\n---\n`) from a markdown
 * string. Returns the input unchanged when no frontmatter is present.
 * @param {string} raw
 * @returns {string}
 */
function stripFrontmatter(raw) {
  if (!raw.startsWith("---\n")) return raw;
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) return raw;
  return raw.slice(end + 5);
}
