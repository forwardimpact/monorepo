# 190: Implementation Plan

## Approach

Modify the shared composite action to clone and push the GitHub wiki, configure
Claude Code's `autoMemoryDirectory`, and update all agent profiles with
memory-writing instructions. No workflow files change — they inherit the new
`wiki: "true"` default automatically.

## Modified Files

### `.github/actions/claude/action.yml`

Add a new input:

```yaml
wiki:
  description: Clone the repository wiki for shared agent memory
  required: false
  default: "true"
```

Add three new steps around the existing "Run Claude Code" step:

**Before Claude runs — Clone wiki:**

```yaml
- name: Clone wiki for shared memory
  id: clone-wiki
  if: inputs.wiki == 'true'
  shell: bash
  run: |
    WIKI_DIR="/tmp/wiki"
    REPO_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}.wiki.git"

    if ! git clone "https://x-access-token:${GH_TOKEN}@${REPO_URL#https://}" "$WIKI_DIR" 2>/dev/null; then
      mkdir -p "$WIKI_DIR"
      git -C "$WIKI_DIR" init
      echo "# Agent Memory" > "$WIKI_DIR/Home.md"
      git -C "$WIKI_DIR" add .
      git -C "$WIKI_DIR" commit -m "Initialize wiki for agent memory"
    fi

    echo "wiki-dir=$WIKI_DIR" >> "$GITHUB_OUTPUT"
```

**Before Claude runs — Configure settings:**

```yaml
- name: Configure shared memory directory
  if: inputs.wiki == 'true'
  shell: bash
  run: |
    WIKI_DIR="${{ steps.clone-wiki.outputs.wiki-dir }}"
    SETTINGS_FILE=".claude/settings.json"
    if [ -f "$SETTINGS_FILE" ]; then
      node -e "
        const fs = require('fs');
        const s = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf8'));
        s.autoMemoryDirectory = '$WIKI_DIR';
        fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(s, null, 2) + '\n');
      "
    else
      echo '{"autoMemoryDirectory":"'"$WIKI_DIR"'"}' > "$SETTINGS_FILE"
    fi
```

**After trace upload — Push wiki:**

```yaml
- name: Push wiki changes
  if: always() && inputs.wiki == 'true'
  shell: bash
  run: |
    WIKI_DIR="${{ steps.clone-wiki.outputs.wiki-dir }}"
    cd "$WIKI_DIR"
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git add -A
    if git diff --cached --quiet; then
      echo "No wiki changes to push"
      exit 0
    fi
    AGENT_NAME="${GITHUB_WORKFLOW// /-}"
    git commit -m "memory($AGENT_NAME): update from run $GITHUB_RUN_NUMBER"
    git push || echo "Wiki push failed (non-fatal)"
```

### `.claude/agents/*.md` (all four agents)

Add a `## Memory` section at the end of each agent profile with common
instructions plus agent-specific guidance.

**Common block (all agents):**

```markdown
## Memory

You have access to a shared memory directory that persists across runs and is
shared with all CI agents. **Always write to memory at the end of your run.**

Record:
- **Actions taken** — What you did this run (PRs merged, branches rebased,
  releases cut, findings reported)
- **Decisions and rationale** — Why you chose a particular action, especially
  when alternatives existed
- **Observations for teammates** — Patterns, recurring issues, or context that
  other agents would benefit from knowing
- **Blockers and deferred work** — Issues you could not resolve and why, so the
  next run (or another agent) can pick them up
```

**Agent-specific additions:**

- **release-manager**: Release versions cut, PRs needing manual conflict
  resolution, main branch CI state
- **security-specialist**: CVEs evaluated, policy violations found, Dependabot
  PRs processed and their outcomes
- **improvement-coach**: Traces analyzed, key findings, patterns across coaching
  cycles
- **product-manager**: PRs triaged, contributor trust decisions, merge outcomes,
  PR types skipped

### `CONTINUOUS_IMPROVEMENT.md`

Add a `## Shared Memory` section after `## Design Principles` describing the
wiki-based memory architecture and how agents use it.

## Verification

1. Trigger any workflow via `workflow_dispatch` — verify wiki clone, memory
   writes, and wiki push all succeed
2. Run two workflows sequentially — verify the second agent sees memory from the
   first
3. Verify `wiki: "false"` skips all wiki steps
4. Verify push failure is non-fatal (workflow still succeeds)
