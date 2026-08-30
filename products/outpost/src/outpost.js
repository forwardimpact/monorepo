// Outpost — CLI and scheduler for autonomous agent teams.
//
// Usage:
//   fit-outpost                     Wake due agents once and exit
//   fit-outpost daemon              Run continuously (poll every 60s)
//   fit-outpost wake <agent>        Wake a specific agent immediately
//   fit-outpost init [name]         Initialize a knowledge base by name (default: Team)
//   fit-outpost update [path]       Update KB with latest CLAUDE.md, agents and skills (defaults to current directory)
//   fit-outpost stop                Gracefully stop daemon and all running agents
//   fit-outpost validate [path]     Validate agent definitions and knowledge bases
//   fit-outpost status              Show agent status
//   fit-outpost --help              Show this help
//
// This module owns the CLI definition and dispatch table. bin/fit-outpost.js
// constructs the runtime collaborator bag once. That file is the sole
// construction site. It threads the bag into `run(runtime, version)`. `run`
// returns the process exit code. The bin translates that code to
// `runtime.proc.exit`.

import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { createCli } from "@forwardimpact/libcli";
import { createLogger } from "@forwardimpact/libtelemetry";
import { isoTimestamp } from "@forwardimpact/libutil";

import { StateManager } from "./state-manager.js";
import { AgentRunner } from "./agent-runner.js";
import { Scheduler, formatLocalTime } from "./scheduler.js";
import { KBManager } from "./kb-manager.js";
import { validateKnowledgeBase } from "./kb-validator.js";
import { SocketServer, requestShutdown, requestWake } from "./socket-server.js";
import {
  readPosture,
  writePosture,
  effectivePosture,
  loadManifest,
  POSTURES,
} from "./posture.js";

const SHARE_DIR = "/usr/local/share/fit-outpost";

/**
 * Build the CLI definition. This object is byte-identical to the libcli
 * definition that the golden capture used, and `test/golden.test.js`
 * enforces that contract. So `--help` and `--version` output stays stable.
 * @param {string} version
 * @returns {object}
 */
export function buildDefinition(version) {
  return {
    name: "fit-outpost",
    version,
    description: "Schedule autonomous agents across knowledge bases",
    commands: [
      { name: "daemon", description: "Run continuously (poll every 60s)" },
      {
        name: "wake",
        args: "<agent>",
        description: "Wake a specific agent immediately",
      },
      {
        name: "init",
        args: "[name]",
        description: "Initialize a new knowledge base",
      },
      {
        name: "update",
        args: "[path]",
        description:
          "Update KB with latest CLAUDE.md, agents and skills (defaults to current directory)",
      },
      {
        name: "stop",
        description: "Gracefully stop daemon and all running agents",
      },
      {
        name: "validate",
        args: "[path]",
        description: "Validate agent definitions and knowledge bases",
      },
      { name: "status", description: "Show agent status" },
      {
        name: "posture",
        args: "[brief|brief+draft]",
        description: "Show or set the adoption posture (brief or brief+draft)",
      },
    ],
    globalOptions: {
      help: { type: "boolean", short: "h", description: "Show this help" },
      version: { type: "boolean", description: "Show version" },
      json: {
        type: "boolean",
        description: "JSON output (with --help and validate)",
      },
    },
    documentation: [
      {
        title: "Outpost Overview",
        url: "https://www.forwardimpact.team/outpost/index.md",
        description: "Product overview, audience model, and key concepts.",
      },
      {
        title: "Getting Started: Outpost for Engineers",
        url: "https://www.forwardimpact.team/docs/getting-started/engineers/outpost/index.md",
        description: "From zero to your first daily briefing.",
      },
      {
        title: "Keep Track of Context Without Effort",
        url: "https://www.forwardimpact.team/docs/products/knowledge-systems/index.md",
        description:
          "Maintain continuous awareness of people, projects, and threads.",
      },
      {
        title: "Walk Into Every Meeting Already Oriented",
        url: "https://www.forwardimpact.team/docs/products/knowledge-systems/meeting-prep/index.md",
        description: "Assemble context so you arrive prepared.",
      },
    ],
  };
}

