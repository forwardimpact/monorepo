#!/usr/bin/env node

import "@forwardimpact/libpreflight/node22";

import { readFileSync } from "node:fs";
import { createCli } from "@forwardimpact/libcli";
import { emitFindingsJson, emitFindingsText } from "@forwardimpact/libutil";
import { checkInstructions, checkJtbd } from "../src/index.js";

const { version: VERSION } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

const definition = {
  name: "coaligned",
  version: VERSION,
  description:
    "Enforce the layered instruction architecture defined in COALIGNED.md (no subcommand: run every check)",
  commands: [
    {
      name: "instructions",
      args: [],
      description: "Check L1–L6 length and checklist caps across the repo",
      handler: instructionsHandler,
      examples: ["coaligned instructions"],
    },
    {
      name: "jtbd",
      args: [],
      description: "Validate package.json .jobs entries and generated blocks",
      options: {
        fix: {
          type: "boolean",
          description: "Regenerate stale catalog and jobs blocks in place",
        },
      },
      handler: jtbdHandler,
      examples: ["coaligned jtbd", "coaligned jtbd --fix"],
    },
  ],
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output findings as JSON" },
  },
  examples: ["coaligned", "coaligned instructions", "coaligned jtbd --fix"],
};

const cli = createCli(definition);

function writeFindings(findings, passMessage, jsonOutput, cwd) {
  if (jsonOutput) {
    process.stdout.write(emitFindingsJson(findings));
  } else if (findings.length > 0) {
    process.stderr.write(emitFindingsText(findings, { cwd, passMessage }));
  } else {
    process.stdout.write(emitFindingsText(findings, { cwd, passMessage }));
  }
}

async function runInstructions(root, jsonOutput) {
  const findings = await checkInstructions({ root });
  writeFindings(findings, "coaligned instructions passed", jsonOutput, root);
  return findings.length > 0 ? 1 : 0;
}

async function runJtbd(root, fix, jsonOutput) {
  const { findings, stale, fixed } = await checkJtbd({ root, fix });
  writeFindings(findings, "coaligned jtbd passed", jsonOutput, root);
  for (const f of fixed) process.stdout.write(`Regenerated ${f}.\n`);
  if (stale.length > 0 && !jsonOutput) {
    process.stderr.write(
      `\n${stale.length} file${stale.length === 1 ? "" : "s"} out of date — run \`coaligned jtbd --fix\` to regenerate:\n`,
    );
    for (const s of stale) process.stderr.write(`  - ${s}\n`);
  }
  return findings.length > 0 || stale.length > 0 ? 1 : 0;
}

async function instructionsHandler(ctx) {
  return runInstructions(ctx.data.root, !!ctx.options.json);
}

async function jtbdHandler(ctx) {
  return runJtbd(ctx.data.root, !!ctx.options.fix, !!ctx.options.json);
}

async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) return 0;

  const root = process.cwd();
  const jsonOutput = !!parsed.values.json;

  // No subcommand → run every check; --fix stays jtbd-only and must be opted
  // into explicitly via `coaligned jtbd --fix`.
  if (parsed.positionals.length === 0) {
    const a = await runInstructions(root, jsonOutput);
    const b = await runJtbd(root, false, jsonOutput);
    return a || b;
  }

  const known = definition.commands.map((c) => c.name);
  if (!known.includes(parsed.positionals[0])) {
    cli.usageError(`unknown command "${parsed.positionals[0]}"`);
    return 2;
  }

  return await cli.dispatch(parsed, { data: { root } });
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    cli.error(err.message);
    process.exit(1);
  });
