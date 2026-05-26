# Part 1 — Core library changes

Modifies `libraries/libcli/src/` and `libraries/libcli/test/`.

## 1. Schema change in `cli.js`

### 1a. Add legacy rejection to constructor

**File:** `libraries/libcli/src/cli.js` — `Cli` constructor (line 9)

Add a guard at the top of the constructor:

```javascript
constructor(definition, { process, helpRenderer }) {
  if (definition.options) {
    throw new Error(
      `${definition.name}: "options" is no longer supported. ` +
      `Use "globalOptions" for shared options and per-command "options" ` +
      `for command-specific options.`
    );
  }
  this.#definition = definition;
  // ...
}
```

This satisfies success criterion 5 (legacy schema rejected with a clear
migration message).

### 1b. Rewrite `parse()` for per-command option scoping

**File:** `libraries/libcli/src/cli.js` — `parse()` method (lines 19–48)

Replace the current implementation:

```javascript
parse(argv) {
  // 1. Identify command by scanning non-flag tokens
  const command = this.#findCommand(argv);

  // 2. Build merged options for parseArgs
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

  const { values, positionals } = parseArgs({
    options,
    allowPositionals: true,
    args: argv,
  });

  // 3. Help dispatch
  if (values.help) {
    if (values.json) {
      this.#helpRenderer.renderJson(
        this.#definition, this.#proc.stdout, command
      );
    } else {
      this.#helpRenderer.render(
        this.#definition, this.#proc.stdout, command
      );
    }
    return null;
  }

  if (values.version && this.#definition.version) {
    this.#proc.stdout.write(this.#definition.version + "\n");
    return null;
  }

  return { values, positionals };
}
```

### 1c. Add `#findCommand()` private method

**File:** `libraries/libcli/src/cli.js` — new private method on `Cli`

```javascript
#findCommand(argv) {
  const commands = this.#definition.commands;
  if (!commands || commands.length === 0) return null;

  // Collect non-flag tokens in order
  const positionals = argv.filter(a => !a.startsWith("-"));

  // Try longest match first (handles multi-word commands like "org show")
  for (let len = Math.min(positionals.length, 3); len > 0; len--) {
    const candidate = positionals.slice(0, len).join(" ");
    const found = commands.find(c => c.name === candidate);
    if (found) return found;
  }
  return null;
}
```

Cap at 3 tokens — no current CLI has a command longer than 2 words, and this
prevents pathological scans.

### 1d. Add collision detection to constructor

After the legacy guard in the constructor, validate that no command option name
collides with a global option name:

```javascript
if (definition.commands && definition.globalOptions) {
  const globalNames = new Set(Object.keys(definition.globalOptions));
  for (const cmd of definition.commands) {
    if (!cmd.options) continue;
    for (const name of Object.keys(cmd.options)) {
      if (globalNames.has(name)) {
        throw new Error(
          `${definition.name}: option "${name}" in command ` +
          `"${cmd.name}" collides with a global option`
        );
      }
    }
  }
}
```

### 1e. Update `showHelp()`

Currently calls
`this.#helpRenderer.render(this.#definition, this.#proc.stdout)`. No change
needed — `showHelp()` always renders global help (called when no command is
given).

### 1f. `createCli()` factory — no change needed

The `createCli()` factory (line 66–69) passes `definition` through to the `Cli`
constructor unchanged. The constructor guard (step 1a) and collision detection
(step 1d) activate automatically. No change to the factory function itself.

## 2. Help rendering in `help.js`

### 2a. Rename `#renderOptions` to `#renderOptionSection`

**File:** `libraries/libcli/src/help.js` — `#renderOptions` (lines 51–69)

Generalize the method to accept an options object and a section title instead of
reading from `definition.options`:

```javascript
#renderOptionSection(options, title) {
  if (!options) return [];
  const entries = Object.entries(options);
  if (entries.length === 0) return [];
  const lines = [this.#sectionHeader(title)];
  const optStrings = entries.map(([name, opt]) => {
    let s = `--${name}`;
    if (opt.type === "string") s += `=<${opt.type}>`;
    if (opt.short) s += `, -${opt.short}`;
    return s;
  });
  const maxOptWidth = Math.max(...optStrings.map((s) => s.length));
  for (let i = 0; i < entries.length; i++) {
    lines.push(
      `  ${optStrings[i].padEnd(maxOptWidth)}  ${entries[i][1].description}`,
    );
  }
  lines.push("");
  return lines;
}
```

### 2b. Update `render()` — global help path

**File:** `libraries/libcli/src/help.js` — `render()` (lines 82–92)

Change signature to `render(definition, stream, command)`. When `command` is
falsy, render global help:

