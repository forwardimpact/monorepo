# Plan-A Part 2 — Hub Page Migration

Depends on Part 1 (builder must support partials).

## Step 1: Generate baseline output

Capture pre-migration build output for diff verification.

```sh
bunx fit-doc build --src websites/fit --out /tmp/fit-baseline
```

**Verify:** Build succeeds, `/tmp/fit-baseline/` populated.

## Step 2: Migrate hub pages

Replace hand-written `<a>` card blocks with `<!-- part:card:path -->` markers
in each page listed below. Keep `<div class="grid">` wrappers, `## Job
Heading` sections, and any non-card content unchanged.

**Modified:** 17 files under `websites/fit/`

| # | File | Cards | Notes |
|---|---|---|---|
| 1 | `docs/products/index.md` | 20 | Largest page; cards grouped under 4 job headings |
| 2 | `docs/libraries/index.md` | 22 | Cards grouped under 4 job headings |
| 3 | `docs/services/index.md` | 9 | Cards grouped under 3 job headings |
| 4 | `docs/index.md` | 6 | Top-level docs hub |
| 5 | `docs/getting-started/index.md` | 3 | |
| 6 | `docs/getting-started/engineers/index.md` | 4 | |
| 7 | `docs/getting-started/leadership/index.md` | 4 | |
| 8 | `docs/internals/index.md` | 4 | |
| 9 | `docs/internals/kata/index.md` | 6 | Cards link to same-page anchors (`#staff-engineer` etc.) — these are not page references; leave unchanged |
| 10 | `docs/reference/index.md` | 3 | |
| 11 | `gear/index.md` | 8 | |
| 12 | `guide/index.md` | 1 | |
| 13 | `landmark/index.md` | 2 | |
| 14 | `map/index.md` | 1 | |
| 15 | `outpost/index.md` | 1 | |
| 16 | `pathway/index.md` | 2 | |
| 17 | `summit/index.md` | 1 | |

**Not migrated:** `index.md` (landing page, per spec scope-out) and any cards
in `docs/internals/kata/index.md` that link to same-page anchors rather than
pages in the page tree.

### Card replacement pattern

Each `<a>` card block is replaced by a single partial marker. The path is
relative from the current page's directory to the target page's directory.

Before (`docs/products/index.md`):

```html
<a href="/docs/products/authoring-standards/">

### Authoring Agent-Aligned Engineering Standards

Turn 'good engineering' into an operational definition so evaluations start
from a shared foundation instead of private mental models.

</a>
```

After:

```html
<!-- part:card:authoring-standards -->
```

Before (`docs/index.md` linking to a child):

```html
<a href="/docs/products/">

### Product Guides

Guides for engineers and leaders — ...

</a>
```

After:

```html
<!-- part:card:products -->
```

Before (`gear/index.md` linking to a docs page):

```html
<a href="/docs/libraries/every-surface/">

### Give Agents and Humans the Same Interface

Capabilities that work on every surface — ...

</a>
```

After:

```html
<!-- part:card:../docs/libraries/every-surface -->
```

### Resolution rule

Compute the relative filesystem path from the current page's directory to the
target page's directory. This becomes the partial's path argument.

| Current page | Card href | Partial path |
|---|---|---|
| `docs/products/index.md` | `/docs/products/authoring-standards/` | `authoring-standards` |
| `docs/index.md` | `/docs/products/` | `products` |
| `docs/index.md` | `/docs/getting-started/` | `getting-started` |
| `gear/index.md` | `/docs/libraries/every-surface/` | `../docs/libraries/every-surface` |
| `pathway/index.md` | `/docs/products/career-paths/` | `../docs/products/career-paths` |

**Verify:** Each migrated page builds without error.

## Step 3: Verify identical output

Rebuild and diff against baseline.

```sh
bunx fit-doc build --src websites/fit --out /tmp/fit-after
diff -rq /tmp/fit-baseline /tmp/fit-after
```

Any differences in migrated hub pages indicate a mismatch between the partial
output and the original hand-written HTML. Fix the partial or the page until
the diff is clean (SC6).

Whitespace-only differences from prettier reformatting are expected and
acceptable.

## Step 4: Final verification

- `bun test libraries/libdoc/` exits zero (SC9)
- Full site build succeeds (SC8)
- Diff clean (SC6)
