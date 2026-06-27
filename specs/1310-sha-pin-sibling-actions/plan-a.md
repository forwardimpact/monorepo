# Plan 1310-a — SHA-pin sibling `forwardimpact/*` composite actions

[spec.md](spec.md) · [design-a.md](design-a.md)

## Approach

Three single-purpose edit batches, executed in any order on one branch and
landed in one PR: rewrite every workflow `uses:` line that targets a sibling
action to the immutable `(hash, # v1)` shape; replace the
`.github/CLAUDE.md` § Editing a published action recipe with the Dependabot
flow plus a sibling-internal exclusion clause; and amend `CONTRIBUTING.md`
§ Security to name siblings explicitly. The reference-shape change is
mechanical (one search-and-replace per sibling); the doc edits are textual.
Verification is the spec's success-criterion regex, run before push.

## Reference table

The five sibling SHAs were resolved at plan time from `tags/v1` on each
sibling repo. **The implementer MUST re-resolve at edit time** (see Step 1
snippet) — `v1` is still mutable on the sibling side until this PR lands,
so any sibling release between plan time and edit time invalidates the
recorded SHA. The plan-time values are advisory reference; the SHA
written into a workflow MUST come from a fresh `gh api` call in the same
session.

| Sibling | Plan-time `v1` SHA (re-verify) | Refs (plan-time) | Files (plan-time) |
|---|---|---:|---:|
| `forwardimpact/fit-bootstrap` | `22e7a8a053c22cf56d6f4efb95fcf0b3d42267c8` | 28 | 19 |
| `forwardimpact/kata-agent` | `53b69e1e20e109d03e3ebba55b870da909984f61` | 3 | 3 |
| `forwardimpact/fit-eval` | `a9dc8b8993d4ed6287225b0fc183c4fc70e758a4` | 3 | 3 |
| `forwardimpact/fit-wiki` | `a6b0b9689737e031a00f233580e6016eb94d5ebf` | 3 | 3 |
| `forwardimpact/fit-benchmark` | `d352f9a7b0eb09fc5e69599017ea50bf1a7709cd` | 2 | 2 |
| **Total (edit-time observed)** | — | **39** | **22 unique** |

Plan-time grep returns 39 refs across 22 unique files; spec text records
38/21 with a "two-ref drift since merge" note that covers this gap. The
table totals carry the **edit-time observed** marker on purpose — the
authoritative number is whatever `origin/main` reports at the implementer's
session, baselined in Step 1a and re-verified in Step 1 close-out. A
running count differs from a contractual one; the plan treats only the
re-baselined value as load-bearing.

The replacement line shape across every site is the existing repo
convention seen on `actions/checkout` and `actions/create-github-app-token`:

```text
- uses: forwardimpact/<sibling>@<40-char-sha> # v1
```

Leading whitespace and `-` prefix vary by site (some are list-item steps
with `- uses:`, some are mapping-value `uses:`); preserve the prior line
exactly except for the `@<ref>` token and the trailing comment.

## Steps

### Step 1 — SHA-pin sibling refs in `.github/workflows/*.{yml,yaml}`

**Files modified:** every `.github/workflows/*.yml` and
`.github/workflows/*.yaml` containing a `uses: forwardimpact/<sibling>@v1`
line.

**Files created / deleted:** none.

**1a. Capture the edit-time baseline.** Record the live count and SHAs
before changing any file:

```sh
# Live count baseline — store the number returned by this command.
PRE_COUNT=$(grep -rE 'uses:\s*forwardimpact/(fit-bootstrap|kata-agent|fit-eval|fit-wiki|fit-benchmark)@v1' .github/workflows/ | wc -l)
echo "baseline: $PRE_COUNT references"

# Edit-time SHA refresh — dereferences annotated tags to commit SHA, so
# the snippet works whether the sibling uses a lightweight or annotated
# tag for v1. Empty output for a sibling means v1 was deleted upstream
# (recover by re-tagging on the sibling before continuing; do not
# substitute an empty SHA into a workflow).
for repo in fit-bootstrap kata-agent fit-eval fit-wiki fit-benchmark; do
  sha=$(gh api repos/forwardimpact/$repo/commits/v1 --jq '.sha' 2>/dev/null)
  if [ -z "$sha" ]; then
    echo "ERROR: $repo has no v1 tag — STOP and re-tag upstream" >&2
    exit 1
  fi
  echo "$repo: $sha"
done
```