```javascript
render(definition, stream, command) {
  const out = stream || this.#proc.stdout;
  if (command) {
    this.#renderCommand(definition, out, command);
    return;
  }
  const lines = [
    ...this.#renderHeader(definition),
    ...this.#renderUsage(definition),
    ...this.#renderCommands(definition),
    ...this.#renderOptionSection(definition.globalOptions, "Options:"),
    ...this.#renderExamples(definition),
    ...this.#renderHintLine(definition),
  ];
  out.write(lines.join("\n"));
}
```

### 2c. Add `#renderHintLine()`

**File:** `libraries/libcli/src/help.js` — new private method

```javascript
#renderHintLine(definition) {
  if (!definition.commands || definition.commands.length === 0) return [];
  return [
    `Use ${definition.name} <command> --help for command-specific options.`,
    "",
  ];
}
```

### 2d. Add `#renderCommand()` — per-command help

**File:** `libraries/libcli/src/help.js` — new private method

```javascript
#renderCommand(definition, stream, command) {
  // Header: "{parent} {command} {args} — {description}"
  let header = `${definition.name} ${command.name}`;
  if (command.args) header += ` ${command.args}`;
  if (command.description) header += ` \u2014 ${command.description}`;
  const formatted = supportsColor(this.#proc)
    ? formatHeader(header, this.#proc)
    : header;

  // Usage line
  let usage = `Usage: ${definition.name} ${command.name}`;
  if (command.args) usage += ` ${command.args}`;
  usage += " [options]";

  // Global options without --version
  const globalWithoutVersion = definition.globalOptions
    ? Object.fromEntries(
        Object.entries(definition.globalOptions).filter(
          ([name]) => name !== "version"
        )
      )
    : null;

  const lines = [
    formatted,
    "",
    usage,
    "",
    ...this.#renderOptionSection(command.options, "Options:"),
    ...this.#renderOptionSection(globalWithoutVersion, "Global options:"),
    ...this.#renderExamplesArray(command.examples),
  ];
  stream.write(lines.join("\n"));
}
```

### 2e. Add `#renderExamplesArray()`

Currently `#renderExamples` reads from `definition.examples`. Add a variant that
takes an explicit array, then have `#renderExamples` call it:

```javascript
#renderExamplesArray(examples) {
  if (!examples || examples.length === 0) return [];
  const lines = [this.#sectionHeader("Examples:")];
  for (const ex of examples) {
    lines.push(`  ${ex}`);
  }
  lines.push("");
  return lines;
}

#renderExamples(definition) {
  return this.#renderExamplesArray(definition.examples);
}
```

### 2f. Update `renderJson()` — per-command JSON help

**File:** `libraries/libcli/src/help.js` — `renderJson()` (lines 94–97)

Change signature to `renderJson(definition, stream, command)`:

```javascript
renderJson(definition, stream, command) {
  const out = stream || this.#proc.stdout;
  if (command) {
    const globalWithoutVersion = definition.globalOptions
      ? Object.fromEntries(
          Object.entries(definition.globalOptions).filter(
            ([name]) => name !== "version"
          )
        )
      : undefined;
    const obj = {
      name: command.name,
      args: command.args,
      description: command.description,
      parent: definition.name,
      options: command.options,
      globalOptions: globalWithoutVersion,
      examples: command.examples,
    };
    out.write(JSON.stringify(obj, null, 2) + "\n");
  } else {
    out.write(JSON.stringify(definition, null, 2) + "\n");
  }
}
```

## 3. Tests

### 3a. Update `test/cli.test.js`

All existing tests use the old `options` schema and must migrate to
`globalOptions`. The shared `definition` (line 27) becomes:

```javascript
const definition = {
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
```

The `multiDef` (line 102) similarly changes `options` → `globalOptions`.

Add new tests:

1. **Legacy rejection:**

   ```javascript
   test("throws on definition with legacy options field", () => {
     const proc = createProc();
     assert.throws(
       () => new Cli(
         { name: "old", options: { help: { type: "boolean" } } },
         { process: proc, helpRenderer: new HelpRenderer({ process: proc }) }
       ),
       /globalOptions/
     );
   });
   ```

2. **Per-command help dispatch:**

   ```javascript
   test("renders per-command help when command --help is passed", () => {
     const proc = createProc();
     const def = {
       name: "fit-test",
       commands: [
         {
           name: "run",
           args: "<file>",
           description: "Run a file",
           options: {
             watch: { type: "boolean", description: "Watch mode" },
           },
           examples: ["fit-test run main.js --watch"],
         },
       ],
       globalOptions: {
         help: { type: "boolean", short: "h", description: "Show help" },
       },
     };
     const helpRenderer = new HelpRenderer({ process: proc });
     const cli = new Cli(def, { process: proc, helpRenderer });
     const result = cli.parse(["run", "--help"]);
     assert.strictEqual(result, null);
     assert.ok(proc.stdout.output.includes("fit-test run <file>"));
     assert.ok(proc.stdout.output.includes("--watch"));
     assert.ok(proc.stdout.output.includes("Global options:"));
   });
   ```

