/**
 * CLI Command Mapping
 *
 * Maps hash routes to their equivalent `bunx fit-pathway` CLI commands.
 */

/**
 * Route-to-CLI command rules, checked in order.
 * Each rule has a pattern (regex) and a function that produces the CLI string.
 * @type {Array<{ pattern: RegExp, toCommand: (match: RegExpMatchArray) => string }>}
 */
const ROUTE_COMMANDS = [
  // Landing
  { pattern: /^\/$/, toCommand: () => "bunx fit-pathway" },

  // Entity lists
  { pattern: /^\/skill$/, toCommand: () => "bunx fit-pathway skill" },
  { pattern: /^\/behaviour$/, toCommand: () => "bunx fit-pathway behaviour" },
  {
    pattern: /^\/discipline$/,
    toCommand: () => "bunx fit-pathway discipline",
  },
  { pattern: /^\/track$/, toCommand: () => "bunx fit-pathway track" },
  { pattern: /^\/level$/, toCommand: () => "bunx fit-pathway level" },
  { pattern: /^\/driver$/, toCommand: () => "bunx fit-pathway driver" },
  { pattern: /^\/stage$/, toCommand: () => "bunx fit-pathway stage" },
  { pattern: /^\/tool$/, toCommand: () => "bunx fit-pathway tool" },

  // Entity details
  {
    pattern: /^\/skill\/(.+)$/,
    toCommand: (m) => `bunx fit-pathway skill ${m[1]}`,
  },
  {
    pattern: /^\/behaviour\/(.+)$/,
    toCommand: (m) => `bunx fit-pathway behaviour ${m[1]}`,
  },
  {
    pattern: /^\/discipline\/(.+)$/,
    toCommand: (m) => `bunx fit-pathway discipline ${m[1]}`,
  },
  {
    pattern: /^\/track\/(.+)$/,
    toCommand: (m) => `bunx fit-pathway track ${m[1]}`,
  },
  {
    pattern: /^\/level\/(.+)$/,
    toCommand: (m) => `bunx fit-pathway level ${m[1]}`,
  },
  {
    pattern: /^\/driver\/(.+)$/,
    toCommand: (m) => `bunx fit-pathway driver ${m[1]}`,
  },
  {
    pattern: /^\/stage\/(.+)$/,
    toCommand: (m) => `bunx fit-pathway stage ${m[1]}`,
  },

  // Job builder + detail
  {
    pattern: /^\/job-builder$/,
    toCommand: () => "bunx fit-pathway job --list",
  },
  {
    pattern: /^\/job\/([^/]+)\/([^/]+)\/([^/]+)$/,
    toCommand: (m) => `bunx fit-pathway job ${m[1]} ${m[2]} --track=${m[3]}`,
  },
  {
    pattern: /^\/job\/([^/]+)\/([^/]+)$/,
    toCommand: (m) => `bunx fit-pathway job ${m[1]} ${m[2]}`,
  },

  // Interview builder + detail
  {
    pattern: /^\/interview-prep$/,
    toCommand: () => "bunx fit-pathway interview --list",
  },
  {
    pattern: /^\/interview\/([^/]+)\/([^/]+)\/([^/]+)$/,
    toCommand: (m) =>
      `bunx fit-pathway interview ${m[1]} ${m[2]} --track=${m[3]}`,
  },
  {
    pattern: /^\/interview\/([^/]+)\/([^/]+)$/,
    toCommand: (m) => `bunx fit-pathway interview ${m[1]} ${m[2]}`,
  },

  // Career progress builder + detail
  {
    pattern: /^\/career-progress$/,
    toCommand: () => "bunx fit-pathway progress --list",
  },
  {
    pattern: /^\/progress\/([^/]+)\/([^/]+)\/([^/]+)$/,
    toCommand: (m) =>
      `bunx fit-pathway progress ${m[1]} ${m[2]} --track=${m[3]}`,
  },
  {
    pattern: /^\/progress\/([^/]+)\/([^/]+)$/,
    toCommand: (m) => `bunx fit-pathway progress ${m[1]} ${m[2]}`,
  },

  // Self-assessment
  {
    pattern: /^\/self-assessment$/,
    toCommand: () => "bunx fit-pathway self-assessment",
  },
  {
    pattern: /^\/self-assessment\/results$/,
    toCommand: () => "bunx fit-pathway self-assessment",
  },

  // Agent builder + detail
  {
    pattern: /^\/agent-builder$/,
    toCommand: () => "bunx fit-pathway agent --list",
  },
  {
    pattern: /^\/agent\/([^/]+)\/([^/]+)\/([^/]+)$/,
    toCommand: (m) =>
      `bunx fit-pathway agent ${m[1]} --track=${m[2]} --stage=${m[3]}`,
  },
  {
    pattern: /^\/agent\/([^/]+)\/([^/]+)$/,
    toCommand: (m) => `bunx fit-pathway agent ${m[1]} --track=${m[2]}`,
  },
  {
    pattern: /^\/agent\/([^/]+)$/,
    toCommand: (m) => `bunx fit-pathway agent ${m[1]}`,
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
  return "bunx fit-pathway";
}
