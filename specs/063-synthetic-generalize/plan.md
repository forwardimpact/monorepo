# Plan — Generalize Synthetic Data

Implementation plan for adding dataset tools and generic renderers to the
synthetic data system.

## Overview

Five phases, each independently shippable:

1. DSL extension (dataset + output blocks)
2. Generic renderers (JSON, YAML, CSV, Markdown, Parquet, SQL INSERT)
3. Faker tool (in-process, no external deps)
4. Synthea tool (Java subprocess)
5. SDV tool (Python subprocess)

Phase 1 is the foundation. Phases 2–5 are independent of each other and can
ship in any order. Phase 3 (Faker) is the simplest tool and validates the
full pipeline end-to-end, so it ships first.

## The dataset abstraction

All phases share one data structure:

```javascript
/**
 * @typedef {object} Dataset
 * @property {string} name - Identifier from DSL (e.g. "patients")
 * @property {object} schema - JSON Schema for one record (may be null for Faker)
 * @property {object[]} records - Generated data rows
 * @property {object} metadata - Tool-specific context
 */
```

This is a plain object, not a class. Tools return datasets. Renderers consume
them. No base class, no interface — just a shape.

## Phase 1 — DSL Extension

**Files:** `libraries/libsyntheticgen/dsl/tokenizer.js`,
`libraries/libsyntheticgen/dsl/parser.js`

### New keywords

Add to the KEYWORDS list: `dataset`, `tool`, `population`, `modules`,
`metadata`, `rows`, `fields`, `output`, `table`, `path`, `json`, `yaml`,
`csv`, `markdown`, `parquet`, `sql`.

### New parser functions

**`parseDataset()`** — called when the parser encounters `dataset <id> {`:

```javascript
function parseDataset(id) {
  expect('LBRACE')
  const ds = { id, tool: null, config: {} }
  while (peek().type !== 'RBRACE') {
    const kw = advance()
    if (kw.value === 'tool') ds.tool = advance().value
    else if (kw.value === 'population') ds.config.population = expectNumber()
    else if (kw.value === 'modules') ds.config.modules = parseArray()
    else if (kw.value === 'metadata') ds.config.metadata = expectString()
    else if (kw.value === 'rows') ds.config.rows = expectNumber()
    else if (kw.value === 'fields') ds.config.fields = parseFields()
    else throw new Error(`Unexpected '${kw.value}' in dataset`)
  }
  expect('RBRACE')
  return ds
}
```

**`parseFields()`** — parses the `fields { name "provider" ... }` block:

```javascript
function parseFields() {
  expect('LBRACE')
  const fields = {}
  while (peek().type !== 'RBRACE') {
    const name = advance().value    // field name (IDENT or KEYWORD)
    const provider = expectString() // Faker provider path
    fields[name] = provider
  }
  expect('RBRACE')
  return fields
}
```

**`parseOutput()`** — called when the parser encounters `output <dataset> <format> {`:

```javascript
function parseOutput(datasetId) {
  const format = advance().value  // json, yaml, csv, markdown, parquet, sql
  expect('LBRACE')
  const out = { dataset: datasetId, format, config: {} }
  while (peek().type !== 'RBRACE') {
    const kw = advance()
    if (kw.value === 'path') out.config.path = expectString()
    else if (kw.value === 'table') out.config.table = expectString()
    else throw new Error(`Unexpected '${kw.value}' in output`)
  }
  expect('RBRACE')
  return out
}
```

### AST extension

The UniverseAST gains two new arrays:

```javascript
{
  // ... existing fields (name, domain, industry, seed, orgs, etc.) ...
  datasets: [],   // { id, tool, config }
  outputs: [],    // { dataset, format, config }
}
```

These are independent of existing fields. A universe with no `dataset` blocks
produces `datasets: []` and `outputs: []`, changing nothing for existing DSL
files.

### Integration into `parseUniverse()`

In the main parse loop, add two cases:

```javascript
else if (kw.value === 'dataset') {
  const id = advance().value
  ast.datasets.push(parseDataset(id))
}
else if (kw.value === 'output') {
  const datasetId = advance().value
  ast.outputs.push(parseOutput(datasetId))
}
```

### Tests

- Parse a DSL with `dataset` + `output` blocks, verify AST shape.
- Parse a DSL with only existing blocks, verify `datasets` and `outputs` are
  empty arrays.
- Parse mixed DSL (org blocks + dataset blocks), verify both are present.
- Parse error on unknown keyword inside `dataset` block.
- Parse error on unknown format in `output` block.

## Phase 2 — Generic Renderers