3. **Per-command JSON help:**

   ```javascript
   test("renders per-command JSON when command --help --json is passed", () => {
     // Similar setup, verify JSON contains command-scoped fields
   });
   ```

4. **Command-specific option rejected on wrong command:**

   ```javascript
   test("throws on command-specific option used with wrong command", () => {
     const proc = createProc();
     const def = {
       name: "fit-test",
       commands: [
         { name: "run", options: { watch: { type: "boolean", description: "W" } } },
         { name: "check" },
       ],
       globalOptions: {
         help: { type: "boolean", short: "h", description: "Show help" },
       },
     };
     const helpRenderer = new HelpRenderer({ process: proc });
     const cli = new Cli(def, { process: proc, helpRenderer });
     assert.throws(
       () => cli.parse(["check", "--watch"]),
       { code: "ERR_PARSE_ARGS_UNKNOWN_OPTION" }
     );
   });
   ```

5. **Multi-word command matching:**

   ```javascript
   test("matches multi-word commands for per-command help", () => {
     const proc = createProc();
     const def = {
       name: "fit-test",
       commands: [
         { name: "org show", description: "Show org" },
       ],
       globalOptions: {
         help: { type: "boolean", short: "h", description: "Show help" },
       },
     };
     const helpRenderer = new HelpRenderer({ process: proc });
     const cli = new Cli(def, { process: proc, helpRenderer });
     const result = cli.parse(["org", "show", "--help"]);
     assert.strictEqual(result, null);
     assert.ok(proc.stdout.output.includes("fit-test org show"));
   });
   ```

6. **Option name collision:**
   ```javascript
   test("throws on command option colliding with global option", () => {
     const proc = createProc();
     assert.throws(
       () => new Cli(
         {
           name: "t",
           commands: [{ name: "a", options: { data: { type: "string", description: "X" } } }],
           globalOptions: { data: { type: "string", description: "Y" } },
         },
         { process: proc, helpRenderer: new HelpRenderer({ process: proc }) }
       ),
       /collides/
     );
   });
   ```

### 3b. Update `test/help.test.js`

Migrate `fullDefinition` from `options` → `globalOptions`. Add tests:

1. **Global help includes hint line:**

   ```javascript
   test("includes hint line when commands exist", () => {
     const stream = createStream();
     createRenderer().render(fullDefinition, stream);
     assert.ok(stream.output.includes("--help for command-specific options"));
   });
   ```

2. **Per-command help rendering:**

   ```javascript
   test("renders per-command help with command and global options", () => {
     const stream = createStream();
     const def = {
       name: "fit-test",
       commands: [{
         name: "run",
         args: "<file>",
         description: "Run a file",
         options: { watch: { type: "boolean", description: "Watch mode" } },
         examples: ["fit-test run main.js"],
       }],
       globalOptions: {
         data: { type: "string", description: "Data path" },
         help: { type: "boolean", short: "h", description: "Show help" },
         version: { type: "boolean", short: "v", description: "Show version" },
       },
     };
     createRenderer().render(def, stream, def.commands[0]);
     // Header
     assert.ok(stream.output.includes("fit-test run <file>"));
     // Command options section
     assert.ok(stream.output.includes("Options:"));
     assert.ok(stream.output.includes("--watch"));
     // Global options section (without --version)
     assert.ok(stream.output.includes("Global options:"));
     assert.ok(stream.output.includes("--data"));
     assert.ok(!stream.output.includes("--version"));
     // Examples
     assert.ok(stream.output.includes("fit-test run main.js"));
   });
   ```

3. **Per-command help omits Options section when command has no options:**

   ```javascript
   test("omits Options section when command has no options", () => {
     // Command with no options → only "Global options:" appears
   });
   ```

4. **Per-command JSON:**

   ```javascript
   test("per-command JSON includes command metadata and scoped options", () => {
     // Verify JSON has parent, name, options, globalOptions fields
   });
   ```

5. **Global help does NOT show per-command options:**
   ```javascript
   test("global help shows only globalOptions, not per-command options", () => {
     // Definition with both globalOptions and command.options
     // Verify per-command option does not appear in global help
   });
   ```

## File change summary

| File                                 | Action                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `libraries/libcli/src/cli.js`        | Modified — constructor guard, `parse()` rewrite, `#findCommand()`                                                                           |
| `libraries/libcli/src/help.js`       | Modified — `render()`/`renderJson()` signature, `#renderCommand()`, `#renderOptionSection()`, `#renderHintLine()`, `#renderExamplesArray()` |
| `libraries/libcli/src/index.js`      | No change                                                                                                                                   |
| `libraries/libcli/test/cli.test.js`  | Modified — migrate definitions, add 6 new tests                                                                                             |
| `libraries/libcli/test/help.test.js` | Modified — migrate definitions, add 5 new tests                                                                                             |

## Verification

```sh
cd libraries/libcli && bun test
```

All existing tests (updated for new schema) plus new tests must pass before
proceeding to Part 2.
