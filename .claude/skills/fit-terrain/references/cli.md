# CLI Reference

`fit-terrain` is verb-driven. Each verb names one outcome.

```sh
npx fit-terrain check                      # Verify prose cache is complete
npx fit-terrain validate                   # Cross-content checks (no writes)
npx fit-terrain build                      # Render and write all content
npx fit-terrain build --only=pathway       # Render only one content type
npx fit-terrain build --load               # Also load raw docs to Supabase
npx fit-terrain generate                   # Fill cache via LLM, then build
npx fit-terrain --story=path build         # Custom story DSL file (global flag)
npx fit-terrain --cache=path check         # Custom prose cache file (global flag)
```

Run `npx fit-terrain <verb> --help` for verb-scoped options.

## Verbs

| Verb       | Outcome                                         | Exit code     |
| ---------- | ----------------------------------------------- | ------------- |
| `check`    | Cache hit-rate report; fails on miss            | 0 hit, 1 miss |
| `validate` | Entity + cross-content checks, no writes        | 0 / 1         |
| `build`    | Render and write to `data/`                     | 0 / 1         |
| `generate` | LLM prose generation, write cache, then `build` | 0 / 1         |
| `inspect`  | Dump intermediate stage output (Phase D)        | 2 (deferred)  |

### Content Types

`build --only=<type>` renders a single content type:

| Type       | Output Directory | Contents                                                            |
| ---------- | ---------------- | ------------------------------------------------------------------- |
| `html`     | `data/knowledge` | Articles, guides, FAQs, courses; plus the seven clinical pages when the DSL declares a `clinical {}` block |
| `pathway`  | `data/pathway`   | YAML standard files                                                 |
| `raw`      | `data/activity`  | Roster, GitHub events, evidence                                     |
| `markdown` | `data/personal`  | Briefings, notes, KB content                                        |

Dataset outputs (declared via `output` blocks in the DSL) are written
regardless of `--only` to the paths each `output` block names.

### Global Flags

| Flag             | Description                       |
| ---------------- | --------------------------------- |
| `--story=<path>` | Custom story DSL file             |
| `--cache=<path>` | Custom prose cache file           |
| `--help, -h`     | Show help (top-level or per-verb) |
| `--version`      | Show version                      |
| `--json`         | Emit help as JSON                 |