/**
 * Render an agent's multi-line status block. This is a pure format step.
 * @param {string} name
 * @param {Object} agent
 * @param {Object} s - The agent's persisted state.
 * @param {boolean} kbMissing - Whether the agent's kb path is absent.
 * @returns {string}
 */
function renderAgentStatus(name, agent, s, kbMissing) {
  const enabledMark = agent.enabled !== false ? "+" : "-";
  const kbStatus = kbMissing ? " (not found)" : "";
  const lastWake = s.lastWokeAt ? formatLocalTime(s.lastWokeAt) : "never";
  const lines = [
    `  ${enabledMark} ${name}`,
    `    KB: ${agent.kb || "(none)"}${kbStatus}  Schedule: ${JSON.stringify(agent.schedule)}`,
    `    Status: ${s.status || "never-woken"}  Last wake: ${lastWake}  Wakes: ${s.wakeCount || 0}`,
  ];
  if (s.lastAction) lines.push(`    Last action: ${s.lastAction}`);
  if (s.lastDecision) lines.push(`    Last decision: ${s.lastDecision}`);
  if (s.lastError) lines.push(`    Error: ${s.lastError.slice(0, 80)}`);
  return lines.join("\n");
}

/**
 * Run the Outpost CLI.
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 *   Injected collaborator bag (constructed in the bin).
 * @param {string} version - Resolved CLI version string.
 * @returns {Promise<number>} Process exit code.
 */