**1b. Replace each sibling's references.** For each sibling, rewrite every
`uses: forwardimpact/<sibling>@v1` line to
`uses: forwardimpact/<sibling>@<sha> # v1`, where `<sha>` is the
fresh-resolved value from step 1a. Preserve the leading whitespace and
optional `-` prefix exactly.

**Verification (Step 1 close-out):**

```sh
# Positive: every remaining sibling ref is an exact 40-char lowercase hex
# SHA followed by " # v1" (optional trailing whitespace tolerated).
POST_PINNED=$(grep -rE 'uses:\s*forwardimpact/(fit-bootstrap|kata-agent|fit-eval|fit-wiki|fit-benchmark)@[0-9a-f]{40} # v1\s*$' .github/workflows/ | wc -l)
echo "pinned: $POST_PINNED"
# expected: equal to $PRE_COUNT captured in 1a.

# Negative: no remaining mutable or malformed sibling ref of any shape.
# (Portable POSIX form — `grep -E` does not support PCRE lookahead, so
# the structural check is the inversion below.)
grep -rnE 'uses:\s*forwardimpact/(fit-bootstrap|kata-agent|fit-eval|fit-wiki|fit-benchmark)@' .github/workflows/ \
  | grep -vE '@[0-9a-f]{40} # v1\s*$'
# expected: zero matches.
```

The two-pronged check (count parity + structural negative) discharges
spec success criterion 1 even when an oddly-shaped ref (e.g. a 4-hex-char
substring) would slip past a permissive first character class.

### Step 2 — Rewrite `.github/CLAUDE.md` § Editing a published action

**Files modified:** `.github/CLAUDE.md`.

**Files created / deleted:** none.

