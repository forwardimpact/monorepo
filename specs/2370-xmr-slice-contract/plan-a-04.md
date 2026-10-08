# Plan 2370-a Part 04: The rename, the bridges, and the names

The second merge. P8, P9, and P10: this repository's four agent workflows take
the names `kata-setup` writes, the bridges dispatch `agent-dispatch.yml` from
one home, and every published skill, profile, reference, action, and this
repository's prose names the dispatch workflow by its role and the agent
workflows by what they are. The enumeration topic, the genericity rule, and
the product-manager's `product-mix` flag follow. After the merge, the bridge
services release and redeploy.

Depends on: part 03 tier 4 merged (which follows part 02, so the renamed
workflows and the product manager's binary run the new contract). Route:
`staff-engineer`. Pull request title:
`feat(workflows)!: this repository takes its installations' workflow names (#2370)`.

Before the panel: rebase on `main`, because specs 2390 and 2400 touch the
genericity rule, the kata skills, and the x-references. Settings block direct
writes under `.claude/**`; edit those files through
`echo … | bunx gemba-selfedit <path>` (CLAUDE.md § Contributor Workflow).

## Step 1: The workflows

Give the four agent workflows the names, display names, and groups the
templates fix.

Renamed (`git mv`): `.github/workflows/kata-shift.yml` →
`.github/workflows/agent-shift.yml`, `kata-dispatch.yml` →
`agent-dispatch.yml`, `kata-storyboard.yml` → `agent-storyboard.yml`,
`kata-coaching.yml` → `agent-coaching.yml`

| File                   | Line | Change                                                                                                            |
| ---------------------- | ---- | ----------------------------------------------------------------------------------------------------------------- |
| `agent-shift.yml`      | 1    | `name: "Agent: Shift"` (the file has no concurrency block)                                                        |
| `agent-dispatch.yml`   | 1    | `name: "Agent: Dispatch"`                                                                                         |
| `agent-dispatch.yml`   | 67   | `group: agent-dispatch-${{ github.event.issue.number \|\| github.event.pull_request.number \|\| github.run_id }}` |
| `agent-storyboard.yml` | 1    | `name: "Agent: Storyboard"`                                                                                       |
| `agent-storyboard.yml` | 15   | `group: agent-storyboard`                                                                                         |
| `agent-coaching.yml`   | 1    | `name: "Agent: Coaching"`                                                                                         |
| `agent-coaching.yml`   | 16   | `group: agent-coaching`                                                                                           |

No other line changes. `kata-interview.yml` and `curate-wiki.yml` keep their
names.

Verify: `ls .github/workflows/agent-*.yml .github/workflows/kata-*.yml` lists
the four `agent-*` files and `kata-interview.yml` only;
`grep -h 'group:' .github/workflows/agent-*.yml` prints three `agent-` lines
(S19); `grep -h '^name:' .github/workflows/agent-*.yml` prints the four
`Agent:` names (S20); `git diff -M --stat origin/main -- .github/workflows`
shows four renames with one or two changed lines each.

## Step 2: The bridges

Give the dispatch target one home in the library and none in the services.

Modified: `libraries/libbridge/src/dispatch.js`,
`libraries/libbridge/src/dispatcher.js`, `libraries/libbridge/src/index.js`,
`libraries/libbridge/src/callback-payload.js`, `services/ghbridge/index.js`,
`services/msbridge/index.js`, `services/ghbridge/README.md`,
`libraries/libbridge/test/dispatch.test.js`,
`libraries/libbridge/test/dispatcher.test.js`,
`libraries/libbridge/test/resume-scheduler.test.js`,
`services/ghbridge/test/webhook.test.js`,
`services/ghbridge/test/callback.test.js`

- `dispatch.js`: `workflowFile = "agent-dispatch.yml"` in the parameter
  defaults, the one home. Delete the `workflowFile is required` throw. The JSDoc
  reads:
  `@param {string} [params.workflowFile] - Workflow filename; default the dispatch workflow every generated installation has`.
  The module comment at line 3 says "the dispatch workflow".
- `dispatcher.js`: `workflowFile` becomes optional
  (`@param {string} [options.workflowFile]`); delete the
  `workflowFile is required` throw; keep passing
  `workflowFile: this.#workflowFile`, because an `undefined` value takes the
  parameter default in `dispatchWorkflow`. The optional parameter is the
  design's one second route to the name; no service passes it, and one test
  keeps the override live.
- `index.js:11`: `"owner/repo" that hosts the dispatch workflow`.
- `callback-payload.js:5`: `the dispatch workflow's callback payload`.
- `services/ghbridge/index.js`, `services/msbridge/index.js`: delete the
  `WORKFLOW_FILE` constant and the `workflowFile: WORKFLOW_FILE,` line.
- `services/ghbridge/README.md:190`:
  `` 3. Dispatches `agent-dispatch.yml` through `workflow_dispatch`. ``
- Tests: in `dispatch.test.js` (24, 32, 52, 65, 81, 101) and `webhook.test.js`
  (153) every `kata-dispatch.yml` literal becomes `agent-dispatch.yml` (line
  32 and `webhook.test.js:153` assert the dispatched URL; the rest are
  fixture inputs). In `dispatcher.test.js` (123, 272, 303, 338, 369, 427, 464)
  and `resume-scheduler.test.js` (108, 368) the `workflowFile:` fixture line
  is deleted, so those constructions prove the library default; the two
  `workflowFile: "w"` lines at `dispatcher.test.js:144,156` sit inside throw
  expectations and stay as they are. Add one dispatching case to
  `dispatcher.test.js`, "an explicit `workflowFile` overrides the library
  default": construct with `workflowFile: "w"`, dispatch, and assert the
  fetched URL ends `/actions/workflows/w/dispatches`, so the option stays
  live. `dispatch.test.js` "missing
  required fields throw before fetch" drops the `workflowFile` case and gains
  "a call without `workflowFile` POSTs to `agent-dispatch.yml`".
  `dispatcher.test.js` "rejects construction when required options are
  missing" drops `workflowFile` and gains "an absent `workflowFile` dispatches
  the library default". `callback.test.js:243`:
  `a regression where the dispatch workflow handles Discussions again`.

Then run `node scripts/test-gate.mjs` once and commit the printed count into
`scripts/test-gate.floor.json`, because this part moves the test population.

Verify: `rg -n -e kata-dispatch -e WORKFLOW_FILE services libraries/libbridge`
returns no match; `rg -n 'agent-dispatch.yml' libraries/libbridge/src`
matches in `dispatch.js` only;
`rg -n 'agent-dispatch.yml' services/ghbridge/README.md` matches (S21);
`bun run test` from each of `libraries/libbridge`, `services/ghbridge`, and
`services/msbridge` passes.

## Step 3: The enumeration topic and KATA.md

Describe the agent workflows by the new names where the team is explained.

Modified: `.jidoka/invariants/enumeration-drift.topics.yml`, `KATA.md`

- `enumeration-drift.topics.yml:44-45`:

  ```yaml
    - id: agent-workflows
      source: { type: fs-glob, pattern: ".github/workflows/agent-*.yml", id: basename-noext }
  ```

- `KATA.md`:

  | Line         | Change                                                                                                                                                                 |
  | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 91-95        | `agent-shift`, `agent-dispatch` ×4                                                                                                                                     |
  | 100-101      | `agent-shift`, `agent-storyboard`, `agent-coaching`                                                                                                                    |
  | 103, 109     | `agent-dispatch`                                                                                                                                                       |
  | 163          | `<!-- enum:agent-workflows:list -->`                                                                                                                                   |
  | 167-170      | `**agent-shift**`, `**agent-storyboard**`, `**agent-coaching**`, `**agent-dispatch**`; the ids stay in this order inside the fence, as the enumeration compares the set |
  | 178-179, 183 | `agent-shift`, `agent-dispatch`                                                                                                                                        |
  | 188          | `**Killswitch** — every agent workflow and the interview workflow check the \`KATA_KILLSWITCH\``                                                                       |
  | 281-283      | `agent-storyboard`, `agent-dispatch` ×2                                                                                                                                |
  | 339-342      | `agent-dispatch` ×4                                                                                                                                                    |

Verify: `bunx jidoka invariants` exits 0 (the enumeration matches the glob);
`rg -n -e kata-shift -e kata-storyboard -e kata-coaching -e kata-dispatch -e 'kata-\*' KATA.md`
returns no match.

## Step 4: This repository's prose and comments

Name the agent workflows by what they are in every comment that explains
them.

Modified: `CLAUDE.md`, `.github/CLAUDE.md`, `.github/workflows/watchdog.yml`,
`.github/workflows/package-macos.yml`,
`.github/actions/macos-signing/README.md`, `design/kata/index.md`,
`libraries/libharness/src/trace-github.js`,
`libraries/libharness/test/trace-github.test.js`

| File:line                      | Change                                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md:153`                | `Issue, PR/issue comment, Discussion, or the dispatch workflow.` Two words more on a file three words under its cap; `jidoka instructions` is the proof.                      |
| `.github/CLAUDE.md:104`        | `` so the agent workflows cannot `` (one word more on a file with headroom; `jidoka instructions` is the proof)                                                             |
| `.github/CLAUDE.md:112`        | `` (see `agent-shift.yml`): ``                                                                                                                                              |
| `watchdog.yml:5-6`             | `# variable, and its name stays outside the agent-* glob so the "every agent` / `# workflow gates on the killswitch" contract stays true as written.`                        |
| `package-macos.yml:35`         | `# environment can read them, so the agent workflows cannot. The`                                                                                                           |
| `macos-signing/README.md:16`   | `` `publish-*` build jobs declare it. The agent workflows do not. So ``                                                                                                      |
| `design/kata/index.md:354`     | `(through the dispatch workflow)`                                                                                                                                           |
| `trace-github.js:53`           | `` covers `Agent: Shift`, `Agent: Dispatch`, the interview workflow, benchmark-driven eval workflows, and any `kata`-named workflow ``                                       |
| `trace-github.js:358`          | `` (matrix workflows like `agent-shift.yml` emit one `trace--<participant>` ``                                                                                               |
| `trace-github.test.js:199-205` | Rename the list `AGENT_WORKFLOW_NAMES` and retitle its test "matches every agent and interview workflow name"; add `"Agent: Shift"`, `"Agent: Dispatch"`, `"Agent: Coaching"`, `"Agent: Storyboard"`, and keep the `Kata:` names as the old runs' display names. |

Verify:
`rg -n -e kata-shift -e kata-dispatch CLAUDE.md .github design libraries/libharness/src`
returns no match (the bare `kata-*` on `CLAUDE.md:110,142` and in
`publish-skills.yml` names the pack and stays), and `bun run test` from
`libraries/libharness` passes.

## Step 5: The published actions

Keep the killswitch statement true after the rename.

Modified: `products/kata/actions/kata-agent/action.yml`,
`products/kata/actions/kata-interview/action.yml`

- `kata-agent/action.yml:127-128`:
  `so one variable halts every agent workflow and the interview workflow at once.`
- `kata-agent/action.yml:192` and `kata-interview/action.yml:102`:
  `# repository variable halts every agent workflow and the interview workflow at once.`

Comment-only changes. The mirror publishes them on merge; no sibling tag is
owed by this part.

Verify: `rg -n 'kata-\*' products/kata/actions` returns no match.

## Step 6: The pack: skills, profile, references

Name the dispatch workflow by its role everywhere the pack ships.

Modified: `.claude/skills/kata-spec/SKILL.md` (7, 108, 166),
`.claude/skills/kata-design/SKILL.md` (9, 124, 168),
`.claude/skills/kata-plan/SKILL.md` (166),
`.claude/skills/kata-release-merge/SKILL.md` (171),
`.claude/skills/kata-release-merge/references/experiment-path.md` (37),
`.claude/skills/kata-release-merge/references/metrics.md` (9),
`.claude/skills/kata-release-merge/references/templates.md` (31, 76),
`.claude/skills/kata-product-issue/references/trace-discovery.md` (3, 9, 21),
`.claude/agents/release-engineer.md` (6, 50),
`.claude/agents/x-work-trackers.md` (74, 80)

- Every `` `kata-dispatch` `` becomes `the dispatch workflow`. Where the old
  name sits inside a noun phrase, rewrite the phrase: `x-work-trackers.md:74`
  reads `read by the dispatch workflow`, and `:80` reads
  `On github, the dispatch workflow handles`. Two files sit at their word caps:
  - `templates.md` (at cap): `` `dispatch` `` on 31 and 76, one token for one
    token, as the design states.
  - `x-work-trackers.md` (a few words of headroom): the two rewrites above
    add two words. `jidoka instructions` is the proof.
- `trace-discovery.md`: `Agent: Dispatch` on 3, 9, and 21, the one place a
  run listing needs a display name.
- `release-engineer.md:6` (frontmatter description) and `:50`:
  `the dispatch workflow`.

Verify: `bunx jidoka instructions` exits 0;
`rg -n -e kata-dispatch -e 'Kata: Dispatch' .claude` returns no match.

## Step 7: The product-manager's `product-mix` flag

Name the shift stream for the `product_share` series now that the runner's
binary takes the flag.

Modified: `.claude/agents/product-manager.md`

- Line 42: `` Run `gemba-wiki product-mix --event-type agent-shift` `` with
  one clause: the `product_share` stream is the shift stream, whichever
  workflow or session runs the command.

Verify: `rg -n 'event-type agent-shift' .claude/agents/product-manager.md`
matches.

## Step 8: The genericity rule

Gate the bare old basenames as well as the `.yml` form.

Modified: `.jidoka/invariants/skill-genericity.rules.mjs:98`

```js
pattern: "\\bkata-(storyboard|coaching|shift|dispatch)(\\.yml)?\\b",
```

The reason text stays. The rule now gates the bare basename in every `kata-*`
skill and `x-*` reference.

Verify: `bunx jidoka invariants` exits 0 after step 6, and a scratch line
`` `kata-dispatch` `` added to any kata skill makes it fail (revert the
scratch line).

## Step 9: The `kata-setup` changelog entry, when the file exists

Give an installation the marker-token convention through the update
procedure when that procedure exists.

Modified, conditionally: `.claude/skills/kata-setup/references/changelog.md`

If the file exists on `main` at this part's merge, add an entry in whatever
row shape the file states; the three cells below are the content:

| Change | Detect | Do |
| --- | --- | --- |
| A storyboard XmR marker names its slice with `event_type=<slice>`. | A `wiki/storyboard-*.md` marker over a metrics CSV with several `event_type` values carries no `event_type=` token, or a refresh wrote an "XmR block not rendered" notice. | Add `event_type=<slice>` after the CSV path on each such marker, naming the workflow whose runs the board measures (by default `agent-shift`), then run `gemba-wiki refresh` and `gemba-wiki push --paths=<board>`. |

If the file does not exist, post the row above as a comment on spec 2390's
part 03 pull request (or on its tracking issue when no pull request is open
yet), addressed to that part's implementer, and note on this pull request
that S26 is void for this spec.

Verify: when the file exists,
`rg -n 'event_type=' .claude/skills/kata-setup/references/changelog.md`
matches (S26).

## Step 10: The sweep

Close S22 and the quality gates together.

```sh
rg -n -e kata-shift -e kata-storyboard -e kata-coaching -e kata-dispatch KATA.md CLAUDE.md .github .jidoka .claude design websites products/kata/actions libraries/libharness/src
rg -n -e 'kata-\*`?\s*(agent |workflow)' KATA.md CLAUDE.md .github .claude products/kata/actions
bun run check && bun run test
```

The first two return no match (S22). The third exits 0.

## After the merge: the bridges release and redeploy

Put the dispatch target on the hosted bridges. Route: `release-engineer`,
handed off by the merge comment.

1. Run `kata-release-cut` for `libbridge`, `ghbridge`, and `msbridge`; the sweep
   decides each bump (the optional parameter is additive). Dispatch
   `Release: Tag` with
   `tags: libbridge@v<next> svcghbridge@v<next> svcmsbridge@v<next>`, each the
   next patch above its highest tag at that time (`git tag -l '<prefix>@v*'`).
   Any release note the cut writes names `agent-dispatch.yml` and the role,
   never the old file name, so S21 holds after the cut.
2. Redeploy both hosted bridges from those tags. The deployment is the
   operator's; the pull request comment names the two tags and asks for the
   redeploy. Until it lands, a discussion dispatch into this repository finds
   no `kata-dispatch.yml`; the discussion stays on the channel, and the
   operator re-dispatches it.

Verify: a smoke dispatch from the GitHub Discussions bridge starts an
`Agent: Dispatch` run (`gh run list --workflow agent-dispatch.yml --limit 1`
shows a run after the redeploy).

## Hand-off

The merge comment hands part 05 to the operator: an interactive session with
`gh variable` write access runs it right after this merge. A session that an
agent workflow hosts does not run it (plan-a-05.md). The comment also names
the two bridge tags and asks for the redeploy.