**New file:** `libraries/libsyntheticrender/render/dataset-renderers.js`

All six renderers are standalone functions in a single file. Each takes a
dataset and returns `Map<string, string|Buffer>`.

### JSON renderer

```javascript
/**
 * @param {Dataset} dataset
 * @param {object} config - { path }
 * @returns {Map<string, string>}
 */
function renderJson(dataset, config) {
  const files = new Map()
  files.set(config.path, JSON.stringify(dataset.records, null, 2))
  return files
}
```

### YAML renderer

```javascript
function renderYaml(dataset, config) {
  const files = new Map()
  files.set(config.path, YAML.stringify(dataset.records, { lineWidth: 120 }))
  return files
}
```

Uses the `yaml` package (already a dependency).

### CSV renderer

```javascript
function renderCsv(dataset, config) {
  if (dataset.records.length === 0) {
    return new Map([[config.path, '']])
  }
  const headers = Object.keys(dataset.records[0])
  const rows = dataset.records.map(r =>
    headers.map(h => csvEscape(r[h])).join(',')
  )
  const content = [headers.join(','), ...rows].join('\n') + '\n'
  return new Map([[config.path, content]])
}
```

`csvEscape()` handles quoting: wrap in double quotes if the value contains
commas, quotes, or newlines. Nested objects/arrays are serialized as JSON
strings before escaping.

### Markdown renderer

```javascript
function renderMarkdown(dataset, config) {
  if (dataset.records.length === 0) {
    return new Map([[config.path, `# ${dataset.name}\n\nNo records.\n`]])
  }
  const headers = Object.keys(dataset.records[0])
  const headerRow = '| ' + headers.join(' | ') + ' |'
  const separator = '| ' + headers.map(() => '---').join(' | ') + ' |'
  const dataRows = dataset.records.map(r =>
    '| ' + headers.map(h => mdEscape(r[h])).join(' | ') + ' |'
  )
  const content = `# ${dataset.name}\n\n${headerRow}\n${separator}\n${dataRows.join('\n')}\n`
  return new Map([[config.path, content]])
}
```

### Parquet renderer

Use `parquet-wasm` (WebAssembly-based, no native deps, runs in Node.js).
Convert the dataset records to Arrow-compatible column arrays, then write a
Parquet file.

```javascript
import { writeParquet, Table } from 'parquet-wasm/node'

function renderParquet(dataset, config) {
  const table = Table.fromJSON(dataset.records)
  const buffer = writeParquet(table)
  return new Map([[config.path, Buffer.from(buffer)]])
}
```

If `parquet-wasm` proves problematic, fall back to `@duckdb/node` which can
write Parquet from JSON. Either way, this is a single dependency addition.

### SQL INSERT renderer

```javascript
function renderSql(dataset, config) {
  const table = config.table || dataset.name
  if (dataset.records.length === 0) {
    return new Map([[config.path, `-- No records for ${table}\n`]])
  }
  const columns = Object.keys(dataset.records[0])
  const header = `INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES\n`
  const rows = dataset.records.map(r =>
    '(' + columns.map(c => sqlLiteral(r[c])).join(', ') + ')'
  )
  const content = header + rows.join(',\n') + ';\n'
  return new Map([[config.path, content]])
}
```

`sqlLiteral()` handles type coercion: strings → `'escaped'`, numbers →
literal, booleans → `TRUE`/`FALSE`, null → `NULL`, dates → `'ISO string'`,
objects/arrays → `'JSON string'`. Uses PostgreSQL syntax.

### Renderer dispatch

A single function maps format names to renderers:

```javascript
const RENDERERS = {
  json: renderJson,
  yaml: renderYaml,
  csv: renderCsv,
  markdown: renderMarkdown,
  parquet: renderParquet,
  sql: renderSql,
}

/**
 * @param {Dataset} dataset
 * @param {string} format
 * @param {object} config
 * @returns {Map<string, string|Buffer>}
 */
function renderDataset(dataset, format, config) {
  const renderer = RENDERERS[format]
  if (!renderer) throw new Error(`Unknown format: ${format}`)
  return renderer(dataset, config)
}
```

### Exports

Add `renderDataset` to `libsyntheticrender/index.js`.

### Tests

- Each renderer: verify output for a 3-record dataset with strings, numbers,
  booleans, nulls, nested objects.
- CSV: verify quoting for values with commas and newlines.
- SQL: verify escaping for strings with single quotes.
- Parquet: verify file is readable by importing it back.
- JSON: verify round-trip (`JSON.parse(output)` equals input records).
- Empty dataset: verify each renderer handles zero records gracefully.

### Dependencies

| Package       | Add to            | Reason          |
| ------------- | ----------------- | --------------- |
| `parquet-wasm` | libsyntheticrender | Parquet output |

## Phase 3 — Faker Tool

**New file:** `libraries/libsyntheticgen/tools/faker.js`

The simplest tool. Runs in-process, no external dependencies, validates the
full tool → dataset → renderer pipeline end-to-end.

### Class

```javascript
import { faker } from '@faker-js/faker'

