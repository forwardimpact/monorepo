/**
 * Compose system prompts for agent runners.
 *
 * libharness assembles every agent system prompt from up to two parallel,
 * sibling-tagged sections (see JIDOKA.md § L0):
 *
 *     <agent_profile>
 *     …persona body…
 *     </agent_profile>
 *
 *     <session_protocol>
 *     …orchestration mechanics, then any amendment…
 *     </session_protocol>
 *
 * The two tags are siblings. A blank line joins them. Neither nests inside
 * the other. A section appears only when its content is present. The tag
 * convention lives entirely here. Profile `.md` files and trailer constants
 * carry no tags.
 *
 * The composer assembles the `<session_protocol>` body from up to three
 * fragments, in order of decreasing generality:
 *
 *   1. the role-invariant orchestration trailer (libharness-owned);
 *   2. the profile's own hoisted `## Session Protocol` section, if present;
 *   3. a run-specific amendment, if supplied.
 *
 * Fragment 2 is the convention-based hoist. A profile may carry a level-2
 * `## Session Protocol` markdown heading whose body is the role's work
 * routine. When the heading is present, the composer lifts that section out
 * of `<agent_profile>`. It folds the section into `<session_protocol>` next
 * to the orchestration mechanics. The harness comms protocol and the role's
 * work routine then read as one coherent block. The composer drops the
 * heading line itself, because the tag already names the section. A profile
 * with no such heading is unaffected. Its entire body stays in
 * `<agent_profile>`.
 *
 * Helpers:
 *
 * - `composeProfilePrompt(name, opts)` — profile + `claude_code` preset.
 *   Agent participants that need the full Claude Code tool surface use it.
 *
 * - `composeLeadPrompt(opts)` — plain string, no preset. Lead roles
 *   (supervisor, facilitator, discuss lead) use it. They should only see
 *   the orchestration instructions and optionally a profile body.
 *
 * - `composeSystemPrompt(opts)` — unified entry point. Threads `amend` into
 *   the protocol section as the run-specific fragment. Then delegates to one
 *   of the above by `opts.role`.
 */

import { join } from "node:path";

/** Sibling section tags. Neither nests inside the other. */
const AGENT_PROFILE_TAG = "agent_profile";
const SESSION_PROTOCOL_TAG = "session_protocol";

/**
 * A level-2 heading that names the profile's hoisted session-protocol
 * section. The match ignores case. It tolerates trailing whitespace. The
 * level is fixed at two `#`, so a `### Session Protocol` subsection does
 * not trip the hoist.
 */
const SESSION_PROTOCOL_HEADING = /^##[ \t]+session protocol[ \t]*$/i;

/** A level-1 or level-2 heading. This boundary ends a hoisted section. */
const SECTION_BOUNDARY = /^#{1,2}[ \t]+\S/;

/** Wrap content in a semantic section tag, each on its own line. */
function wrapSection(tag, content) {
  return `<${tag}>\n${content}\n</${tag}>`;
}

/**
 * Assemble the parallel `<agent_profile>` / `<session_protocol>` sections.
 * This function emits the profile section only when `body` is non-empty. It
 * builds the protocol section from the fragments in the order given. It
 * joins them with a blank-line separator and drops any empty fragment. It
 * emits the protocol section only when at least one fragment survives. The
 * two tags are siblings. A blank line joins them. They never nest.
 *
 * @param {object} parts
 * @param {string} [parts.body] - Profile body, frontmatter-stripped and with
 *   any `## Session Protocol` section already hoisted out.
 * @param {Array<string | undefined>} [parts.protocolParts] - Ordered session
 *   protocol fragments: trailer, hoisted profile section, run amendment.
 * @returns {string}
 */
function assembleSections({ body, protocolParts = [] }) {
  const sections = [];
  if (body) sections.push(wrapSection(AGENT_PROFILE_TAG, body));
  const protocol = protocolParts.filter(Boolean).join("\n\n");
  if (protocol) sections.push(wrapSection(SESSION_PROTOCOL_TAG, protocol));
  return sections.join("\n\n");
}

/**
 * Split a frontmatter-stripped profile body into its persona and an optional
 * hoisted `## Session Protocol` section. The section runs from its heading to
 * the next level-1/level-2 heading (or end of body). This function drops the
 * heading line. It rejoins anything before and after the section into
 * `persona`. When the body carries no `## Session Protocol` heading, the
 * whole body returns as `persona` and `protocol` is `undefined`.
 *
 * @param {string} body - Frontmatter-stripped, trimmed profile body.
 * @returns {{ persona: string, protocol: string | undefined }}
 */
function splitSessionProtocol(body) {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => SESSION_PROTOCOL_HEADING.test(line));
  if (start === -1) return { persona: body, protocol: undefined };

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (SECTION_BOUNDARY.test(lines[i])) {
      end = i;
      break;
    }
  }

  const protocol = lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
  const before = lines.slice(0, start).join("\n").trim();
  const after = lines.slice(end).join("\n").trim();
  const persona = [before, after].filter(Boolean).join("\n\n");
  return { persona, protocol: protocol || undefined };
}

