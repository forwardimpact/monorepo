import os from "os";
import readline from "readline";
import { Readable, PassThrough } from "stream";

import { createTerminalFormatter } from "@forwardimpact/libformat";

/**
 * REPL application configuration
 * @typedef {object} ReplApp
 * @property {string} [prompt="> "] - Prompt string the REPL shows to the user
 * @property {(line: string, state: object, output: import("stream").Writable) => Promise<void>} [onLine] - Handler for input lines that writes to the output stream
 * @property {(state: object) => Promise<void>} [beforeLine] - Handler that runs before the REPL processes each line
 * @property {(state: object) => Promise<void>} [afterLine] - Handler that runs after the REPL processes each line
 * @property {(state: object) => Promise<void>} [setup] - Setup function to run before the REPL starts
 * @property {{[key: string]: {usage: string, handler: (args: string[], state: object) => Promise<string|false>, type?: string, cli?: boolean}}} [commands] - Custom command definitions. Each entry has a usage string and a handler. The handler returns false to exit early in CLI mode. An optional type of "boolean" marks a command that takes no args. An optional cli flag of false hides the command from the CLI usage.
 * @property {string} [usage] - Static help text to show before the command list
 * @property {Array<{title: string, url: string, description?: string}>} [documentation] - External documentation links. The REPL renders them after the command list. They mirror the `## Documentation` section of the matching SKILL.md. An agent that reaches the REPL with `--help` then gets the same progressive-disclosure links.
 * @property {{[key: string]: any}} [state] - The state keys and their initial values
 * @property {import("@forwardimpact/libstorage").StorageInterface} [storage] - Storage interface that persists the state
 * @property {string} [indent=""] - String to prefix each line of output (e.g. "  " for two-space indent)
 */

/**
 * Simple REPL with dependency injection
 */
export class Repl {
  #readline;
  #process;
  #formatter;
  #app;
  #rl;
  #uid;

  /**
   * Creates a REPL instance with injected dependencies
   * @param {ReplApp} app - REPL application configuration
   * @param {Function} formatterFn - Factory function that creates a formatter instance
   * @param {object} readlineModule - Readline module that creates interfaces
   * @param {object} processModule - Process object for stdin/stdout and exit
   * @param {object} osModule - OS module for system information
   */
  constructor(
    app = {},
    formatterFn = createTerminalFormatter,
    readlineModule = readline,
    processModule = global.process,
    osModule = os,
  ) {
    if (!formatterFn) throw new Error("formatter dependency is required");
    if (!readlineModule) throw new Error("readline dependency is required");
    if (!processModule) throw new Error("process dependency is required");
    if (!osModule) throw new Error("os dependency is required");

    this.#formatter = formatterFn();
    this.#readline = readlineModule;
    this.#process = processModule;

    // Define default commands
    const defaultCommands = {
      clear: {
        usage: "Clear state to initial values",
        type: "boolean",
        handler: async () => {
          await this.#clearState();
          return false; // Early exit
        },
      },
      help: {
        usage: "Show this help message",
        type: "boolean",
        handler: async () => {
          await this.#showHelp();
          return false; // Early exit
        },
      },
      exit: {
        usage: "Exit the application",
        type: "boolean",
        cli: false,
        handler: async () => {
          this.#process.exit(0);
          return false; // Early exit
        },
      },
    };

    this.#app = {
      prompt: "> ",
      onLine: null,
      beforeLine: null,
      afterLine: null,
      setup: null,
      state: {},
      ...app,
      commands: { ...defaultCommands, ...(app.commands || {}) },
    };
    this.#rl = null;

    // Get the system UID that identifies the stored state
    this.#uid = osModule.userInfo().uid;

    // Initialize the state from the app configuration
    this.state = { ...this.#app.state };

    // Sort the commands alphabetically to keep the help output consistent
    this.#app.commands = Object.fromEntries(
      Object.entries(this.#app.commands).sort(([a], [b]) => a.localeCompare(b)),
    );
  }

  /**
   * Resets the state to the initial values from the app configuration
   * @returns {Promise<void>}
   */
  async #clearState() {
    // Only reset the keys that the app's initial state defines
    for (const key of Object.keys(this.#app.state)) {
      this.state[key] = this.#app.state[key];
    }
    await this.#saveState();
  }