class FakerTool {
  /**
   * @param {object} deps
   * @param {object} deps.logger
   */
  constructor({ logger }) {
    if (!logger) throw new Error('FakerTool requires logger')
    this.logger = logger
  }

  /**
   * @returns {Promise<boolean>}
   */
  async checkAvailability() {
    return true  // always available — JS dependency
  }

  /**
   * @param {object} config - { rows, fields, seed }
   * @returns {Promise<Dataset>}
   */
  async generate(config) {
    faker.seed(config.seed)
    const records = []
    for (let i = 0; i < config.rows; i++) {
      const record = {}
      for (const [field, provider] of Object.entries(config.fields)) {
        record[field] = this.callProvider(provider)
      }
      records.push(record)
    }
    return {
      name: config.name,
      schema: null,
      records,
      metadata: { tool: 'faker', fields: config.fields },
    }
  }

  /**
   * Resolve a dotted provider path like "person.fullName" to a Faker call.
   * @param {string} provider
   * @returns {*}
   */
  callProvider(provider) {
    const parts = provider.split('.')
    let fn = faker
    for (const part of parts) {
      fn = fn[part]
      if (!fn) throw new Error(`Unknown Faker provider: ${provider}`)
    }
    if (typeof fn !== 'function') {
      throw new Error(`Faker provider "${provider}" is not a function`)
    }
    return fn()
  }
}
```

### Factory

```javascript
function createFakerTool(logger) {
  return new FakerTool({ logger })
}
```

### Dependencies

| Package         | Add to          | Reason                |
| --------------- | --------------- | --------------------- |
| `@faker-js/faker` | libsyntheticgen | In-process generation |

### Pipeline wiring

In `libuniverse/pipeline.js`, after DSL parsing:

```javascript
// Generate datasets from tool blocks
const datasets = new Map()
for (const ds of ast.datasets) {
  const tool = getTool(ds.tool, { logger })
  await tool.checkAvailability()
  const dataset = await tool.generate({
    ...ds.config,
    seed: ast.seed,
    name: ds.id,
  })
  datasets.set(ds.id, dataset)
}

// Render dataset outputs
for (const out of ast.outputs) {
  const dataset = datasets.get(out.dataset)
  if (!dataset) throw new Error(`Unknown dataset: ${out.dataset}`)
  const rendered = renderDataset(dataset, out.format, out.config)
  for (const [path, content] of rendered) {
    files.set(path, content)
  }
}
```

`getTool()` is a simple switch, not a registry:

```javascript
function getTool(name, deps) {
  switch (name) {
    case 'faker': return createFakerTool(deps.logger)
    case 'synthea': return createSyntheaTool(deps.logger)
    case 'sdv': return createSdvTool(deps.logger)
    default: throw new Error(`Unknown tool: ${name}`)
  }
}
```

### Example DSL

Create `examples/faker-demo.dsl`:

```
universe FakerDemo {
  seed 42

  dataset customers {
    tool faker
    rows 100
    fields {
      id "string.uuid"
      name "person.fullName"
      email "internet.email"
      phone "phone.number"
      company "company.name"
      joined "date.past"
      active "datatype.boolean"
    }
  }

  dataset products {
    tool faker
    rows 50
    fields {
      id "string.uuid"
      name "commerce.productName"
      price "commerce.price"
      category "commerce.department"
      description "commerce.productDescription"
    }
  }

  output customers json { path "output/customers.json" }
  output customers csv  { path "output/customers.csv" }
  output customers sql  { path "output/customers.sql" table "customers" }
  output products yaml  { path "output/products.yaml" }
  output products markdown { path "output/products.md" }
}
```

### Tests

- Generate a 10-row dataset, verify record count and field presence.
- Verify determinism: same seed produces same records.
- Verify unknown provider throws.
- End-to-end: parse DSL → generate → render JSON, verify file content.

## Phase 4 — Synthea Tool

**New file:** `libraries/libsyntheticgen/tools/synthea.js`

### Class

```javascript
import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

