# The rule kit

`rules` is either a static array of rule objects, or a `(ruleKit) => array`
factory that builds them from the helpers below.

## Rule object

```js
{
  id: "my-rule.no-foo",          // stable identifier, shows in findings
  scope: "src-file",             // which subject group this rule judges
  severity: "fail",              // any finding fails the run
  when: (s) => !s.parseError,    // optional guard; skip subjects that fail it
  check: (s, ctx) =>             // return a truthy report on violation, else null
    s.usesFoo ? { detail: s.foo } : null,
  message: (s, report) =>        // one-line finding text
    `imports foo [${report.detail}]`,
  hint: "import bar instead",    // optional remediation line
}
```

- `check` receives the subject and the shared `ctx` returned from `build`. A
  non-null return is a violation; the returned value is passed to `message` as
  the report.
- `message` and `hint` may be strings or `(subject, report) => string`.
- Keep one concern per rule. Two failure modes on one scope are two rules with
  two ids — that is what makes a finding attributable.

## Helpers (when `rules` is a factory)

```js
rules: ({ parseError, failAll }) => [ … ]
```

- `parseError(scope, { id?, hint? })` — fails any subject carrying a
  `parseError`. Pair with `scanAst`, which sets `parseError` on unparseable
  files. Always include this when a scope is AST-derived, so a syntax error
  surfaces as a finding instead of silently dropping the file.
- `failAll(scope, { id, message, hint?, when? })` — fails every subject in the
  scope. Use when the build step already decided each subject is a violation
  (for example, every `grep` match is a finding).

## Output

Findings render in the same ESLint-style format as the other subcommands; pass
`--json` for machine output. Severity `fail` is the norm — any finding fails
the run. There is no "warn that passes"; if it should not block, it is not an
invariant.