/**
 * Read a profile `.md`. Strip its frontmatter. Split off any hoisted
 * `## Session Protocol` section. Reads synchronously off the injected
 * `runtime.fsSync` surface. This composer runs inside the synchronous
 * SDK-option builders of the supervisor / facilitator / discusser / judge
 * factories. So it cannot go async without an unbounded cascade.
 *
 * @param {string} name - Profile basename (no `.md` suffix)
 * @param {string} profilesDir - Directory that contains `<name>.md`
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {{ persona: string, protocol: string | undefined }}
 */
function readProfileSections(name, profilesDir, runtime) {
  const path = join(profilesDir, `${name}.md`);
  const raw = runtime.fsSync.readFileSync(path, "utf8");
  return splitSessionProtocol(stripFrontmatter(raw).trim());
}

/**
 * Compose a `claude_code`-preset system prompt from a profile file. This
 * function wraps the persona in `<agent_profile>`. It joins the protocol
 * trailer, the profile's hoisted `## Session Protocol` section, and any
 * amendment into a sibling `<session_protocol>`, in that order.
 *
 * @param {string} name - Profile basename (no `.md` suffix)
 * @param {object} opts
 * @param {string} opts.profilesDir - Directory that contains `<name>.md`
 * @param {string} [opts.trailer] - Orchestration mechanics for the session
 *   protocol, the first fragment of the `<session_protocol>` section.
 * @param {string} [opts.amend] - Run-specific amendment, the last fragment of
 *   the `<session_protocol>` section.
 * @param {import("@forwardimpact/libutil/runtime").Runtime} opts.runtime - Ambient collaborators. Uses `fsSync.readFileSync`.
 * @returns {{type: "preset", preset: "claude_code", append: string}}
 */
export function composeProfilePrompt(
  name,
  { profilesDir, trailer, amend, runtime },
) {
  const { persona, protocol } = readProfileSections(name, profilesDir, runtime);
  return {
    type: "preset",
    preset: "claude_code",
    append: assembleSections({
      body: persona,
      protocolParts: [trailer, protocol, amend],
    }),
  };
}

/**
 * Compose a plain-string system prompt for a lead role (no Claude Code
 * preset). This function joins the protocol trailer, an optional profile's
 * hoisted `## Session Protocol` section, and any amendment into
 * `<session_protocol>`. It wraps an optional persona in a sibling
 * `<agent_profile>` before that section.
 *
 * @param {object} opts
 * @param {string} [opts.profile] - Profile basename (no `.md` suffix)
 * @param {string} [opts.profilesDir] - Directory that contains profile files
 * @param {string} opts.trailer - Session protocol (orchestration instructions)
 * @param {string} [opts.amend] - Run-specific amendment, the last fragment of
 *   the `<session_protocol>` section.
 * @param {import("@forwardimpact/libutil/runtime").Runtime} opts.runtime - Ambient collaborators. Uses `fsSync.readFileSync`.
 * @returns {string}
 */
export function composeLeadPrompt({
  profile,
  profilesDir,
  trailer,
  amend,
  runtime,
}) {
  if (!trailer) throw new Error("trailer is required");
  const { persona, protocol } = profile
    ? readProfileSections(profile, profilesDir, runtime)
    : { persona: undefined, protocol: undefined };
  return assembleSections({
    body: persona,
    protocolParts: [trailer, protocol, amend],
  });
}

/**
 * Unified entry point that composes a system prompt. Threads an optional
 * amendment through as the run-specific fragment of `<session_protocol>`
 * (after the trailer and any hoisted profile section). Then delegates by
 * role.
 *
 * @param {object} opts
 * @param {"lead"|"agent"} opts.role - `"lead"` produces a plain string.
 *   `"agent"` produces a `claude_code` preset object.
 * @param {string} [opts.profile] - Profile basename
 * @param {string} [opts.profilesDir]
 * @param {string} opts.trailer - Session protocol (orchestration instructions)
 * @param {string} [opts.amend] - Caller-supplied amendment, the last fragment
 *   inside `<session_protocol>`, joined with a blank-line separator.
 * @param {import("@forwardimpact/libutil/runtime").Runtime} opts.runtime - Ambient collaborators. Uses `fsSync.readFileSync`.
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
  if (role === "lead") {
    return composeLeadPrompt({ profile, profilesDir, trailer, amend, runtime });
  }
  if (profile) {
    return composeProfilePrompt(profile, {
      profilesDir,
      trailer,
      amend,
      runtime,
    });
  }
  return {
    type: "preset",
    preset: "claude_code",
    append: assembleSections({ protocolParts: [trailer, amend] }),
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
