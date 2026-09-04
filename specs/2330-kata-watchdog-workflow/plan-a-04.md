# Plan 2330-a Part 04: Operator contract, Gemba loop, orientation pages

The resume rule in every home that states it, the two unqualified Kata claims,
the Gemba site's sixth loop step and two counts, and the App permission table.

Depends on: part 03. Route: `technical-writer` for steps 1 to 4, 7, and 8;
`staff-engineer` for steps 5 and 6, which rewrite SVG geometry and CSS timing.

## Step 1: Correct the resume instruction in three homes

Make every home state the rule the watchdog can honour.

Modified: `.claude/skills/kata-setup/SKILL.md`,
`websites/kata/docs/continuous-improvement/index.md`,
`websites/kata/docs/spec-to-shipped/approval-gates/index.md`

| File | Line | From | To |
| ---- | ---- | ---- | -- |
| `.claude/skills/kata-setup/SKILL.md` | 199 | "Unset it to resume" | "Write a falsy value to resume. Deleting the variable is not clearing it." |
| `websites/kata/docs/continuous-improvement/index.md` | 270 | "Clear it to resume." | "Write a falsy value to resume. Deleting the variable is not clearing it." |
| `websites/kata/docs/spec-to-shipped/approval-gates/index.md` | 158 | "Clear the variable to resume." | "Write a falsy value to resume. Deleting the variable is not clearing it." |

`KATA.md:193` carries the fourth home. Part 05 changes it, in the same edit that
adds the watchdog paragraph.

Write the skill file through
`echo … | bunx gemba-selfedit .claude/skills/kata-setup/SKILL.md` when settings
block the direct edit.

Verify: `rg 'unset it|Clear it to resume|Clear the variable to resume' -i
websites/kata .claude/skills/kata-setup` returns nothing, and
`bunx jidoka instructions` passes.

## Step 2: Qualify the two unqualified claims

Say what the two pages already mean, and what the other two homes already say.

Modified: `websites/kata/docs/getting-started/index.md`,
`websites/kata/docs/continuous-improvement/index.md`

| File | Line | From | To |
| ---- | ---- | ---- | -- |
| `websites/kata/docs/getting-started/index.md` | 105 | "To halt every workflow at once" | "To halt every Kata workflow at once" |
| `websites/kata/docs/continuous-improvement/index.md` | 264 | "Every workflow checks one repository variable" | "Every Kata workflow checks one repository variable" |

`products/kata/actions/kata-agent/action.yml` needs no edit. Lines 105-106 and
line 138 already read "every kata-\* workflow", and its README names the
killswitch nowhere.

Verify: `rg 'every workflow' -i websites/kata/docs` returns only the two
non-killswitch uses at `continuous-improvement/index.md:33` and
`getting-started/index.md:50`.

## Step 3: Add the App permission and state the exclusion

Tell the operator what to grant and why the grant excludes secrets.

Modified: `.claude/skills/kata-setup/references/github-app.md`,
`.claude/skills/kata-setup/SKILL.md`

Add one row to § Repository Permissions, after **Workflows**:

```markdown
| **Variables**     | Read & write | The watchdog engages the killswitch variable; organization-scope read resolves the effective value |
```

`.claude/skills/kata-setup/references/github-app.md` measures 680 of its
768-word L6 cap and 114 of 128 lines. This step adds roughly 99 words, so trim
at least 35 words first. The § Event Subscriptions preamble is the candidate.

Line 31 reads "Under **Permissions**, set the **repository permissions**
below." Change it to name both tables.

Add a second section below the first, because the file has no
organization-permission home today and `latch.read()` pages the organization
listing:

```markdown
## Organization Permissions

| Permission    | Access    | Why                                                     |
| ------------- | --------- | ------------------------------------------------------- |
| **Variables** | Read-only | Resolves the effective killswitch value across scopes   |
```

Add two sentences below the two tables: the App holds no **Secrets** permission
at either scope, so the credential that can halt the team can never read or
write a secret. The killswitch is an Actions variable in every workflow, action,
and template, which is what makes that scoping possible.