  /**
   * Parses a single --flag argument into its name and inline value.
   * @param {string} arg - The raw argument string (e.g. "--key=value" or "--key")
   * @returns {{ flagName: string, inlineValue: string|null }}
   */
  #parseFlag(arg) {
    const eqIdx = arg.indexOf("=");
    return {
      flagName: eqIdx === -1 ? arg.slice(2) : arg.slice(2, eqIdx),
      inlineValue: eqIdx === -1 ? null : arg.slice(eqIdx + 1),
    };
  }

  /**
   * Resolves the handler arguments for a command flag.
   * Returns the args array and the number of extra argv positions the
   * flag consumes.
   * @param {object} command - Command definition
   * @param {string|null} inlineValue - Inline value from --key=value form
   * @param {string[]} args - Full argv array
   * @param {number} index - Current position in argv
   * @returns {{ handlerArgs: string[], skip: number }|null} null when no value is available (skip the handler call)
   */
  #resolveFlagArgs(command, inlineValue, args, index) {
    if (command.type === "boolean") return { handlerArgs: [], skip: 0 };
    if (inlineValue !== null) return { handlerArgs: [inlineValue], skip: 0 };
    if (index + 1 < args.length)
      return { handlerArgs: [args[index + 1]], skip: 1 };
    return null;
  }

  /**
   * Parses command line arguments. A `--flag` arg runs its command
   * handler. That handler overrides the state value. Every other arg
   * becomes a positional. Positionals are always prompt text. They are
   * never commands.
   * @returns {Promise<{shouldExit: boolean, positionals: string[]}>}
   *   `shouldExit` is true when a flag handler requested an early exit.
   */
  async #parseArgs() {
    const args = this.#process.argv.slice(2);
    const positionals = [];

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (!arg.startsWith("--")) {
        positionals.push(arg);
        continue;
      }

      const { flagName, inlineValue } = this.#parseFlag(arg);
      const commandName = flagName.replace(/-/g, "_");
      const command = this.#app.commands[commandName];
      if (!command?.handler) continue;

      const resolved = this.#resolveFlagArgs(command, inlineValue, args, i);
      if (!resolved) continue;

      i += resolved.skip;

      const result = await command.handler(resolved.handlerArgs, this.state);
      if (result === false) return { shouldExit: true, positionals };
    }
    return { shouldExit: false, positionals };
  }

  /**
   * Loads the state from storage if storage is available
   * @returns {Promise<void>}
   */
  async #loadState() {
    if (!this.#app.storage) return;

    const key = `${this.#uid}.json`;
    const exists = await this.#app.storage.exists(key);

    if (exists) {
      const data = await this.#app.storage.get(key);
      this.state = { ...this.state, ...data };
    }
  }

  /**
   * Saves the current state to storage if storage is available
   * @returns {Promise<void>}
   */
  async #saveState() {
    if (!this.#app.storage) return;

    const key = `${this.#uid}.json`;
    await this.#app.storage.put(key, this.state);
  }

  /**
   * Applies the indent to the first chunk. Skips the very first line.
   * @param {string} formatted - Formatted text
   * @param {string} indent - Indent prefix
   * @returns {{ text: string, pastFirstLine: boolean }}
   */
  #indentFirstChunk(formatted, indent) {
    const nlPos = formatted.indexOf("\n");
    if (nlPos === -1) return { text: formatted, pastFirstLine: false };
    const rest = formatted.slice(nlPos + 1);
    const indented = rest ? rest.replace(/^/gm, indent) : "";
    return {
      text: formatted.slice(0, nlPos + 1) + indented,
      pastFirstLine: true,
    };
  }

  /**
   * Formats and writes output to stdout
   * @param {import("stream").Readable} output - Stream to output
   * @returns {Promise<void>} Promise that resolves when output is complete
   */
  async #output(output) {
    if (!output) return;

    const indent = this.#app.indent || "";
    let firstLine = true;

    for await (const chunk of output) {
      const text = chunk.toString();
      if (!text) continue;

      let formatted = this.#formatter.format(text);
      if (indent) {
        if (firstLine) {
          const result = this.#indentFirstChunk(formatted, indent);
          formatted = result.text;
          firstLine = !result.pastFirstLine;
        } else {
          formatted = formatted.replace(/^/gm, indent);
        }
      }
      this.#process.stdout.write(formatted);
    }
  }

  /**
   * Handles a single line of input
   * @param {string} line - Input line to process
   * @returns {Promise<void>}
   */
  async #handleLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Call the beforeLine handler if the app provides one
    if (this.#app.beforeLine) {
      await this.#app.beforeLine(this.state);
    }

    // Handle commands
    if (trimmed.startsWith("/")) {
      await this.#handleCommand(trimmed);
      if (this.#app.afterLine) {
        await this.#app.afterLine(this.state);
      }
      await this.#saveState();
      return;
    }

    // Handle regular input
    if (this.#app.onLine) {
      const outputStream = new PassThrough();
      const outputPromise = this.#output(outputStream);

      try {
        await this.#app.onLine(trimmed, this.state, outputStream);
      } catch {
        // The libtelemetry logger in the service layer already logs the
        // error
      } finally {
        outputStream.end();
        await outputPromise.catch(() => {});
      }
    }

    // Call the afterLine handler if the app provides one
    if (this.#app.afterLine) {
      await this.#app.afterLine(this.state);
    }

    // Save the state after each line
    await this.#saveState();
  }

  /**
   * Handles command input
   * @param {string} trimmed - Trimmed command line
   * @returns {Promise<void>}
   */
  async #handleCommand(trimmed) {
    const parts = trimmed.slice(1).split(/\s+/);
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1);

    const command = this.#app.commands[commandName];
    if (command && command.handler) {
      try {
        const result = await command.handler(args, this.state);
        // Only output if the result is a stream (ignore boolean/null)
        if (result && typeof result.on === "function") {
          await this.#output(result);
        }
      } catch {
        // The libtelemetry logger already logs the error if the handler
        // uses it
      }
    } else {
      await this.#showHelp();
    }
  }

  /**
   * Shows the usage message with the available commands
   * @returns {Promise<void>}
   */
  async #showHelp() {
    let output = "";

    // Add the custom usage message if the app provides one
    if (this.#app.usage) {
      output += this.#app.usage + "\n\n";
    }

    // Non-interactive usage section
    output += "**Non-interactive usage:**\n\n";

    for (const [name, command] of Object.entries(this.#app.commands)) {
      // Skip commands that have cli: false
      if (command.cli === false) continue;

      const usage = command.usage || "Custom command";
      const cliName = name.replace(/_/g, "-");
      output += `\`--${cliName}\` ${usage}\n`;
    }

    // Interactive usage section
    output += "\n**Interactive usage:**\n\n";

    for (const [name, command] of Object.entries(this.#app.commands)) {
      const usage = command.usage || "Custom command";
      output += `\`/${name}\` ${usage}\n`;
    }

    // The documentation section mirrors the matching SKILL.md
    if (this.#app.documentation && this.#app.documentation.length > 0) {
      output += "\n**Documentation:**\n\n";
      for (const entry of this.#app.documentation) {
        output += `- [${entry.title}](${entry.url})\n`;
        if (entry.description) output += `  — ${entry.description}\n`;
      }
    }

    await this.#output(Readable.from([output]));
  }

  /**
   * Starts the REPL
   * @returns {Promise<void>}
   */
  async start() {
    // Load the state from storage first
    await this.#loadState();

    // Parse command line arguments. The parse exits early if any command
    // returns false. Flags win over positionals. The arguments override
    // the loaded state values.
    const { shouldExit, positionals } = await this.#parseArgs();
    if (shouldExit) return;

    // Run setup if the app provides it
    if (this.#app.setup) {
      await this.#app.setup(this.state);
    }

    // One-shot mode. Positional args are a single prompt line. The same
    // line piped through stdin gives the same result.
    if (positionals.length > 0) {
      const line = positionals.join(" ");
      this.#process.stdout.write(`${this.#app.prompt}${line}\n`);
      await this.#handleLine(line);
      this.#process.exit(0);
      return;
    }

    // Non-interactive mode. Process stdin
    if (!this.#process.stdin.isTTY) {
      let input = "";
      this.#process.stdin.setEncoding("utf8");

      for await (const chunk of this.#process.stdin) {
        input += chunk;
      }

      const lines = input.trim().split("\n");
      for (const line of lines) {
        // Print the prompt and the user input, then process the line
        this.#process.stdout.write(`${this.#app.prompt}${line}\n`);
        await this.#handleLine(line);
      }

      this.#process.exit(0);
      return;
    }

    // Interactive mode. Set up readline
    this.#rl = this.#readline.createInterface({
      input: this.#process.stdin,
      output: this.#process.stdout,
      prompt: this.#app.prompt,
    });

    this.#rl.on("line", async (line) => {
      await this.#handleLine(line);
      this.#rl.prompt();
    });

    this.#rl.on("close", () => this.#process.exit(0));
    this.#rl.on("SIGINT", () => this.#process.exit(0));

    this.#rl.prompt();
  }
}
