import os from "os";
import readline from "readline";
import { Readable, PassThrough } from "stream";

import { createTerminalFormatter } from "@forwardimpact/libformat";

/**
 * REPL application configuration
 * @typedef {object} ReplApp
 * @property {string} [prompt="> "] - Prompt string displayed to the user
 * @property {(line: string, state: object, output: import("stream").Writable) => Promise<void>} [onLine] - Handler for input lines that writes to output stream
 * @property {(state: object) => Promise<void>} [beforeLine] - Handler called before each line is processed
 * @property {(state: object) => Promise<void>} [afterLine] - Handler called after each line is processed
 * @property {(state: object) => Promise<void>} [setup] - Setup function to run before starting the REPL
 * @property {{[key: string]: {usage: string, handler: (args: string[], state: object) => Promise<string|false>, type?: string, cli?: boolean}}} [commands] - Custom command definitions with usage, handler (returns false to exit early in CLI mode), optional type ("boolean" for no args), and optional cli flag (false to hide from CLI usage)
 * @property {string} [usage] - Static help text to show before the command list
 * @property {{[key: string]: any}} [state] - Definition of state and its initial values
 * @property {import("@forwardimpact/libstorage").StorageInterface} [storage] - Storage interface for state persistence
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
   * @param {object} readlineModule - Readline module for creating interfaces
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

    // Get system UID for state persistence
    this.#uid = osModule.userInfo().uid;

    // Initialize state from app configuration
    this.state = { ...this.#app.state };

    // Sort commands alphabetically for consistent help display
    this.#app.commands = Object.fromEntries(
      Object.entries(this.#app.commands).sort(([a], [b]) => a.localeCompare(b)),
    );
  }

  /**
   * Resets state to initial values from app configuration
   * @returns {Promise<void>}
   */
  async #clearState() {
    // Only reset keys that are defined in the app's initial state
    for (const key of Object.keys(this.#app.state)) {
      this.state[key] = this.#app.state[key];
    }
    await this.#saveState();
  }

  /**
   * Parses command line arguments to override state values and returns whether to exit early
   * @returns {Promise<boolean>} True if the process should exit after parsing
   */
  async #parseArgs() {
    const args = this.#process.argv.slice(2);

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith("--")) {
        const commandName = arg.slice(2).replace(/-/g, "_");
        const command = this.#app.commands[commandName];

        if (command && command.handler) {
          let result;
          // Boolean type commands don't consume an argument
          if (command.type === "boolean") {
            result = await command.handler([], this.state);
          } else if (i + 1 < args.length) {
            // Non-boolean commands consume the next argument
            const value = args[i + 1];
            result = await command.handler([value], this.state);
            i++; // Skip the value argument
          }
          // If handler returns explicit false, exit early
          if (result === false) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Loads state from storage if available
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
   * Saves current state to storage if available
   * @returns {Promise<void>}
   */
  async #saveState() {
    if (!this.#app.storage) return;

    const key = `${this.#uid}.json`;
    await this.#app.storage.put(key, this.state);
  }

  /**
   * Formats and writes output to stdout
   * @param {import("stream").Readable} output - Stream to output
   * @returns {Promise<void>} Promise that resolves when output is complete
   */
  async #output(output) {
    if (!output) return;

    let firstChunk = true;

    for await (const chunk of output) {
      if (firstChunk) {
        this.#process.stdout.write("\n");
        firstChunk = false;
      }
      const text = chunk.toString();
      if (text) {
        this.#process.stdout.write(this.#formatter.format(text));
      }
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

    // Call beforeLine handler if provided
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
        // Error is already logged by libtelemetry logger in the service layer
      } finally {
        outputStream.end();
        await outputPromise.catch(() => {});
      }
    }

    // Call afterLine handler if provided
    if (this.#app.afterLine) {
      await this.#app.afterLine(this.state);
    }

    // Save state after processing the line
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
        // Only output if result is a stream (ignore boolean/null)
        if (result && typeof result.on === "function") {
          await this.#output(result);
        }
      } catch {
        // Error is already logged by libtelemetry logger if handler uses it
      }
    } else {
      await this.#showHelp();
    }
  }

  /**
   * Shows usage message with available commands
   * @returns {Promise<void>}
   */
  async #showHelp() {
    let output = "";

    // Add custom usage message if provided
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

    await this.#output(Readable.from([output]));
  }

  /**
   * Starts the REPL
   * @returns {Promise<void>}
   */
  async start() {
    // Load state from storage first
    await this.#loadState();

    // Parse command line arguments (exits early if any command returns false)
    // These override loaded state values
    const shouldExit = await this.#parseArgs();
    if (shouldExit) return;

    // Run setup if provided
    if (this.#app.setup) {
      await this.#app.setup(this.state);
    }

    // Non-interactive mode - process stdin
    if (!this.#process.stdin.isTTY) {
      let input = "";
      this.#process.stdin.setEncoding("utf8");

      for await (const chunk of this.#process.stdin) {
        input += chunk;
      }

      const lines = input.trim().split("\n");
      for (const line of lines) {
        // Print the prompt and user input before processing
        this.#process.stdout.write(`${this.#app.prompt}${line}\n`);
        await this.#handleLine(line);
      }

      this.#process.exit(0);
      return;
    }

    // Interactive mode - setup readline
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
