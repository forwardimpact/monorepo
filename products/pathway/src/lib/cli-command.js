/**
 * CLI Command Mapping
 *
 * Maps hash routes to their equivalent `npx fit-pathway` CLI commands.
 */

/**
 * Route-to-CLI command rules, checked in order.
 * Each rule has a pattern (regex) and a function that produces the CLI string.
 * @type {Array<{ pattern: RegExp, toCommand: (match: RegExpMatchArray) => string }>}
 */
const ROUTE_COMMANDS = [
  // Landing
  { pattern: /^\/$/, toCommand: () => "npx fit-pathway" },

  // Entity lists
  { pattern: /^\/skill$/, toCommand: () => "npx fit-pathway skill" },
  { pattern: /^\/behaviour$/, toCommand: () => "npx fit-pathway behaviour" },
  {
    pattern: /^\/discipline$/,
    toCommand: () => "npx fit-pathway discipline",
  },
  { pattern: /^\/track$/, toCommand: () => "npx fit-pathway track" },
  { pattern: /^\/level$/, toCommand: () => "npx fit-pathway level" },
  { pattern: /^\/driver$/, toCommand: () => "npx fit-pathway driver" },
  { pattern: /^\/stage$/, toCommand: () => "npx fit-pathway stage" },
  { pattern: /^\/tool$/, toCommand: () => "npx fit-pathway tool" },

  // Entity details
  {
    pattern: /^\/skill\/(.+)$/,
    toCommand: (m) => `npx fit-pathway skill ${m[1]}`,
  },
  {
    pattern: /^\/behaviour\/(.+)$/,
    toCommand: (m) => `npx fit-pathway behaviour ${m[1]}`,
  },
  {
    pattern: /^\/discipline\/(.+)$/,
    toCommand: (m) => `npx fit-pathway discipline ${m[1]}`,
  },
  {
    pattern: /^\/track\/(.+)$/,
    toCommand: (m) => `npx fit-pathway track ${m[1]}`,
  },
  {
    pattern: /^\/level\/(.+)$/,
    toCommand: (m) => `npx fit-pathway level ${m[1]}`,
  },
  {
    pattern: /^\/driver\/(.+)$/,
    toCommand: (m) => `npx fit-pathway driver ${m[1]}`,
  },
  {
    pattern: /^\/stage\/(.+)$/,
    toCommand: (m) => `npx fit-pathway stage ${m[1]}`,
  },

  // Job builder + detail
  {
    pattern: /^\/job-builder$/,
    toCommand: () => "npx fit-pathway job --list",
  },
  {
    pattern: /^\/job\/([^/]+)\/([^/]+)\/([^/]+)$/,
    toCommand: (m) => `npx fit-pathway job ${m[1]} ${m[2]} --track=${m[3]}`,
  },
  {
    pattern: /^\/job\/([^/]+)\/([^/]+)$/,
    toCommand: (m) => `npx fit-pathway job ${m[1]} ${m[2]}`,
  },

  // Interview builder + detail
  {
    pattern: /^\/interview-prep$/,
    toCommand: () => "npx fit-pathway interview --list",
  },
  {
    pattern: /^\/interview\/([^/]+)\/([^/]+)\/([^/]+)$/,
    toCommand: (m) =>
      `npx fit-pathway interview ${m[1]} ${m[2]} --track=${m[3]}`,
  },
  {
    pattern: /^\/interview\/([^/]+)\/([^/]+)$/,
    toCommand: (m) => `npx fit-pathway interview ${m[1]} ${m[2]}`,
  },

  // Career progress builder + detail
  {
    pattern: /^\/career-progress$/,
    toCommand: () => "npx fit-pathway progress --list",
  },
  {
    pattern: /^\/progress\/([^/]+)\/([^/]+)\/([^/]+)$/,
    toCommand: (m) =>
      `npx fit-pathway progress ${m[1]} ${m[2]} --track=${m[3]}`,
  },
  {
    pattern: /^\/progress\/([^/]+)\/([^/]+)$/,
    toCommand: (m) => `npx fit-pathway progress ${m[1]} ${m[2]}`,
  },

  // Self-assessment
  {
    pattern: /^\/self-assessment$/,
    toCommand: () => "npx fit-pathway self-assessment",
  },
  {
    pattern: /^\/self-assessment\/results$/,
    toCommand: () => "npx fit-pathway self-assessment",
  },

  // Agent builder + detail
  {
    pattern: /^\/agent-builder$/,
    toCommand: () => "npx fit-pathway agent --list",
  },
  {
    pattern: /^\/agent\/([^/]+)\/([^/]+)\/([^/]+)$/,
    toCommand: (m) =>
      `npx fit-pathway agent ${m[1]} --track=${m[2]} --stage=${m[3]}`,
  },
  {
    pattern: /^\/agent\/([^/]+)\/([^/]+)$/,
    toCommand: (m) => `npx fit-pathway agent ${m[1]} --track=${m[2]}`,
  },
  {
    pattern: /^\/agent\/([^/]+)$/,
    toCommand: (m) => `npx fit-pathway agent ${m[1]}`,
  },
];

/**
 * Get the CLI command equivalent for a given hash path
 * @param {string} hashPath - The hash path (without #), e.g. "/skill/testing"
 * @returns {string} The CLI command string
 */
export function getCliCommand(hashPath) {
  const path = hashPath.split("?")[0] || "/";
  for (const { pattern, toCommand } of ROUTE_COMMANDS) {
    const match = path.match(pattern);
    if (match) return toCommand(match);
  }
  return "npx fit-pathway";
}
