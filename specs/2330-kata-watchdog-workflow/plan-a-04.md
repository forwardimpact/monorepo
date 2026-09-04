# Plan 2330-a Part 04: Operator contract, Gemba loop, orientation pages

The resume rule in every home that states it, the two unqualified Kata claims,
the Gemba site's sixth loop step and two counts, and the App permission table.

Depends on: part 03. Route: `technical-writer`.

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
websites/kata .claude/skills/kata-setup` returns nothing.

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

Add two sentences below the table: the App holds no **Secrets** permission, so
the credential that can halt the team can never read or write a secret. The
killswitch is an Actions variable in every workflow, action, and template, which
is what makes that scoping possible.

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
| 163 | "the same five commands" and "the same four actions" | "the same six commands" and "the same five actions" |

Add one `step-card` after the `Measure` card, which closes at line 115:

```html
      <div class="step-card stagger-item">
        <div class="step-name">Stop</div>
        <p class="step-question">Is the team creating work faster than a human can read it?</p>
        <span class="step-command">gemba-watchdog</span>
      </div>
```

Verify: `bun run lint:md` passes, and no "five"/"four" count claim about
commands or actions survives `rg -n 'five command|four composite|four action'
-i websites/gemba/index.md`.

## Step 5: Re-space the loop artwork for six dots

Keep the artwork's start point, end point, and viewBox, and fit one more dot.

Modified: `websites/gemba/index.md`

The staircase SVG appears four times, at lines 19-30, 68-79, 144-155, and
170-181. Each holds five `trace-dot` circles and one `trace-line` path. Replace
the five circles with six, and replace the path, in every copy:

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

The flat wordmark SVG at lines 11-17 (viewBox `0 0 64 4`) gains a sixth dot.
Replace its five `cx` values with `6.5`, `16.7`, `26.9`, `37.1`, `47.3`, and
`57.5`.

Verify: `bunx fit-doc build` renders the page, and each staircase copy holds six
`trace-dot` circles plus one `trace-dot-live` circle.

## Step 6: Update `llms.txt`

Keep the agent-readable summary in step with the site.

Modified: `websites/gemba/llms.txt`

- "Five commands and four CI actions run one loop." becomes "Six commands and
  five CI actions run one loop."
- "The loop is stand up, run, see, remember, and measure." gains ", and stop".
- "Five commands cover the loop." becomes "Six commands cover the loop." and
  gains one sentence: `gemba-watchdog` counts repository activity over a window
  and engages an operator latch variable when a counter breaches its threshold.
- "Four published composite actions run the same loop in CI." becomes "Five
  published composite actions run the same loop in CI." and gains one sentence
  for `gemba-watchdog`.

Verify:
`rg -n 'Five command|Four published|four CI actions' websites/gemba/llms.txt`
returns nothing.

## Step 7: Add the guard step to the composing skill

Let the platform skill compose the seventh capability.

Modified: `.claude/skills/gemba/SKILL.md`

- "all six `gemba-*` commands" becomes "all seven `gemba-*` commands".
- "the six platform skills" becomes "the seven platform skills".
- The existing `**Guard the loop:**` block gains one bullet above the
  `gemba-selfedit` bullet: `gemba-watchdog` counts repository activity over a
  window and engages an operator latch variable on a breach. The
  `forwardimpact/gemba-watchdog` action is the same guard step in CI.
- The `## Documentation` list gains
  `[Guard an Agent Team's Activity](https://www.gemba.team/docs/guard-activity/index.md)`.

Write it through `echo … | bunx gemba-selfedit .claude/skills/gemba/SKILL.md`
when settings block the direct edit.

Verify: `bunx jidoka instructions` passes and `bun run check` passes.