Without the organization grant,
`GET /repos/{repo}/actions/organization-variables` returns 403, the latch read
fails, and every engage run exits 1 without writing.

In `.claude/skills/kata-setup/SKILL.md`, the setup report gains one line naming
the variables permission and this reason.

Verify: `bunx jidoka instructions` passes and `bun run lint:md` passes.

## Step 4: Add the sixth loop step to the Gemba site

Name the step the platform now ships, and move the two counts.

Modified: `websites/gemba/index.md`

Text changes:

| Line | From | To |
| ---- | ---- | -- |
| 3 | "Five commands in a terminal and four composite actions" | "Six commands in a terminal and five composite actions" |
| 3 | "Stand up, run, see, remember, then measure." | "Stand up, run, see, remember, measure, then stop." |
| 19 | `aria-label="The Gemba loop: stand up, run, see, remember, measure"` | the same list plus `, stop` |
| 51 | stat-detail "Stand up, run, see, remember, measure" | the same list plus `, stop` |
| 86 | "Five steps. Every run leaves a record." | "Six steps. Every run leaves a record." |
| 87 | "The loop runs stand up, then run, then see, then remember, then measure." and "Four steps ship as a command." | the list plus "then stop", and "Five steps ship as a command." |
| 88 | "Two of the five steps" | "Two of the six steps" |
| 125 | "Four published composite actions run the same steps" | "Five published composite actions run the same steps" |
| 131 | "Install the five commands" | "Install the six commands" |
| 135 | surface-name "Four composite actions" | "Five composite actions" |
| 163 | "the same five commands" | "the same six commands". **Leave "the same four actions" unchanged**: the sentence describes what Kata's workflows pin, and `watchdog.yml` is deliberately not a Kata workflow. |

Add one `step-card` after the `Measure` card, which closes at line 115:

```html
      <div class="step-card stagger-item">
        <div class="step-name">Stop</div>
        <p class="step-question">Is the team creating work faster than a human can read it?</p>
        <span class="step-command">gemba-watchdog</span>
      </div>
```

Verify: `bun run lint:md` passes, and
`rg -ni 'five command|five step|four published|four composite' websites/gemba/index.md`
returns nothing. Line 163's "the same four actions" survives by design.

## Step 5: Re-space the loop artwork for six dots

Keep the artwork's start point, end point, and viewBox, and fit one more dot.

Modified: `websites/gemba/index.md`

The staircase SVG appears four times, at lines 19-30, 68-79, 144-155, and
170-181. Each holds **four** plain `trace-dot` circles, three `trace-glow`
circles, one `trace-dot trace-dot-live` circle at `(53, 8)`, and one
`trace-line` path: five stations in all. Replace the four plain circles with
five, and replace the path, in every copy. The live dot stays and becomes the
sixth station:

```html
    <path class="trace-line" d="M4 21 C6.5 21 6.5 20 9 20 C13.4 20 13.4 17.6 17.8 17.6 C22.2 17.6 22.2 15.2 26.6 15.2 C31 15.2 31 12.8 35.4 12.8 C39.8 12.8 39.8 10.4 44.2 10.4 C48.6 10.4 48.6 8 53 8" stroke="url(#gemba-trace-line)" />
    <circle class="trace-dot" cx="9" cy="20" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" cx="17.8" cy="17.6" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" cx="26.6" cy="15.2" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" cx="35.4" cy="12.8" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" cx="44.2" cy="10.4" r="2.2" fill="url(#gemba-dot)" />
```

The `trace-return` path `M53 8 Q29 22 4 21`, the three `trace-glow` circles at
`(53, 8)`, and the `trace-dot-live` circle at `(53, 8)` stay unchanged in every
copy.

In the hero copy only (lines 19-30), the `data-step` attributes shift by one
position: `stand-up`, `run`, `see`, `remember`, and `measure` sit on the five
plain dots in that order, and the live dot at `(53, 8)` becomes
`data-step="stop"`.

The flat wordmark SVG at lines 11-17 (viewBox `0 0 64 4`) gains a sixth dot. Its
five circles become six, with `cx` values `6.5`, `16.7`, `26.9`, `37.1`, `47.3`,
and `57.5`.

