#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createCli } from "@forwardimpact/libcli";

import { runMemoCommand } from "../src/commands/memo.js";
import { runRefreshCommand } from "../src/commands/refresh.js";
import { runInitCommand } from "../src/commands/init.js";
import { runPushCommand, runPullCommand } from "../src/commands/sync.js";
import { runBootCommand } from "../src/commands/boot.js";
import { runLogCommand } from "../src/commands/log.js";
import { runClaimCommand, runReleaseCommand } from "../src/commands/claim.js";
import { runInboxCommand } from "../src/commands/inbox.js";
import { runRotateCommand } from "../src/commands/rotate.js";
import { runAuditCommand } from "../src/commands/audit.js";

const { version: VERSION } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

const wikiRootOpt = {
  "wiki-root": {
    type: "string",
    description: "Override wiki root directory (default: wiki)",
  },
};

const agentOpt = {
  agent: {
    type: "string",
    description: "Agent name (falls back to LIBEVAL_AGENT_PROFILE env var)",
    default: process.env.LIBEVAL_AGENT_PROFILE,
  },
};

const todayOpt = {
  today: {
    type: "string",
    description: "Override today's ISO date (testing)",
  },
};

const definition = {
  name: "fit-wiki",
  version: VERSION,
  description: "Wiki lifecycle management for the Kata agent system",
  commands: [
    {
      name: "boot",
      description:
        "Print on-boot digest (priorities, claims, storyboard items) as JSON",
      options: {
        ...agentOpt,
        ...wikiRootOpt,
        ...todayOpt,
        format: {
          type: "string",
          description: "Output format: json (default) or markdown",
        },
      },
    },
    {
      name: "log",
      description:
        "Append a decision/note/done entry to the current weekly log",
      args: "[subcommand]",
      options: {
        ...agentOpt,
        ...wikiRootOpt,
        ...todayOpt,
        surveyed: {
          type: "string",
          description: "Decision: routing levels surveyed",
        },
        chosen: { type: "string", description: "Decision: chosen action" },
        rationale: { type: "string", description: "Decision: rationale" },
        alternatives: { type: "string", description: "Decision: alternatives" },
        field: { type: "string", description: "Note: field heading" },
        body: { type: "string", description: "Note: field body" },
      },
    },
    {
      name: "claim",
      description:
        "Claim a target in MEMORY.md ## Active Claims (refuses duplicates)",
      options: {
        ...agentOpt,
        ...wikiRootOpt,
        ...todayOpt,
        target: {
          type: "string",
          description: "What is being claimed (spec id, PR id, etc.)",
        },
        branch: { type: "string", description: "Branch carrying the work" },
        pr: { type: "string", description: "Optional PR id" },
        "expires-at": {
          type: "string",
          description: "Override expiry ISO date (default claim+7d)",
        },
      },
    },
    {
      name: "release",
      description: "Release a claim (or all expired claims with --expired)",
      options: {
        ...agentOpt,
        ...wikiRootOpt,
        ...todayOpt,
        target: { type: "string", description: "Target to release" },
        expired: {
          type: "boolean",
          description: "Release every row past expires_at",
        },
      },
    },
    {
      name: "inbox",
      description: "Triage the agent's Message Inbox (list/ack/promote/drop)",
      args: "[subcommand]",
      options: {
        ...agentOpt,
        ...wikiRootOpt,
        ...todayOpt,
        index: {
          type: "string",
          description: "Bullet index (0-based) for ack/promote/drop",
        },
        owner: {
          type: "string",
          description: "Owner field when promoting (default: --agent)",
        },
      },
    },
    {
      name: "rotate",
      description: "Force-rotate the current weekly log to a sealed part",
      options: {
        ...agentOpt,
        ...wikiRootOpt,
        ...todayOpt,
      },
    },
    {
      name: "audit",
      description:
        "Audit the wiki against the declarative rule catalogue (line and word budgets, headings, decision blocks, storyboards, claims)",
      options: {
        ...wikiRootOpt,
        ...todayOpt,
        format: {
          type: "string",
          description: "Output format: text (default) or json",
        },
      },
    },
    {
      name: "memo",
      description: "Send a cross-team memo into a teammate's Message Inbox",
      options: {
        from: {
          type: "string",
          description:
            "Sender agent name (falls back to LIBEVAL_AGENT_PROFILE env var)",
          default: process.env.LIBEVAL_AGENT_PROFILE,
        },
        to: {
          type: "string",
          description:
            'Target agent name, or "all" to broadcast (sender is skipped)',
        },
        message: {
          type: "string",
          description: "Memo text",
        },
        ...wikiRootOpt,
      },
    },
    {
      name: "refresh",
      description:
        "Regenerate XmR and obstacle/experiment marker blocks in a storyboard",
      args: "[storyboard-path]",
      options: {
        format: {
          type: "string",
          description: "Output format: (default off) or json",
        },
      },
    },
    {
      name: "init",
      description: "Bootstrap a wiki working tree and scaffold Active Claims",
      options: {
        ...wikiRootOpt,
        "skills-dir": {
          type: "string",
          description: "Override skills directory (default: .claude/skills)",
        },
      },
    },
    {
      name: "push",
      description: "Commit and push local wiki changes to the remote",
      options: { ...wikiRootOpt },
    },
    {
      name: "pull",
      description: "Pull remote wiki changes into the local working tree",
      options: { ...wikiRootOpt },
    },
  ],
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: {
      type: "boolean",
      description: "Render --help output as JSON",
    },
  },
  examples: [
    "fit-wiki boot --agent staff-engineer",
    'fit-wiki log decision --agent staff-engineer --surveyed "..." --chosen "..." --rationale "..."',
    "fit-wiki claim --agent staff-engineer --target spec-1060 --branch claude/...",
    "fit-wiki release --agent staff-engineer --target spec-1060",
    "fit-wiki inbox list --agent staff-engineer",
    "fit-wiki rotate --agent staff-engineer",
    "fit-wiki audit",
    'fit-wiki memo --from staff-engineer --to security-engineer --message "audit d642ff0c"',
    "fit-wiki refresh",
    "fit-wiki init",
    "fit-wiki push",
    "fit-wiki pull",
  ],
  documentation: [
    {
      title: "Operate a Predictable Agent Team",
      url: "https://www.forwardimpact.team/docs/libraries/predictable-team/index.md",
      description:
        "End-to-end guide to wiki memory, XmR charts, and team coordination.",
    },
    {
      title: "Send a Memo or Update a Storyboard",
      url: "https://www.forwardimpact.team/docs/libraries/predictable-team/wiki-operations/index.md",
      description:
        "Send cross-team memos, refresh storyboard charts, and sync the wiki.",
    },
  ],
};

const cli = createCli(definition);

const COMMANDS = {
  boot: runBootCommand,
  log: runLogCommand,
  claim: runClaimCommand,
  release: runReleaseCommand,
  inbox: runInboxCommand,
  rotate: runRotateCommand,
  audit: runAuditCommand,
  memo: runMemoCommand,
  refresh: runRefreshCommand,
  init: runInitCommand,
  push: runPushCommand,
  pull: runPullCommand,
};

async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const { values, positionals } = parsed;

  if (positionals.length === 0) {
    cli.showHelp();
    process.exit(0);
  }

  const [command, ...args] = positionals;
  const handler = COMMANDS[command];

  if (!handler) {
    cli.usageError(`unknown command "${command}"`);
    process.exit(2);
  }

  await handler(values, args, cli);
}

main();