class SyntheaTool {
  /**
   * @param {object} deps
   * @param {object} deps.logger
   * @param {string} [deps.syntheaJar] - Path to synthea-with-dependencies.jar
   */
  constructor({ logger, syntheaJar }) {
    if (!logger) throw new Error('SyntheaTool requires logger')
    this.logger = logger
    this.syntheaJar = syntheaJar || process.env.SYNTHEA_JAR || 'synthea-with-dependencies.jar'
  }

  async checkAvailability() {
    try {
      await exec('java', ['-version'])
      // Check jar exists
      await readFile(this.syntheaJar)
      return true
    } catch {
      throw new Error(
        `Synthea requires Java and ${this.syntheaJar}. ` +
        'Install Java (java.com) and download Synthea ' +
        '(github.com/synthetichealth/synthea/releases). ' +
        'Set SYNTHEA_JAR to the jar path.'
      )
    }
  }

  async generate(config) {
    const tmpDir = await mkdtemp('synthea-')
    const args = [
      '-jar', this.syntheaJar,
      '-p', String(config.population || 100),
      '-s', String(config.seed),
      '--exporter.fhir.export', 'true',
      '--exporter.baseDirectory', tmpDir,
    ]
    if (config.modules) {
      for (const mod of config.modules) {
        args.push('-m', mod)
      }
    }

    this.logger.info(`Running Synthea: population=${config.population}`)
    await execFileAsync('java', args)

    // Read FHIR bundles from output
    const fhirDir = join(tmpDir, 'fhir')
    const bundleFiles = (await readdir(fhirDir)).filter(f => f.endsWith('.json'))
    const bundles = await Promise.all(
      bundleFiles.map(async f => JSON.parse(await readFile(join(fhirDir, f), 'utf-8')))
    )

    // Flatten bundles into datasets by resource type
    const byType = new Map()
    for (const bundle of bundles) {
      for (const entry of bundle.entry || []) {
        const resource = entry.resource
        const type = resource.resourceType
        if (!byType.has(type)) byType.set(type, [])
        byType.get(type).push(resource)
      }
    }

    // Return one dataset per resource type
    const datasets = []
    for (const [type, records] of byType) {
      datasets.push({
        name: `${config.name}_${type.toLowerCase()}`,
        schema: null,
        records,
        metadata: { tool: 'synthea', resourceType: type },
      })
    }

    // Clean up
    await rm(tmpDir, { recursive: true })

    return datasets
  }
}
```

### Multi-dataset handling

Synthea is unique: it produces multiple datasets (one per FHIR resource type)
from a single invocation. The pipeline must handle this:

```javascript
// In pipeline — tools that return arrays
const result = await tool.generate({ ...ds.config, seed: ast.seed, name: ds.id })
const resultDatasets = Array.isArray(result) ? result : [result]
for (const dataset of resultDatasets) {
  datasets.set(dataset.name, dataset)
}
```

Output blocks reference the expanded names:

```
output patients_patient csv  { path "output/patients.csv" }
output patients_encounter csv { path "output/encounters.csv" }
output patients_condition csv { path "output/conditions.csv" }
```

Or use a wildcard convention — `output patients * csv` — that expands to all
datasets with the `patients_` prefix. The simpler approach (explicit names) is
sufficient for now.

### Example DSL

Create `examples/synthea-demo.dsl`:

```
universe SyntheaDemo {
  seed 42

  dataset patients {
    tool synthea
    population 100
    modules [diabetes]
  }

  output patients_patient csv      { path "output/patients.csv" }
  output patients_encounter csv    { path "output/encounters.csv" }
  output patients_condition json   { path "output/conditions.json" }
  output patients_observation json { path "output/observations.json" }
}
```

### Tests

- Unit test with mocked `execFile`: verify args passed to Java.
- Unit test with canned FHIR bundles: verify flattening by resource type.
- Availability check: verify error message when Java missing.

## Phase 5 — SDV Tool

**New file:** `libraries/libsyntheticgen/tools/sdv.js`

**New file:** `libraries/libsyntheticgen/tools/sdv_generate.py`

### Bridge script

A thin Python script that the SDV tool invokes as a subprocess:

```python
#!/usr/bin/env python3
"""Bridge between fit-universe and SDV."""
import json
import sys
from sdv.metadata import Metadata
from sdv.single_table import GaussianCopulaSynthesizer

def main():
    config = json.load(open(sys.argv[1]))
    metadata = Metadata.load_from_json(config['metadata'])

    for table_name in metadata.get_tables():
        synth = GaussianCopulaSynthesizer(metadata, table_name=table_name)
        synth.fit(None)  # metadata-only fitting
        samples = synth.sample(num_rows=config['rows'])

        output = {
            'name': table_name,
            'records': json.loads(samples.to_json(orient='records')),
        }
        print(json.dumps(output))  # one JSON object per line

