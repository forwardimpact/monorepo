import { runMemoCommand } from "./commands/memo.js";
import { runRefreshCommand } from "./commands/refresh.js";
import { runProductMixCommand } from "./commands/product-mix.js";
import { runInitCommand } from "./commands/init.js";
import { runPushCommand, runPullCommand } from "./commands/sync.js";
import { runBootCommand } from "./commands/boot.js";
import { runLogCommand } from "./commands/log.js";
import { runClaimCommand, runReleaseCommand } from "./commands/claim.js";
import { runInboxCommand } from "./commands/inbox.js";
import { runRotateCommand } from "./commands/rotate.js";
import { runAuditCommand } from "./commands/audit.js";
import { runFixCommand } from "./commands/fix.js";
import { runLedgerCommand } from "./commands/ledger.js";

/**
 * Build the `fit-wiki` libcli definition. Agent identity is never resolved from
 * the environment: agent-scoped subcommands require an explicit `--agent`
 * (`--from` for `memo`) and fail closed without it, so this module carries no
 * ambient agent identity. The version is resolved by libcli's `createCli` from
 * the bin's `packageJsonUrl`. Each subcommand carries a `handler` and (for
 * subcommand-bearing commands) `args`/`argsUsage` so `cli.dispatch` can route to
 * the per-command handler with a frozen `ctx`.
 *
 * @returns {object} The libcli definition.
 */
export function createDefinition() {
  const wikiRootOpt = {
    "wiki-root": {
      type: "string",
      description: "Override wiki root directory (default: wiki)",
    },
  };

  const agentOpt = {
    agent: {
      type: "string",
      description: "Agent name (required; no environment fallback)",
    },
  };

  const todayOpt = {
    today: {
      type: "string",
      description: "Override today's ISO date (testing)",
    },
  };

  return {
    name: "fit-wiki",
    description: "Wiki lifecycle management for the Kata agent system",
    commands: [
      {
        name: "boot",
        description:
          "Print on-boot digest (priorities, claims, storyboard items) as JSON",
        handler: runBootCommand,
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
        args: ["subcommand"],
        argsUsage: "[subcommand]",
        handler: runLogCommand,
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
          alternatives: {
            type: "string",
            description: "Decision: alternatives",
          },
          field: { type: "string", description: "Note: field heading" },
          body: { type: "string", description: "Note: field body" },
        },
      },
      {
        name: "claim",
        description:
          "Claim a target in MEMORY.md ## Active Claims (refuses duplicates)",
        handler: runClaimCommand,
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
            description: "Override expiry ISO date (default claim+1d)",
          },
        },
      },
      {
        name: "release",
        description: "Release a claim (or all expired claims with --expired)",
        handler: runReleaseCommand,
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
        args: ["subcommand"],
        argsUsage: "[subcommand]",
        handler: runInboxCommand,
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
        description: "Rotate the current weekly log to a sealed part",
        handler: runRotateCommand,
        options: {
          ...agentOpt,
          ...wikiRootOpt,
          ...todayOpt,
          force: {
            type: "boolean",
            description:
              "Seal even an under-budget log (the header-only floor still holds)",
          },
        },
      },
      {
        name: "audit",
        description:
          "Audit the wiki against the declarative rule catalogue (line and word budgets, headings, decision blocks, storyboards, claims)",
        handler: runAuditCommand,
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
        name: "fix",
        description:
          "Auto-fix wiki audit findings: rotate weekly logs, fix the rest with an AI agent (technical-writer, Haiku), flag the unresolvable",
        handler: runFixCommand,
        options: {
          ...wikiRootOpt,
          ...todayOpt,
        },
      },
      {
        name: "memo",
        description: "Send a cross-team memo into a teammate's Message Inbox",
        handler: runMemoCommand,
        options: {
          from: {
            type: "string",
            description:
              "Sender agent name (required; no environment fallback)",
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
          "Regenerate storyboard XmR/marker blocks and clear expired MEMORY.md claims",
        args: ["storyboard-path"],
        argsUsage: "[storyboard-path]",
        handler: runRefreshCommand,
        options: {
          format: {
            type: "string",
            description: "Output format: (default off) or json",
          },
        },
      },
      {
        name: "product-mix",
        description:
          "Emit the product-vs-internal mix of merged PRs as a `product_share` metric row",
        handler: runProductMixCommand,
        options: {
          until: {
            type: "string",
            description: "Window end ISO date (default: today)",
          },
          since: {
            type: "string",
            description: "Window start ISO date (default: until − 7 days)",
          },
          run: {
            type: "string",
            description: "Run id recorded on the metric row (default: gh-live)",
          },
          repo: {
            type: "string",
            description: "owner/repo slug (default: origin remote)",
          },
          ...wikiRootOpt,
        },
      },
      {
        name: "init",
        description: "Bootstrap a wiki working tree and scaffold Active Claims",
        handler: runInitCommand,
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
        handler: runPushCommand,
        options: {
          ...wikiRootOpt,
          paths: {
            type: "string",
            multiple: true,
            description:
              "Pathspec(s) limiting the write-set; omit to land the session's dirty set",
          },
        },
      },
      {
        name: "pull",
        description: "Pull remote wiki changes into the local working tree",
        handler: runPullCommand,
        options: { ...agentOpt, ...wikiRootOpt, ...todayOpt },
      },
      {
        name: "ledger",
        description:
          "Allocate collision-ledger ids at anchors and rebuild projections",
        args: ["subcommand"],
        argsUsage: "<allocate|rebuild|verify>",
        handler: runLedgerCommand,
        options: {
          ...wikiRootOpt,
          kind: {
            type: "string",
            description: "Allocation kind: occ | nm | fold | meta",
          },
          count: {
            type: "string",
            description: "How many ids to allocate (default 1)",
          },
          ids: {
            type: "string",
            description:
              "Comma-separated ids to backfill an anchor for (instead of --count)",
          },
          event: {
            type: "string",
            description: "Durable key for the allocation (SHA or anchor id)",
          },
          note: {
            type: "string",
            description: "Free-text note for the anchor",
          },
          gapped: {
            type: "boolean",
            description:
              "Render double-allocation losers as a gap, not a renumber",
          },
          issue: {
            type: "string",
            description: "Anchor issue number (default obstacle issue)",
          },
        },
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
      "fit-wiki claim --agent staff-engineer --target spec-NNNN --branch claude/...",
      "fit-wiki release --agent staff-engineer --target spec-NNNN",
      "fit-wiki inbox list --agent staff-engineer",
      "fit-wiki rotate --agent staff-engineer",
      "fit-wiki audit",
      "fit-wiki fix",
      'fit-wiki memo --from staff-engineer --to security-engineer --message "audit d642ff0c"',
      "fit-wiki refresh",
      "fit-wiki product-mix",
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
          "Send cross-team memos, refresh storyboard charts, sync the wiki, and record the product-mix metric.",
      },
      {
        title: "Audit and Auto-Fix the Wiki",
        url: "https://www.forwardimpact.team/docs/libraries/predictable-team/wiki-integrity/index.md",
        description:
          "Check the wiki against the rule catalogue, auto-fix what is safe, and flag the rest for a human.",
      },
      {
        title: "Allocate Collision-Ledger Entries for Parallel Work",
        url: "https://www.forwardimpact.team/docs/libraries/predictable-team/collision-ledger/index.md",
        description:
          "Assign stable, collision-free ids to parallel work and rebuild the ledger projections.",
      },
    ],
  };
}
