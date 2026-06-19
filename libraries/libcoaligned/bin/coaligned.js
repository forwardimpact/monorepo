#!/usr/bin/env node

import "@forwardimpact/libpreflight/node22";

import { resolve } from "node:path";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createCli } from "@forwardimpact/libcli";
import { emitFindingsJson, emitFindingsText } from "@forwardimpact/libutil";
import {
  checkInstructions,
  checkJtbd,
  createBuildKit,
  findInvariantsRoot,
  INVARIANTS_DIR,
  loadRuleModules,
  runRuleModules,
} from "../src/index.js";

const runtime = createDefaultRuntime();

const definition = {
  name: "coaligned",
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
      name: "invariants",
      args: [],
      description: `Run the repository's invariant rule modules from ${INVARIANTS_DIR}/`,
      options: {
        seed: {
          type: "string",
          description:
            "Print the named module's seed output (e.g. a refreshed deny-list) instead of checking",
        },
      },
      handler: invariantsHandler,
      examples: [
        "coaligned invariants",
        "coaligned invariants --seed ambient-deps",
      ],
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

const cli = createCli(definition, {
  runtime,
  packageJsonUrl: new URL("../package.json", import.meta.url),
});

function writeFindings(findings, passMessage, jsonOutput, cwd, rt) {
  if (jsonOutput) {
    rt.proc.stdout.write(emitFindingsJson(findings));
  } else if (findings.length > 0) {
    rt.proc.stderr.write(emitFindingsText(findings, { cwd, passMessage }));
  } else {
    rt.proc.stdout.write(emitFindingsText(findings, { cwd, passMessage }));
  }
}

async function runInstructions(root, jsonOutput, rt) {
  const findings = await checkInstructions({ root, runtime: rt });
  writeFindings(
    findings,
    "coaligned instructions passed",
    jsonOutput,
    root,
    rt,
  );
  return findings.length > 0 ? 1 : 0;
}

async function runJtbd(root, fix, jsonOutput, rt) {
  const { findings, stale, fixed } = await checkJtbd({
    root,
    fix,
    runtime: rt,
  });
  writeFindings(findings, "coaligned jtbd passed", jsonOutput, root, rt);
  for (const f of fixed) rt.proc.stdout.write(`Regenerated ${f}.\n`);
  if (stale.length > 0 && !jsonOutput) {
    rt.proc.stderr.write(
      `\n${stale.length} file${stale.length === 1 ? "" : "s"} out of date — run \`coaligned jtbd --fix\` to regenerate:\n`,
    );
    for (const s of stale) rt.proc.stderr.write(`  - ${s}\n`);
  }
  return findings.length > 0 || stale.length > 0 ? 1 : 0;
}

async function instructionsHandler(ctx) {
  const rt = ctx.deps.runtime;
  return runInstructions(ctx.data.root, !!ctx.options.json, rt);
}

// Unlike instructions/jtbd, invariants resolves the project root through the
// finder so the rule modules are picked up from `<root>/.coaligned/invariants`
// no matter which subdirectory the command runs from.
async function invariantsHandler(ctx) {
  const rt = ctx.deps.runtime;
  const root = findInvariantsRoot(rt);
  const modules = await loadRuleModules({ root, runtime: rt });

  if (ctx.options.seed) {
    const mod = modules.find((m) => m.name === ctx.options.seed);
    if (!mod) {
      cli.error(`no rule module named "${ctx.options.seed}"`);
      return 1;
    }
    if (typeof mod.seed !== "function") {
      cli.error(`rule module "${mod.name}" has no seed output`);
      return 1;
    }
    const dir = resolve(root, INVARIANTS_DIR);
    rt.proc.stdout.write(
      await mod.seed(createBuildKit({ root, dir, runtime: rt })),
    );
    return 0;
  }

  const findings = await runRuleModules(modules, { root, runtime: rt });
  writeFindings(
    findings,
    "coaligned invariants passed",
    !!ctx.options.json,
    root,
    rt,
  );
  return findings.length > 0 ? 1 : 0;
}

async function jtbdHandler(ctx) {
  const rt = ctx.deps.runtime;
  return runJtbd(ctx.data.root, !!ctx.options.fix, !!ctx.options.json, rt);
}

async function main() {
  const parsed = cli.parse(runtime.proc.argv.slice(2));
  if (!parsed) return runtime.proc.exit(0);

  const root = runtime.proc.cwd();
  const jsonOutput = !!parsed.values.json;

  // No subcommand → run every check; --fix stays jtbd-only and must be opted
  // into explicitly via `coaligned jtbd --fix`.
  if (parsed.positionals.length === 0) {
    const a = await runInstructions(root, jsonOutput, runtime);
    const b = await runJtbd(root, false, jsonOutput, runtime);
    return a || b;
  }

  const known = definition.commands.map((c) => c.name);
  if (!known.includes(parsed.positionals[0])) {
    cli.usageError(`unknown command "${parsed.positionals[0]}"`);
    return 2;
  }

  return await cli.dispatch(parsed, { data: { root }, deps: { runtime } });
}

main()
  .then((code) => runtime.proc.exit(code ?? 0))
  .catch((err) => {
    cli.error(err.message);
    runtime.proc.exit(1);
  });
