#!/usr/bin/env node

import "@forwardimpact/libpreflight/node22";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { GitClient } from "@forwardimpact/libutil/git-client";
import { GhClient } from "@forwardimpact/libutil/gh-client";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { createCli } from "@forwardimpact/libcli";
import { createLogger } from "@forwardimpact/libtelemetry";
import { WikiSync } from "@forwardimpact/libwiki/wiki-sync.js";
import {
  resolveProjectRoot,
  resolveWikiRoot,
  wikiExists,
} from "@forwardimpact/libwiki/util/wiki-dir.js";
import { createDefinition } from "@forwardimpact/libwiki/cli-definition.js";

// Commands that mutate or sync the remote wiki need a constructed WikiSync
// (and its config-backed token resolver); the rest run against the local tree.
const NEEDS_WIKI_SYNC = new Set(["claim", "release", "push", "pull", "init"]);

// The ledger command reads and writes the allocation-anchor surface (the
// obstacle issue's comments) over the GitHub API, so it needs a GhClient.
const NEEDS_GH_CLIENT = new Set(["ledger"]);

async function main() {
  const runtime = createDefaultRuntime();
  const definition = createDefinition();
  const cli = createCli(definition, {
    runtime,
    packageJsonUrl: new URL("../package.json", import.meta.url),
  });

  const parsed = cli.parse(runtime.proc.argv.slice(2));
  if (!parsed) return runtime.proc.exit(0); // --help / --version already printed

  const { positionals } = parsed;
  if (positionals.length === 0) {
    cli.showHelp();
    return runtime.proc.exit(0);
  }

  const command = positionals[0];
  if (!definition.commands.some((c) => c.name === command)) {
    cli.usageError(`unknown command "${command}"`);
    return runtime.proc.exit(2);
  }

  // Every command except `init` operates on an existing wiki tree. When it is
  // absent (e.g. a fresh worktree where bootstrap.sh never ran), degrade
  // gracefully: warn and exit 0 so the session Stop hook and other callers do
  // not fail loudly. `init` is exempt — it creates the tree.
  if (command !== "init") {
    const wikiDir = resolveWikiRoot(runtime, parsed.values);
    if (!wikiExists(runtime, wikiDir)) {
      createLogger("wiki", runtime).warn(
        command,
        `no wiki at ${wikiDir}; skipping (run \`gemba-wiki init\` to create one)`,
      );
      return runtime.proc.exit(0);
    }
  }

  const gitClient = new GitClient({ runtime });
  let wikiSync;
  if (NEEDS_WIKI_SYNC.has(command)) {
    const projectRoot = resolveProjectRoot(runtime);
    const wikiDir = resolveWikiRoot(runtime, parsed.values);
    const config = await createScriptConfig("wiki");
    wikiSync = new WikiSync({
      runtime,
      gitClient,
      wikiDir,
      parentDir: projectRoot,
      resolveToken: () => config.ghToken(),
    });
  }

  let ghClient;
  if (NEEDS_GH_CLIENT.has(command)) {
    ghClient = new GhClient({ runtime });
  }

  const result = await cli.dispatch(parsed, {
    deps: { runtime, wikiSync, gitClient, ghClient },
  });

  const envelope = result ?? { ok: true };
  if (!envelope.ok && envelope.error) cli.usageError(envelope.error);
  runtime.proc.exit(envelope.ok ? 0 : (envelope.code ?? 1));
}

main();