if __name__ == '__main__':
    main()
```

### Class

```javascript
class SdvTool {
  constructor({ logger }) {
    if (!logger) throw new Error('SdvTool requires logger')
    this.logger = logger
    this.scriptPath = join(import.meta.dirname, 'sdv_generate.py')
  }

  async checkAvailability() {
    try {
      await execFileAsync('python3', ['-c', 'import sdv'])
      return true
    } catch {
      throw new Error(
        'SDV requires Python 3 with the sdv package. ' +
        'Install with: pip install sdv'
      )
    }
  }

  async generate(config) {
    const tmpConfig = join(tmpdir(), `sdv-config-${Date.now()}.json`)
    await writeFile(tmpConfig, JSON.stringify({
      metadata: config.metadata,
      rows: config.rows || 1000,
      seed: config.seed,
    }))

    const { stdout } = await execFileAsync('python3', [this.scriptPath, tmpConfig])
    await rm(tmpConfig)

    // Parse newline-delimited JSON
    const datasets = stdout.trim().split('\n').map(line => {
      const obj = JSON.parse(line)
      return {
        name: `${config.name}_${obj.name}`,
        schema: null,
        records: obj.records,
        metadata: { tool: 'sdv', table: obj.name },
      }
    })

    return datasets
  }
}
```

### Example DSL

Create `examples/sdv-demo.dsl`:

```
universe SdvDemo {
  seed 42

  dataset transactions {
    tool sdv
    metadata "schemas/transactions_metadata.json"
    rows 10000
  }

  output transactions_payments csv     { path "output/payments.csv" }
  output transactions_payments parquet { path "output/payments.parquet" }
  output transactions_payments sql     { path "output/payments.sql" table "payments" }
}
```

### Tests

- Unit test with mocked subprocess: verify Python script path and config.
- Unit test with canned stdout: verify JSON parsing and dataset construction.
- Availability check: verify error message when Python/SDV missing.

## File Inventory

| Action | Path                                                          |
| ------ | ------------------------------------------------------------- |
| Modify | `libraries/libsyntheticgen/dsl/tokenizer.js`                  |
| Modify | `libraries/libsyntheticgen/dsl/parser.js`                     |
| Modify | `libraries/libsyntheticgen/index.js`                          |
| Modify | `libraries/libsyntheticgen/package.json`                      |
| Modify | `libraries/libsyntheticrender/render/renderer.js`             |
| Modify | `libraries/libsyntheticrender/index.js`                       |
| Modify | `libraries/libsyntheticrender/package.json`                   |
| Modify | `libraries/libuniverse/pipeline.js`                           |
| Modify | `libraries/libuniverse/bin/fit-universe.js`                   |
| Create | `libraries/libsyntheticgen/tools/faker.js`                 |
| Create | `libraries/libsyntheticgen/tools/synthea.js`               |
| Create | `libraries/libsyntheticgen/tools/sdv.js`                   |
| Create | `libraries/libsyntheticgen/tools/sdv_generate.py`          |
| Create | `libraries/libsyntheticrender/render/dataset-renderers.js`    |
| Create | `examples/faker-demo.dsl`                                     |
| Create | `examples/synthea-demo.dsl`                                   |
| Create | `examples/sdv-demo.dsl`                                       |

## Dependency Changes

| Package          | Add to             | Reason                         |
| ---------------- | ------------------ | ------------------------------ |
| `@faker-js/faker` | libsyntheticgen    | In-process field generation    |
| `parquet-wasm`    | libsyntheticrender | Parquet file writing           |

No new dependencies for Synthea (subprocess) or SDV (subprocess). The `yaml`
package is already present.

## Testing Strategy

### Unit tests

Each tool and renderer has isolated unit tests:

- **Tools:** Test `generate()` with known seeds, verify determinism and
  record shape. Mock external dependencies (Java, Python) at the subprocess
  boundary.
- **Renderers:** Test each format with a fixture dataset containing strings,
  numbers, booleans, nulls, dates, and nested objects. Verify output is valid
  (parseable JSON, valid CSV, valid SQL, readable Parquet).

### Integration test

Parse `examples/faker-demo.dsl` → generate → render all formats → verify
files exist with correct content. This runs in CI without external tools
(Faker is always available).

Synthea and SDV integration tests are gated on tool availability — skip with
a clear message if Java/Python are not installed.

### Regression

Run the existing `examples/universe.dsl` through the full pipeline. Verify
identical output — no changes to org-and-pathway generation.