Verify: `bunx fit-doc build` renders the page, and each staircase copy holds
five plain `trace-dot` circles plus one `trace-dot-live` circle, six stations in
all.

## Step 6: Widen the grid and extend the dot animations

Give the sixth card a column and the fifth plain dot a delay.

Modified: `websites/gemba/assets/main.css`

| Line | Change |
| ---- | ------ |
| 504 | `.step-grid` `grid-template-columns: repeat(5, 1fr)` becomes `repeat(6, 1fr)` |
| 1088 | The `max-width: 960px` `.step-grid` rule stays at `repeat(3, 1fr)`, which divides six evenly |
| 1107 | The `max-width: 768px` `.step-grid` rule stays at `repeat(2, 1fr)` |
| 1135 | The `max-width: 480px` `.step-grid` rule stays at `1fr` |
| 920-922 | The comment reads "The first four dots stagger by sibling position". Make it five |
| 924-941 | The reveal stagger keys `animation-delay` on `.trace-dot:nth-of-type(1)` through `(4)` at 80/200/320/440ms, then `.trace-dot-live` at 560ms. Add `:nth-of-type(5)` at 560ms and move `.trace-dot-live` to 680ms |
| 943-945 | `.trace-glow` holds a 560ms delay inside its `animation` shorthand. Move it to 680ms so the rings light with the nib they surround, not one station early |
| 990-1008 | The `traceLamp` cycle keys `(1)` through `(4)` at 0/600/1200/1800ms (lines 990-1005) and `.trace-dot-live` at 2400ms (lines 1006-1008) over a `3s` period. Add `:nth-of-type(5)` at 2400ms, move `.trace-dot-live` to 3000ms, and lengthen the `animation` period at line 987 from `3s` to `3.6s` so six stations divide it evenly |

Verify: `bunx fit-doc build` renders one row of six cards above 960px, and the
lamp animation visits six stations in order.

## Step 7: Update `llms.txt`

Keep the agent-readable summary in step with the site.

Modified: `websites/gemba/llms.txt`

- Lines 3-4 enumerate the loop as five verbs: "Stand up the environment, run
  agent sessions, read the traces, keep the memory, and measure the outcomes."
  Add "and stop the team when it runs away", moving the conjunction.
- "Five commands and four CI actions run one loop." becomes "Six commands and
  five CI actions run one loop." The sentence wraps across lines 4-5, so match
  it across the break rather than on one line.
- "The loop is stand up, run, see, remember, and measure." becomes "The loop is
  stand up, run, see, remember, measure, and stop." Move the conjunction rather
  than appending a second one.
- "Five commands cover the loop." becomes "Six commands cover the loop." and
  gains one sentence: `gemba-watchdog` counts repository activity over a window
  and engages an operator latch variable when a counter breaches its threshold.
- "Four published composite actions run the same loop in CI." becomes "Five
  published composite actions run the same loop in CI." and gains one sentence
  for `gemba-watchdog`.

Verify:
`rg -n 'Five command|Four published|four CI actions' websites/gemba/llms.txt`
returns nothing.

## Step 8: Add the guard step to the composing skill

Let the platform skill compose the seventh capability.

Modified: `.claude/skills/gemba/SKILL.md`

- "all six `gemba-*` commands" becomes "all seven `gemba-*` commands".
- "the six platform skills" becomes "the seven platform skills".
- The existing `**Guard the loop:**` block gains one bullet above the
  `gemba-selfedit` bullet: `gemba-watchdog` counts repository activity over a
  window and engages an operator latch variable on a breach. The
  `forwardimpact/gemba-watchdog` action is the same guard step in CI.
- Line 50's "The loop is **stand up → run → see → remember → measure**" gains
  "→ stop", so the published skill and the site agree on the loop's length.
- The `## Documentation` list gains
  `[Guard an Agent Team's Activity](https://www.gemba.team/docs/guard-activity/index.md)`.

Write it through `echo … | bunx gemba-selfedit .claude/skills/gemba/SKILL.md`
when settings block the direct edit.

Verify: `bunx jidoka instructions` passes and `bun run check` passes.