export async function run(runtime, version) {
  const { fs, proc, clock } = runtime;
  const logger = createLogger("outpost", runtime);

  /**
   * Test whether a path exists, through the one async fs surface this module
   * uses.
   * @param {string} p
   * @returns {Promise<boolean>}
   */
  const exists = (p) =>
    fs.access(p).then(
      () => true,
      () => false,
    );

  // --- Paths -----------------------------------------------------------------
  const HOME = homedir();
  const OUTPOST_HOME = join(HOME, ".fit", "outpost");
  const CONFIG_PATH = join(OUTPOST_HOME, "scheduler.json");
  const STATE_PATH = join(OUTPOST_HOME, "state.json");
  const POSTURE_PATH = join(OUTPOST_HOME, "posture.json");
  const LOG_DIR = join(OUTPOST_HOME, "logs");
  const CACHE_DIR = join(HOME, ".cache", "fit", "outpost");
  const SOCKET_PATH = join(OUTPOST_HOME, "outpost.sock");
  const PKG_DIR = dirname(import.meta.dirname);
  const MANIFEST_PATH = join(PKG_DIR, "config", "skill-postures.json");

  // --- Logging ---------------------------------------------------------------
  await fs.mkdir(LOG_DIR, { recursive: true });
  function log(msg) {
    const ts = isoTimestamp(clock.now());
    const line = `[${ts}] ${msg}`;
    logger.info(line);
    void fs.appendFile(
      join(LOG_DIR, `scheduler-${ts.slice(0, 10)}.log`),
      line + "\n",
    );
  }

  // --- Config ----------------------------------------------------------------
  async function loadConfig() {
    try {
      return JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
    } catch {
      return { agents: {} };
    }
  }

  function expandPath(p) {
    return p.startsWith("~/") ? join(HOME, p.slice(2)) : resolve(p);
  }

  // --- Wire dependencies -----------------------------------------------------
  // posix-spawn is a Bun-FFI module (`bun:ffi`). An eager import would crash
  // plain `node` (e.g. `--help`/`--version`/golden capture). So load it
  // lazily. Then only an actual agent wake pulls it in. That wake only runs
  // under Bun on macOS.
  const loadSpawn = () => import("@forwardimpact/libmacos/posix-spawn");
  const stateManager = new StateManager(STATE_PATH, runtime);
  const agentRunner = new AgentRunner(
    loadSpawn,
    stateManager,
    log,
    CACHE_DIR,
    runtime,
    { posturePath: POSTURE_PATH, manifestPath: MANIFEST_PATH },
  );
  const scheduler = new Scheduler(
    loadConfig,
    stateManager,
    agentRunner,
    log,
    runtime,
  );
  const kbManager = new KBManager(runtime, log);

  // --- Template dir resolution -----------------------------------------------
  async function getBundlePath() {
    try {
      const exe = process.execPath || "";
      const macosDir = dirname(exe);
      const contentsDir = dirname(macosDir);
      const resourcesDir = join(contentsDir, "Resources");
      if (await exists(join(resourcesDir, "config"))) {
        return { bundle: dirname(contentsDir), resources: resourcesDir };
      }
    } catch {
      /* not in bundle */
    }
    return null;
  }

  async function requireTemplateDir() {
    const bundle = await getBundlePath();
    if (bundle) {
      const tpl = join(bundle.resources, "templates");
      if (await exists(tpl)) return tpl;
    }
    for (const d of [join(SHARE_DIR, "templates"), join(PKG_DIR, "templates")])
      if (await exists(d)) return d;
    proc.stderr.write("Template not found. Reinstall fit-outpost.\n");
    return null;
  }

  // --- Daemon ----------------------------------------------------------------
  async function daemon() {
    const daemonStartedAt = clock.now();
    log("Scheduler daemon started. It polls every 60 seconds.");
    log(`Config: ${CONFIG_PATH}  State: ${STATE_PATH}`);

    // Reset any agents left "active" from a previous daemon session.
    const state = await stateManager.load();
    await stateManager.resetStaleAgents(
      state,
      { reason: "Daemon restarted" },
      log,
    );

    const socketServer = new SocketServer(
      SOCKET_PATH,
      scheduler,
      agentRunner,
      stateManager,
      loadConfig,
      log,
      CACHE_DIR,
      daemonStartedAt,
      runtime,
    );
    socketServer.start();

    let stopped = false;
    let tickHandle;
    void socketServer.whenStopped().then(() => {
      stopped = true;
      // Cancel any pending poll so the armed timer does not keep the event
      // loop alive after shutdown. `run()` returns 0, and the bin exits only
      // on a nonzero code. So a 60s timer that stays armed would delay exit.
      if (tickHandle !== undefined) clock.clearTimeout(tickHandle);
    });

    async function tick() {
      if (stopped) return;
      try {
        await scheduler.wakeDueAgents();
      } catch (err) {
        log(`Error: ${err.message}`);
      }
      if (!stopped) tickHandle = clock.setTimeout(tick, 60_000);
    }
    void tick();

    // Block until a socket or a signal requests a shutdown. The bin then owns
    // the process-exit call.
    await socketServer.whenStopped();
    return 0;
  }

  // --- Update ----------------------------------------------------------------
  async function runUpdate(args) {
    const tpl = await requireTemplateDir();
    if (tpl === null) return 1;

    const target = args[0] ?? proc.cwd();
    const result = await kbManager.update(target, tpl);
    if (!result.ok) {
      proc.stderr.write(result.error + "\n");
      return result.code;
    }
    return 0;
  }

  // --- Status ----------------------------------------------------------------
  async function formatAgentStatus(name, agent, s) {
    const kbMissing = agent.kb ? !(await exists(expandPath(agent.kb))) : false;
    return renderAgentStatus(name, agent, s, kbMissing);
  }

  async function showStatus() {
    const config = await loadConfig();
    const state = await stateManager.load();
    const posture = await readPosture(fs, POSTURE_PATH);
    logger.info("\nOutpost Scheduler\n==================\n");
    // The posture must be observable on a line that matches
    // `^posture: (brief|brief+draft|unset)$`. So write it as plain text to
    // stdout. Do not write it through the RFC5424-prefixed logger.
    proc.stdout.write(`posture: ${posture ?? "unset"}\n`);

    const agents = Object.entries(config.agents || {});
    if (agents.length === 0) {
      logger.info(
        `No agents configured.\n\nEdit ${CONFIG_PATH} to add agents.`,
      );
      return 0;
    }

    logger.info("Agents:");
    for (const [name, agent] of agents) {
      logger.info(
        await formatAgentStatus(name, agent, state.agents[name] || {}),
      );
    }
    return 0;
  }

  // --- Validate --------------------------------------------------------------
  async function findInLocalOrGlobal(kbPath, subPath) {
    const local = join(kbPath, ".claude", subPath);
    const global = join(HOME, ".claude", subPath);
    if (await exists(local)) return local;
    if (await exists(global)) return global;
    return null;
  }

  async function validateAgent(name, agent) {
    if (!agent.kb) {
      logger.info(`  [FAIL] ${name}: no "kb" path specified`);
      return false;
    }
    const kbPath = expandPath(agent.kb);
    if (!(await exists(kbPath))) {
      logger.info(`  [FAIL] ${name}: path not found: ${kbPath}`);
      return false;
    }

    const agentFile = join("agents", name + ".md");
    const found = await findInLocalOrGlobal(kbPath, agentFile);
    logger.info(
      `  [${found ? "OK" : "FAIL"}]  ${name}: agent definition${found ? "" : " not found"}`,
    );
    return !!found;
  }

  /**
   * Render one knowledge finding as a report line. Baselined findings warn.
   * @param {import("./kb-validator.js").Finding} f
   * @returns {string}
   */
  function formatFinding(f) {
    const prefix = f.baselined ? "warn: " : "";
    if (f.path !== undefined) {
      return `${prefix}${f.path} ${f.kind}${f.message ? ` — ${f.message}` : ""}`;
    }
    return `${prefix}${f.file}:${f.line} ${f.kind} ${f.link ?? f.property}`;
  }

  /**
   * Render one KB root's findings as report lines through the logger.
   * @param {string} root - Absolute KB root path.
   * @param {import("./kb-validator.js").Finding[]} findings
   * @returns {void}
   */
  function reportFindings(root, findings) {
    logger.info(`\nKnowledge base: ${root}`);
    for (const f of findings) logger.info(`  ${formatFinding(f)}`);
    if (findings.length === 0) logger.info("  OK");
  }

  /**
   * Run the knowledge checks over each KB root. With `--json` the merged
   * findings array is the only stdout, so tooling can parse it. A root the
   * validator cannot read (a mistyped path, a malformed registry or
   * baseline) fails with one clean error line instead of a stack trace.
   * @param {string[]} roots - Absolute KB root paths.
   * @returns {Promise<number>} 1 when any finding is not baselined, else 0.
   */
  async function runKnowledgeChecks(roots) {
    const all = [];
    for (const root of roots) {
      let result;
      try {
        result = await validateKnowledgeBase(root, runtime);
      } catch (err) {
        cli.error(`validate failed for ${root}: ${err.message}`);
        return 1;
      }
      if (!values.json) reportFindings(root, result.findings);
      all.push(...result.findings);
    }
    if (values.json) proc.stdout.write(`${JSON.stringify(all)}\n`);
    return all.some((f) => !f.baselined) ? 1 : 0;
  }

  async function validate() {
    if (args[0]) return runKnowledgeChecks([expandPath(args[0])]);

    const config = await loadConfig();
    const agents = Object.entries(config.agents || {});
    if (agents.length === 0) {
      logger.info("No agents configured. Nothing to validate.");
      return 0;
    }

    logger.info("\nValidating agents...\n");
    let errors = 0;

    for (const [name, agent] of agents) {
      if (!(await validateAgent(name, agent))) errors++;
    }

    logger.info(errors > 0 ? `\n${errors} error(s).` : "\nAll OK.");
    // The logger writes to stderr, so with --json the findings array stays
    // the only stdout even on the no-path form.
    const kbRoots = [
      ...new Set(agents.map(([, a]) => a.kb).filter(Boolean)),
    ].map(expandPath);
    return Math.max(errors ? 1 : 0, await runKnowledgeChecks(kbRoots));
  }

  // --- CLI entry point -------------------------------------------------------
  const cli = createCli(buildDefinition(version), { runtime });
  const parsed = cli.parse(proc.argv.slice(2));
  if (!parsed) return 0;

  const { positionals, values } = parsed;
  const [command, ...args] = positionals;

  await fs.mkdir(OUTPOST_HOME, { recursive: true });

  const COMMANDS = {
    daemon,
    wake: async () => {
      if (!args[0]) {
        cli.usageError("missing required argument <agent>");
        return 2;
      }
      // Always route the wake through the daemon that already runs. The daemon
      // is the only spawn site that descends from fit-outpost.app. So a
      // `claude` spawned there inherits the app as its TCC responsible
      // process, and a single grant to the app covers it. A spawn from this
      // CLI process would attribute the access to the terminal instead. That
      // breaks the single-grant model. When no daemon runs, there is nowhere
      // to wake with correct attribution. So this command errors. It does not
      // spawn locally.
      const result = await requestWake(SOCKET_PATH, args[0], runtime);
      if (result.ok) {
        log(`Wake dispatched to daemon for "${args[0]}".`);
        return 0;
      }
      if (result.reason === "not-running") {
        cli.error(
          "daemon not running. Start fit-outpost.app (or run `fit-outpost daemon`) before you wake an agent.",
        );
      } else if (result.reason === "timeout") {
        cli.error("daemon did not respond to the wake request.");
      } else {
        cli.error(result.message);
      }
      return 1;
    },
    init: async () => {
      // `init [name]` provisions a KB by name under the data home (default
      // `Team`). It never accepts an arbitrary path. So nobody can steer the
      // substrate back into a TCC-protected folder. This command refuses an
      // unsafe name.
      const name = args[0] ?? "Team";
      let target;
      try {
        target = KBManager.kbPathForName(name);
      } catch {
        cli.usageError(`invalid KB name "${name}"`);
        return 2;
      }
      const tpl = await requireTemplateDir();
      if (tpl === null) return 1;
      const result = await kbManager.init(target, tpl);
      if (!result.ok) {
        proc.stderr.write(result.error + "\n");
        return result.code;
      }
      // A fresh init defaults the posture to `brief`, the opted-into trust
      // contract. Only write when no posture is recorded. A later run then
      // never flips an existing posture.
      if ((await readPosture(fs, POSTURE_PATH)) === null) {
        await writePosture(fs, POSTURE_PATH, "brief");
      }
      return 0;
    },
    update: () => runUpdate(args),
    stop: async () => {
      const stopped = await requestShutdown(SOCKET_PATH, runtime);
      return stopped ? 0 : 1;
    },
    validate,
    status: showStatus,
    posture: async () => {
      if (!args[0]) {
        const current = effectivePosture(await readPosture(fs, POSTURE_PATH));
        proc.stdout.write(`posture: ${current}\n`);
        return 0;
      }
      if (!POSTURES.includes(args[0])) {
        cli.usageError(
          `invalid posture "${args[0]}"; expected one of ${POSTURES.join(", ")}`,
        );
        return 2;
      }
      await writePosture(fs, POSTURE_PATH, args[0]);
      logger.info(`Posture recorded: ${args[0]}`);
      return 0;
    },
  };

  const handler = COMMANDS[command];
  if (command && !handler) {
    cli.usageError(`unknown command "${command}"`);
    return 2;
  }

  return (await (handler || (() => scheduler.wakeDueAgents()))()) ?? 0;
}
