import { parseArgs } from "node:util";
import { HelpRenderer } from "./help.js";
import { freezeInvocationContext } from "./invocation-context.js";

/** Command-line interface that parses argv against a definition of commands, options, and help. */
export class Cli {
  #definition;
  #proc;
  #helpRenderer;

  /** Build a CLI from a definition, wiring in the process handle and help renderer; throws if the deprecated top-level `options` key is present or if any command option name collides with a global option. */
  constructor(definition, { process, helpRenderer }) {
    if (definition.options) {
      throw new Error(
        `${definition.name}: "options" is no longer supported. ` +
          `Use "globalOptions" for shared options and per-command "options" ` +
          `for command-specific options.`,
      );
    }
    Cli.#validateNoCollisions(definition);
    this.#definition = definition;
    this.#proc = process;
    this.#helpRenderer = helpRenderer;
  }

  static #validateNoCollisions(definition) {
    if (!definition.commands || !definition.globalOptions) return;
    const globalNames = new Set(Object.keys(definition.globalOptions));
    for (const cmd of definition.commands) {
      if (!cmd.options) continue;
      for (const name of Object.keys(cmd.options)) {
        if (globalNames.has(name)) {
          throw new Error(
            `${definition.name}: option "${name}" in command ` +
              `"${cmd.name}" collides with a global option`,
          );
        }
      }
    }
  }

  /** Return the CLI program name from the definition. */
  get name() {
    return this.#definition.name;
  }

  /** Parse argv into values and positionals, handling --help and --version; returns null when help or version is printed. */
  parse(argv) {
    const command = this.#findCommand(argv);
    const options = this.#buildOptions(command);
    const { values, positionals } = this.#parseArgs(argv, options);

    if (values.help) {
      this.#renderHelp(command, values.json);
      return null;
    }

    if (values.version && this.#definition.version) {
      this.#proc.stdout.write(this.#definition.version + "\n");
      return null;
    }

    return { values, positionals };
  }

  #buildOptions(command) {
    const globalOpts = this.#definition.globalOptions || {};
    const commandOpts = command?.options || {};
    const merged = { ...globalOpts, ...commandOpts };

    const options = {};
    for (const [name, opt] of Object.entries(merged)) {
      options[name] = { type: opt.type };
      if (opt.short) options[name].short = opt.short;
      if (opt.default !== undefined) options[name].default = opt.default;
      if (opt.multiple) options[name].multiple = opt.multiple;
    }
    return options;
  }

  #parseArgs(argv, options) {
    try {
      return parseArgs({ options, allowPositionals: true, args: argv });
    } catch (err) {
      if (err.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
        const commandError = this.#commandAsOptionError(err);
        if (commandError) throw commandError;
      }
      throw err;
    }
  }

  #commandAsOptionError(err) {
    const match = err.message.match(/'(--?)([^']+)'/);
    if (!match) return null;
    const bare = match[2];
    const asCommand = this.#definition.commands?.find((c) => c.name === bare);
    if (!asCommand) return null;
    const argsStr = Array.isArray(asCommand.args)
      ? asCommand.argsUsage
      : asCommand.args;
    const usage = argsStr
      ? `${this.#definition.name} ${bare} ${argsStr}`
      : `${this.#definition.name} ${bare}`;
    return new Error(
      `Unknown option "${match[1]}${bare}". "${bare}" is a command, not an option. Usage: ${usage}`,
      { cause: err },
    );
  }

  #renderHelp(command, asJson) {
    if (asJson) {
      this.#helpRenderer.renderJson(
        this.#definition,
        this.#proc.stdout,
        command,
      );
    } else {
      this.#helpRenderer.render(this.#definition, this.#proc.stdout, command);
    }
  }

  #findCommand(argv) {
    const commands = this.#definition.commands;
    if (!commands || commands.length === 0) return null;

    const positionals = argv.filter((a) => !a.startsWith("-"));

    for (let len = Math.min(positionals.length, 3); len > 0; len--) {
      const candidate = positionals.slice(0, len).join(" ");
      const found = commands.find((c) => c.name === candidate);
      if (found) return found;
    }
    return null;
  }

  /** Match parsed positionals to a subcommand and invoke its handler with a frozen invocation context. `deps` carries host-injected collaborators (the runtime bag); `data` carries host-loaded domain values. */
  dispatch(parsed, { data, deps } = {}) {
    const command = this.#findCommand(parsed.positionals);
    if (!command) {
      throw new Error(`${this.#definition.name}: no matching subcommand`);
    }
    if (typeof command.handler !== "function") {
      throw new Error(
        `${this.#definition.name}: subcommand "${command.name}" lacks a handler — ` +
          `dispatch() requires { args: string[], handler: (ctx) => any }`,
      );
    }
    const consumed = command.name.split(" ").length;
    const argv = parsed.positionals.slice(consumed);
    const argNames = Array.isArray(command.args) ? command.args : [];
    const args = Object.fromEntries(
      argNames.map((n, i) => [n, argv[i]]).filter(([, v]) => v !== undefined),
    );
    const ctx = freezeInvocationContext({
      data,
      args,
      options: parsed.values,
      deps,
    });
    return command.handler(ctx);
  }

  /** Print the top-level help text to stdout. */
  showHelp() {
    this.#helpRenderer.render(this.#definition, this.#proc.stdout);
  }

  /** Write an error message to stderr and set exit code 1. */
  error(message) {
    this.#proc.stderr.write(`${this.#definition.name}: error: ${message}\n`);
    this.#proc.exitCode = 1;
  }

  /** Write a usage error message to stderr and set exit code 2. */
  usageError(message) {
    this.#proc.stderr.write(`${this.#definition.name}: error: ${message}\n`);
    this.#proc.exitCode = 2;
  }
}

/**
 * Create a Cli instance. Error, usage-error, and help output route through the
 * injected `runtime.proc`.
 * @param {object} definition - The CLI definition.
 * @param {object} options
 * @param {import('@forwardimpact/libutil/runtime').Runtime} options.runtime
 * @returns {Cli}
 */
export function createCli(definition, { runtime } = {}) {
  if (!runtime) throw new Error("runtime is required");
  const proc = runtime.proc;
  const helpRenderer = new HelpRenderer({ process: proc });
  return new Cli(definition, { process: proc, helpRenderer });
}
