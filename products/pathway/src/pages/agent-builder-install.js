/**
 * Agent builder install section
 *
 * Surfaces the ecosystem-tool install commands (direct download, Microsoft APM,
 * and `npx skills`) for the currently selected discipline/track
 * pack. The packs themselves are emitted by `fit-pathway build` when
 * `standard.distribution.siteUrl` is configured — see specs 0520 and 0700, and
 * `products/pathway/src/commands/build-packs.js`. The pack name derivation
 * here must stay in sync with that generator so the command points at an
 * artifact that actually exists on the deployed site.
 */

import { code, div, h2, p, section } from "../lib/render.js";
import { getDisciplineAbbreviation } from "@forwardimpact/libskill/agent";
import { createCommandPrompt } from "../components/command-prompt.js";

/** Stable id for the install section heading (for aria-labelledby). */
const INSTALL_HEADING_ID = "agent-builder-install-heading";

/**
 * Derive the pack archive name for a discipline/track combination.
 * Must match `build-packs.js` → `${abbrev}-${track.id}`.
 * @param {{id: string}} discipline
 * @param {{id: string}} track
 * @returns {string}
 */
export function getPackName(discipline, track) {
  return `${getDisciplineAbbreviation(discipline.id)}-${track.id}`;
}

/**
 * Normalize a site URL by stripping a trailing slash. Matches the
 * normalization applied by `generatePacks` so the displayed URL lines up
 * with the manifest entries.
 * @param {string} siteUrl
 * @returns {string}
 */
function normalizeSiteUrl(siteUrl) {
  return siteUrl.replace(/\/$/, "");
}

/**
 * Build the `curl | tar` command for direct raw pack extraction.
 * @param {string} siteUrl
 * @param {string} packName
 * @returns {string}
 */
export function getRawCommand(siteUrl, packName) {
  const url = `${normalizeSiteUrl(siteUrl)}/packs/raw/${packName}.tar.gz`;
  return `curl -sL ${url} | tar xz`;
}

/**
 * Build the `apm install` command for native git-based APM install.
 * @param {string} siteUrl
 * @param {string} packName
 * @returns {string}
 */
export function getApmInstallCommand(siteUrl, packName) {
  return `apm install ${normalizeSiteUrl(siteUrl)}/packs/apm/${packName}`;
}

/**
 * Build the `apm unpack` command for a specific APM pack bundle.
 * @param {string} siteUrl
 * @param {string} packName
 * @returns {string}
 */
export function getApmCommand(siteUrl, packName) {
  const url = `${normalizeSiteUrl(siteUrl)}/packs/apm/${packName}.tar.gz`;
  return `curl -sLO ${url} && apm unpack ${packName}.tar.gz`;
}

/**
 * Build the `npx skills add` command that discovers the per-pack skill
 * repository at `<siteUrl>/packs/skills/<packName>/.well-known/skills/index.json`.
 * @param {string} siteUrl
 * @param {string} packName
 * @returns {string}
 */
export function getSkillsCommand(siteUrl, packName) {
  return `npx skills add ${normalizeSiteUrl(siteUrl)}/packs/skills/${packName}`;
}

/**
 * Render the install section for the selected agent combination. Returns
 * `null` when no site URL is configured (no packs have been published, so
 * there is nothing meaningful to install) so the caller can skip rendering.
 * @param {Object} params
 * @param {{id: string}} params.discipline - Selected human discipline
 * @param {{id: string}} params.track - Selected human track
 * @param {string|undefined} params.siteUrl - Standard distribution site URL
 * @returns {HTMLElement|null}
 */
export function createInstallSection({ discipline, track, siteUrl }) {
  if (!siteUrl) return null;

  const packName = getPackName(discipline, track);

  return section(
    {
      className: "agent-install-section",
      "aria-labelledby": INSTALL_HEADING_ID,
    },
    div(
      { className: "agent-install-header" },
      h2({ id: INSTALL_HEADING_ID }, "📦 Install This Agent Team"),
      p(
        { className: "text-muted agent-install-description" },
        "Install the pre-built pack for this discipline × track combination " +
          "directly through an ecosystem package manager. The pack contains " +
          "the same agent profile, skills, team instructions, and Claude Code " +
          "settings shown below — installed into your project's ",
        code({}, ".claude/"),
        " directory.",
      ),
    ),
    div(
      { className: "agent-install-commands" },
      div(
        { className: "agent-install-command" },
        p({ className: "agent-install-command-label" }, "Direct download"),
        createCommandPrompt(getRawCommand(siteUrl, packName)),
        p(
          { className: "text-muted agent-install-note" },
          "Recommended. Installs everything: skills, agents, CLAUDE.md, and settings (Claude Code + VS Code).",
        ),
      ),
      div(
        { className: "agent-install-command" },
        p({ className: "agent-install-command-label" }, "apm install"),
        createCommandPrompt(getApmInstallCommand(siteUrl, packName)),
        p(
          { className: "text-muted agent-install-note" },
          "Recommended for APM users. Installs skills, agents, and team instructions via native git resolution.",
        ),
      ),
      div(
        { className: "agent-install-command" },
        p({ className: "agent-install-command-label" }, "apm unpack"),
        createCommandPrompt(getApmCommand(siteUrl, packName)),
        p(
          { className: "text-muted agent-install-note" },
          "Offline alternative. Downloads the tarball, then unpacks. Does not include settings.",
        ),
      ),
      div(
        { className: "agent-install-command" },
        p({ className: "agent-install-command-label" }, "npx skills"),
        createCommandPrompt(getSkillsCommand(siteUrl, packName)),
        p(
          { className: "text-muted agent-install-note" },
          "Installs skills only. Does not include agents or CLAUDE.md.",
        ),
      ),
    ),
  );
}
