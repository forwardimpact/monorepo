# Plan 0500-A — Facilitated Agent Identity via Profile Loading

## Approach

Replace the `--agents` colon-delimited config string with `--agent-profiles`
(comma-separated profile names) and `--agent-cwd` (single shared directory).
This makes the Claude Agent SDK load `.claude/agents/{name}.md` for each
facilitated agent, giving it full identity and domain context. Then strip the
defensive identity/domain/data-reuse prompt injection from `facilitator.js`,
leaving only the orchestration tool descriptions.

Six files change, one function is replaced, no files are created or deleted.

## Ordering

Steps 1 and 2 are tightly coupled (CLI definition → parser). Step 3 (prompt
cleanup) is independent. Step 4 (workflows) depends on step 1 (new option
names). Step 5 (verification) depends on all prior steps.

## Steps

### Step 1. Replace `--agents` with `--agent-profiles` and `--agent-cwd` in CLI definition

**File:** `libraries/libeval/bin/fit-eval.js` (lines 120-124, 138)

Replace the `agents` option in the `facilitate` command definition:

```js
// Before
agents: {
  type: "string",
  description:
    "Agent configs: name1:cwd=/tmp/a:role=explorer,name2:cwd=/tmp/b:role=tester",
},

// After
"agent-profiles": {
  type: "string",
  description: "Comma-separated agent profile names",
},
"agent-cwd": {
  type: "string",
  description: "Agent working directory (default: .)",
},
```

Update the example (line 138):

```js
// Before
'fit-eval facilitate --task-file=task.md --agents "explorer:cwd=/tmp/a,tester:cwd=/tmp/b"'

// After
'fit-eval facilitate --task-file=task.md --agent-profiles "security-engineer,technical-writer"'
```

### Step 2. Replace `parseAgentConfigs()` and update `parseFacilitateOptions()`

**File:** `libraries/libeval/src/commands/facilitate.js`

Remove the `parseAgentConfigs()` function (lines 7-29) and the `mkdtempSync`,
`join`, `tmpdir` imports it uses. Replace with:

```js
function parseAgentProfiles(raw, cwd) {
  return raw.split(",").map((entry) => {
    const name = entry.trim();
    return { name, role: name, cwd, agentProfile: name };
  });
}
```

In `parseFacilitateOptions()`, replace:

```js
// Before
const agentsRaw = values.agents;
if (!agentsRaw) throw new Error("--agents is required");
const agentConfigs = parseAgentConfigs(agentsRaw);
if (agentConfigs.length < 1)
  throw new Error("--agents must specify at least one agent");

// After
const profilesRaw = values["agent-profiles"];
if (!profilesRaw) throw new Error("--agent-profiles is required");
const agentCwd = resolve(values["agent-cwd"] ?? ".");
const agentConfigs = parseAgentProfiles(profilesRaw, agentCwd);
if (agentConfigs.length < 1)
  throw new Error("--agent-profiles must specify at least one profile");
```

The `resolve` import already exists. Remove the now-unused `mkdtempSync` from
`"node:fs"`, `join` from `"node:path"`, and the `tmpdir` import from
`"node:os"`.

### Step 3. Strip identity/domain/data-reuse append from system prompt

**File:** `libraries/libeval/src/facilitator.js` (lines 475-486)

Replace the system prompt assembly in the `createAgentRunner` call:

```js
// Before
systemPrompt: {
  type: "preset",
  preset: "claude_code",
  append:
    `You are "${config.name}" (role: ${config.role}). ` +
    FACILITATED_AGENT_SYSTEM_PROMPT +
    " Report only on your own domain — do not duplicate " +
    "other participants' areas. " +
    "The facilitator's messages contain measured data — use it " +
    "as your starting point rather than re-gathering the same " +
    "information.",
},

// After
systemPrompt: {
  type: "preset",
  preset: "claude_code",
  append: FACILITATED_AGENT_SYSTEM_PROMPT,
},
```

### Step 4. Update workflow callers

Three files change.

**File:** `.github/actions/kata-action/action.yml`

Inputs section — the `agent-cwd` input already exists (line 23) for supervise
mode but has no default and a supervise-only description. Three changes:

1. Remove the `agents` input (lines 56-60).
2. Add `agent-profiles` input in its place:

```yaml
agent-profiles:
  description: Comma-separated agent profile names for facilitate mode
  required: false
```

3. Update the existing `agent-cwd` input (lines 23-25) — broaden the description
   and add a default:

```yaml
# Before
agent-cwd:
  description: Agent working directory (for "supervise" mode)
  required: false

# After
agent-cwd:
  description: Agent working directory (for supervise and facilitate modes)
  required: false
  default: "."
```

Env block — remove the `AGENTS` line (line 112) and add `AGENT_PROFILES`. Leave
the existing `AGENT_CWD` line (line 104) unchanged:

```yaml
# Remove
AGENTS: ${{ inputs.agents }}

# Add
AGENT_PROFILES: ${{ inputs.agent-profiles }}
```

Facilitate branch (lines 173-177) — pass new options:

```bash
# Before
bunx fit-eval facilitate \
  --facilitator-cwd="." \
  --agents="$AGENTS" \
  --model="$MODEL" \
  "${args[@]}"

# After
bunx fit-eval facilitate \
  --facilitator-cwd="." \
  --agent-profiles="$AGENT_PROFILES" \
  --agent-cwd="$AGENT_CWD" \
  --model="$MODEL" \
  "${args[@]}"
```

**File:** `.github/workflows/daily-meeting.yml` (line 54)

```yaml
# Before
agents: "security-engineer:role=security-engineer:cwd=.,..."

# After
agent-profiles: "security-engineer,technical-writer,product-manager,staff-engineer,release-engineer"
```

The `agent-cwd` input is not needed — the action default (`.`) is correct.

**File:** `.github/workflows/coaching-session.yml` (line 56)

```yaml
# Before
agents: "${{ inputs.agent }}:role=${{ inputs.agent }}"

# After
agent-profiles: "${{ inputs.agent }}"
```

The `agent-cwd` input is not needed — the action default (`.`) is correct.

### Step 5. Verify

Run `bun run check` to confirm no regressions. The existing facilitator tests
(`facilitator.test.js`, `facilitator-messaging.test.js`) construct `Facilitator`
directly with mock runners — they bypass CLI parsing and are unaffected by the
option changes.

## Blast radius

| File                                           | Action                                            |
| ---------------------------------------------- | ------------------------------------------------- |
| `libraries/libeval/bin/fit-eval.js`            | Modified — option definition + example            |
| `libraries/libeval/src/commands/facilitate.js` | Modified — replace parser, update imports         |
| `libraries/libeval/src/facilitator.js`         | Modified — simplify system prompt append          |
| `.github/actions/kata-action/action.yml`       | Modified — inputs + env + facilitate branch       |
| `.github/workflows/daily-meeting.yml`          | Modified — replace `agents` with `agent-profiles` |
| `.github/workflows/coaching-session.yml`       | Modified — replace `agents` with `agent-profiles` |

No files created. No files deleted.

## Libraries used

No shared `@forwardimpact/lib*` libraries are consumed by this change. The
modifications use only Node.js built-ins (`node:fs`, `node:path`) and the
existing `createFacilitator` and `createAgentRunner` internal imports.

## Risks

- **Profile name must match `.claude/agents/{name}.md` exactly.** If a workflow
  passes a name that doesn't match a profile file, the SDK will not load a
  profile. This is the existing behaviour for `run` and `supervise` modes —
  facilitate simply adopts the same convention.

## Execution

Single agent: `staff-engineer`. All steps are sequential and small. No
decomposition needed.