**Anchor by heading, not by line number.** Replace the subsection that
begins at the heading line `### Editing a published action` and ends at
the next H3 heading (currently ``### `IS_SANDBOX` for headless agents``),
exclusive. Do not touch the surrounding `## Third-party actions` intro
paragraphs or the sibling table — their `@v1` cells are published-action
identifiers and remain valid narrative per spec § Excluded.

The replacement subsection must contain:

1. **No `git tag -f`, no `git push … --force`.** Removing these tokens
   discharges spec success criterion 5.
2. **A non-tag-mutating edit flow.** Steps the operator follows: clone
   the sibling, edit, commit, push a new immutable patch tag
   (`git tag v1.0.<N>` where `<N>` is the next unused patch number —
   discover via `gh api repos/forwardimpact/<sibling>/tags --jq '.[].name'`,
   or start at `v1.0.0` if no patch tag exists yet — then
   `git push origin main && git push origin v1.0.<N>` —
   append-only, never `-f`), wait for the next weekly Dependabot
   `github-actions` sweep to open a SHA-bump PR against the monorepo,
   review and merge it through the standard branch-protected path.
   (Dependabot's schedule is `weekly` per `.github/dependabot.yml`; a
   maintainer wanting earlier pickup can trigger a sweep from the
   monorepo's *Insights → Dependency graph → Dependabot* page rather
   than waiting for the next cron run.)
3. **A sibling-internal exclusion clause** (spec criterion 6) —
   one paragraph stating, in substance: *"This repo's pinning policy
   governs workflow `uses:` references to sibling actions.
   Sibling-internal references (a sibling's own references inside its
   `action.yml`, including a sibling's calls to another sibling such as
   `kata-agent`'s call to `forwardimpact/fit-bootstrap@v1`) are governed
   by the sibling repos and remain tag-pinned there. The residual
   exposure is recorded in spec 1310."*
4. **A note on `v1` continuance.** Whether siblings continue to advance
   the human-readable `v1` major-tag marker is a sibling-side editorial
   choice; the monorepo's pin is unaffected because the monorepo no
   longer consumes `v1` at runtime.

**Verification:**

```sh
# Section-scoped check — the full `## Third-party actions` H2 section
# (spec criterion 5 anchors to "§ Third-party actions"). Range starts at
# the H2 and ends at the next `^## ` (next H2), exclusive. `^## ` does
# not match H3 lines (`### `) because the third character is `#`, not a
# space.
awk '/^## Third-party actions/{flag=1; print; next} /^## /{flag=0} flag' .github/CLAUDE.md \
  | grep -E 'git tag -f|git push .*--force'
# expected: zero matches.

grep -c 'sibling-internal' .github/CLAUDE.md
# expected: ≥1 (the new exclusion clause).
```

### Step 3 — Amend `CONTRIBUTING.md` § Security

**Files modified:** `CONTRIBUTING.md`.

**Files created / deleted:** none.

The existing bullet under `## Security` already says "All third-party
actions are pinned to SHA hashes." Replace that bullet (anchored by the
literal `**GitHub Actions**` text — not by line number) with:

> **GitHub Actions** — All third-party actions, including the sibling
> `forwardimpact/*` composite actions, are pinned to SHA hashes on
> workflow `uses:` lines. Use Dependabot for updates. Never change a pin
> to a tag. (`.github/CLAUDE.md` § Editing a published action documents
> the sibling edit flow and records the sibling-internal-reference
> exclusion.)

**Verification:**

```sh
# Anchor to the GitHub Actions bullet specifically — `-A` lets the grep
# pick up the wrapped continuation lines that hold the new sibling
# mention.
grep -A6 '^- \*\*GitHub Actions\*\*' CONTRIBUTING.md | grep -c 'forwardimpact'
# expected: ≥1 (the new sibling mention sits in the bullet, not elsewhere).
```

### Step 4 — Final sweep

Re-run Step 1 close-out (count parity + structural negative). Confirm
the diff guard in spec criterion 7:

```sh
git diff --name-only origin/main...HEAD \
  | grep -vE '^(\.github/workflows/.*\.(yml|yaml)|\.github/CLAUDE\.md|CONTRIBUTING\.md|specs/1310-sha-pin-sibling-actions/.*)$'
# expected: zero lines (every changed path matches an in-scope glob).
```

Open the PR. The branch-protection required checks (the gate criterion 3
anchors against) ride to green on a clean diff; no local "lint workflows"
recipe exists, so workflow YAML correctness is verified through CI.

## Libraries used

Libraries used: none.

## Risks

- **SHA drift between plan time and edit time.** A sibling release
  between now and the implementation PR opens a window where any
  plan-time SHA is stale. Step 1a mandates a fresh `gh api …/commits/v1`
  call; plan-time SHAs in the reference table are advisory only.
- **Hidden `uses:` shapes.** A few sibling references use the
  mapping-value `uses:` form (no leading `- `), e.g. `eval-guide.yml:156`.
  The Step 1 verification regex matches both shapes; a substring replace
  targeted at `- uses:` alone would miss them.
- **`# v1` literal marker locks the comment shape.** Spec criterion 2
  fixes the trailing comment to literal `# v1`, not `# v1.0.3` or `# v1.0.<N>`.
  Future Dependabot bumps update the hash but preserve the `# v1` marker
  until a sibling cuts `v2` (which reopens the spec).
- **`*.yaml` files inside `.github/workflows/`.** Spec criterion 7
  enumerates `.github/workflows/*.yml`. The live tree contains four
  `*.yaml` files (`website-coaligned.yaml`, `website-fit.yaml`,
  `website-kata.yaml`, `website-monorepo.yaml`) — all of them in scope
  by intent (they each carry a `fit-bootstrap@v1` ref). The plan treats
  spec criterion 7's `*.yml` as a glob over the workflows directory and
  edits `.yaml` siblings under the same in-scope umbrella; the PR
  description should call this out so the reviewer reads criterion 7
  the same way.

## Execution

One PR, branch `feat/1310-sha-pin-sibling-actions`. All three steps land
together because spec success criterion 7 caps the diff to a single
file-set; splitting risks intermediate states where the audit signal is
red on `main`. Diff touches only `.github/workflows/*.{yml,yaml}`,
`.github/CLAUDE.md`, `CONTRIBUTING.md`, and
`specs/1310-sha-pin-sibling-actions/`.

Steps 1–3 are independent and may be executed in any order. Step 4
(final sweep) runs last. Route to `kata-implement` on a fresh activation
— no domain-specific knowledge beyond the regex sweeps. Expected diff
size: ~80 lines (≈39 single-token workflow edits + a 30-line
`.github/CLAUDE.md` rewrite + a 3-line `CONTRIBUTING.md` bullet revision).

— Staff Engineer 🛠️
