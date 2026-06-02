/**
 * System prompt composition for agent runners.
 *
 * libeval assembles every agent system prompt from up to two parallel,
 * sibling-tagged sections (see COALIGNED.md § L0):
 *
 *     <agent_profile>
 *     …persona body…
 *     </agent_profile>
 *
 *     <session_protocol>
 *     …orchestration mechanics, then any amendment…
 *     </session_protocol>
 *
 * The two tags are siblings joined by a blank line — neither nests inside
 * the other. A section appears only when its content is present. A
 * system-prompt amendment is folded into the protocol trailer before
 * wrapping, so it lands transparently inside `<session_protocol>`. The tag
 * convention lives entirely here: profile `.md` files and trailer constants
 * carry no tags.
 *
 * Helpers:
 *
 * - `composeProfilePrompt(name, opts)` — profile + `claude_code` preset.
 *   Used by agent participants that need the full Claude Code tool surface.
 *
 * - `composeLeadPrompt(opts)` — plain string, no preset. Used by lead
 *   roles (supervisor, facilitator, discuss lead) that should only see
 *   the orchestration instructions and optionally a profile body.
 *
 * - `composeSystemPrompt(opts)` — unified entry point. Folds `amend` into
 *   the protocol section, then delegates to one of the above based on
 *   `opts.role`.
 */

import { join } from "node:path";

/** Sibling section tags. Neither nests inside the other. */
const AGENT_PROFILE_TAG = "agent_profile";
const SESSION_PROTOCOL_TAG = "session_protocol";

/** Wrap content in a semantic section tag, each on its own line. */
function wrapSection(tag, content) {
  return `<${tag}>\n${content}\n</${tag}>`;
}

/**
 * Assemble the parallel `<agent_profile>` / `<session_protocol>` sections.
 * Each section is emitted only when its content is non-empty; the two tags
 * are siblings joined by a blank line and never nest.
 *
 * @param {object} parts
 * @param {string} [parts.body] - Profile body, already frontmatter-stripped.
 * @param {string} [parts.protocol] - Session protocol trailer, with any
 *   amendment already folded in.
 * @returns {string}
 */
function assembleSections({ body, protocol }) {
  const sections = [];
  if (body) sections.push(wrapSection(AGENT_PROFILE_TAG, body));
  if (protocol) sections.push(wrapSection(SESSION_PROTOCOL_TAG, protocol));
  return sections.join("\n\n");
}

/**
 * Read a profile `.md`, strip its frontmatter, and return the trimmed body.
 * Reads synchronously off the injected `runtime.fsSync` surface — this
 * composer runs inside the synchronous SDK-option builders of the
 * supervisor / facilitator / discusser / judge factories, so it cannot go
 * async without an unbounded cascade.
 *
 * @param {string} name - Profile basename (no `.md` suffix)
 * @param {string} profilesDir - Directory containing `<name>.md`
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {string}
 */
function readProfileBody(name, profilesDir, runtime) {
  const path = join(profilesDir, `${name}.md`);
  const raw = runtime.fsSync.readFileSync(path, "utf8");
  return stripFrontmatter(raw).trim();
}

/**
 * Compose a `claude_code`-preset system prompt from a profile file. The
 * profile body is wrapped in `<agent_profile>`; an optional protocol trailer
 * is wrapped in a sibling `<session_protocol>`.
 *
 * @param {string} name - Profile basename (no `.md` suffix)
 * @param {object} opts
 * @param {string} opts.profilesDir - Directory containing `<name>.md`
 * @param {string} [opts.trailer] - Session protocol, wrapped as a sibling
 *   `<session_protocol>` section after a blank line
 * @param {import("@forwardimpact/libutil/runtime").Runtime} opts.runtime - Ambient collaborators; uses `fsSync.readFileSync`.
 * @returns {{type: "preset", preset: "claude_code", append: string}}
 */
export function composeProfilePrompt(name, { profilesDir, trailer, runtime }) {
  const body = readProfileBody(name, profilesDir, runtime);
  return {
    type: "preset",
    preset: "claude_code",
    append: assembleSections({ body, protocol: trailer }),
  };
}

/**
 * Compose a plain-string system prompt for a lead role (no Claude Code
 * preset). The protocol trailer is wrapped in `<session_protocol>`; an
 * optional profile body is wrapped in a sibling `<agent_profile>` before it.
 *
 * @param {object} opts
 * @param {string} [opts.profile] - Profile basename (no `.md` suffix)
 * @param {string} [opts.profilesDir] - Directory containing profile files
 * @param {string} opts.trailer - Session protocol (orchestration instructions)
 * @param {import("@forwardimpact/libutil/runtime").Runtime} opts.runtime - Ambient collaborators; uses `fsSync.readFileSync`.
 * @returns {string}
 */
export function composeLeadPrompt({ profile, profilesDir, trailer, runtime }) {
  if (!trailer) throw new Error("trailer is required");
  const body = profile
    ? readProfileBody(profile, profilesDir, runtime)
    : undefined;
  return assembleSections({ body, protocol: trailer });
}

/**
 * Unified entry point for composing system prompts. Folds an optional
 * amendment into the protocol trailer — so it lands inside
 * `<session_protocol>` — then delegates by role.
 *
 * @param {object} opts
 * @param {"lead"|"agent"} opts.role - `"lead"` produces a plain string;
 *   `"agent"` produces a `claude_code` preset object.
 * @param {string} [opts.profile] - Profile basename
 * @param {string} [opts.profilesDir]
 * @param {string} opts.trailer - Session protocol (orchestration instructions)
 * @param {string} [opts.amend] - Caller-supplied amendment, appended inside
 *   `<session_protocol>` after the trailer with a blank-line separator.
 * @param {import("@forwardimpact/libutil/runtime").Runtime} opts.runtime - Ambient collaborators; uses `fsSync.readFileSync`.
 * @returns {string | {type: "preset", preset: "claude_code", append: string}}
 */
export function composeSystemPrompt({
  role,
  profile,
  profilesDir,
  trailer,
  amend,
  runtime,
}) {
  if (!trailer) throw new Error("trailer is required");
  const protocol = amend ? `${trailer}\n\n${amend}` : trailer;
  if (role === "lead") {
    return composeLeadPrompt({
      profile,
      profilesDir,
      trailer: protocol,
      runtime,
    });
  }
  if (profile) {
    return composeProfilePrompt(profile, {
      profilesDir,
      trailer: protocol,
      runtime,
    });
  }
  return {
    type: "preset",
    preset: "claude_code",
    append: assembleSections({ protocol }),
  };
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
