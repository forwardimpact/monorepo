import { Cli } from "../src/cli.js";
import { HelpRenderer } from "../src/help.js";

/** Build a fake process object that buffers stdout/stderr writes. */
export function createProc() {
  return {
    env: {},
    stdout: {
      isTTY: false,
      output: "",
      write(data) {
        this.output += data;
      },
    },
    stderr: {
      output: "",
      write(data) {
        this.output += data;
      },
    },
    exitCode: 0,
  };
}

/** The baseline CLI definition shared across the sibling suites. */
export const definition = {
  name: "fit-test",
  version: "1.0.0",
  description: "Test CLI",
  globalOptions: {
    output: { type: "string", description: "Output path" },
    json: { type: "boolean", description: "JSON output" },
    help: { type: "boolean", short: "h", description: "Show help" },
    version: { type: "boolean", description: "Show version" },
  },
};

/** Construct a Cli wired to the given fake process using `definition`. */
export function createCli(proc) {
  const helpRenderer = new HelpRenderer({ process: proc });
  return new Cli(definition, { process: proc, helpRenderer });
}
