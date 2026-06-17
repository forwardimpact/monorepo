# Window-open record — Spec 1630 trial

Template staged by this PR; filled and published by the PM lane on the trial
record (the Issue or PR named in spec § Trial audit) **when the window opens**.
This PR ships the template, not an open window.

## F3 gate (do not open the window until this holds)

The trial window does not open until **Exp 47's verdict comment on Issue #1475
has published** (spec § Trial window, falsifier F3). When the window opens,
record the opening date below and the Exp 47 verdict comment that cleared the
gate.

- **Window open date**: `<YYYY-MM-DD>` _(unset until F3 clears)_
- **Exp 47 verdict comment**: `<URL>` _(the comment that satisfied F3)_
- **Window length**: 14 days _(28 if extended under F1)_

## In-scope authoring paths (coverage denominator)

The binding criterion is the authoring path, not membership in this list; the
list is the concrete denominator fixed at window open. Each path's binding (its
one-line pointer to § Citation integrity) must be present at window open — that
presence is the coverage signal (see below).

### Skill paths

| Authoring path | Binding present at open? |
| --- | --- |
| `kata-spec` | `<yes/no>` |
| `kata-design` | `<yes/no>` |
| `kata-plan` | `<yes/no>` |
| `kata-implement` | `<yes/no>` |
| `kata-product-issue` | `<yes/no>` |
| `kata-release-merge` | `<yes/no>` |
| `kata-release-cut` | `<yes/no>` |
| `kata-security-update` | `<yes/no>` |
| `kata-security-audit` | `<yes/no>` |
| `kata-wiki-curate` | `<yes/no>` |
| `kata-documentation` | `<yes/no>` |
| `kata-backlog-synthesis` | `<yes/no>` |
| `kata-interview` | `<yes/no>` |

(`kata-session` is a skill file, but its in-scope authoring path is the
participant protocol, enumerated once under Non-skill paths below — not here.)

> Note: the binding ships in the skill that on `main` is named
> `kata-backlog-synthesis`. The spec text (§ Scope) names the pre-rename
> `kata-pattern-synthesis`; that is stale spec text, not a separate path.

### Non-skill paths

| Authoring path | Binding present at open? |
| --- | --- |
| `kata-session` participant protocol — obstacle/experiment Issues and session wiki writes participants produce | `<yes/no>` |
| Agent-profile routines — each agent's Assess and memory-protocol writes (wiki summaries, weekly logs, Issue and PR narration outside any skill) | `<yes/no>` |
| `kata-dispatch` propagation — the STATUS rows and PR-side comments it lands | `<yes/no>` |

Explicitly excluded (carry no binding, and no block record may be attributed
to them — SC2): `kata-review`, `kata-session` facilitation, `kata-setup`.

## Agent-identity roster (append-only)

Identities whose published bodies are in the audit population. Append as
identities join mid-window; never remove.

| Identity | Joined |
| --- | --- |
| `product-manager` | `<YYYY-MM-DD>` |
| `release-engineer` | `<YYYY-MM-DD>` |
| `security-engineer` | `<YYYY-MM-DD>` |
| `technical-writer` | `<YYYY-MM-DD>` |
| `improvement-coach` | `<YYYY-MM-DD>` |
| `staff-engineer` | `<YYYY-MM-DD>` |

## Coverage signal (SC3)

The coverage signal is: **every in-scope authoring path above carries its
one-line pointer to § Citation integrity at window open**, recorded as `yes` in
the tables above. SC3 is verified at trial close by spot-checking **at least
one** enumerated path against direct evidence — a session trace or a published
body — rather than accepting self-attestation. Record the spot-checked path and
its evidence here at close:

- **Spot-checked path**: `<path>`
- **Evidence**: `<session trace or published-body URL>`

## Block-record surface

Block records land in `wiki/citation-blocks.md` (append-only, non-rotating).
The close audit reads it for SC2 (no out-of-scope attribution) and F2
(over-fit) per spec § Trial audit.
