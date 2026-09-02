# BioNova Polaris Plan

Build the `bionova-apps` repository to [spec.md](spec.md) and
[design-a.md](design-a.md).

## Approach

Vendor the DSL, render the seed locally, and build by capability cluster.
Each part below is one PR-sized rebuild boundary. Verify each part end to
end against a local `docker compose` boot before the next part starts.
The seed build is credential-free: `fit-terrain build` renders from the
committed prose cache with zero LLM calls, and a rebuild reproduces the
seed byte for byte.

## Repository boundary

> **`bionova-apps` is a separate GitHub repository.** It owns its own
> workspaces and CI. It consumes Forward Impact code only as published
> npm packages. Never vendor it, submodule it, or check it into the
> monorepo.

The local working directory is a sibling of the monorepo (for example
`~/work/bionova-apps/`). All file paths in the parts are relative to the
`bionova-apps/` repo root. The implementer never writes `bionova-apps`
files inside the monorepo.
[references/CLAUDE.md § Keep a reference current](../CLAUDE.md#keep-a-reference-current)
owns the maintenance loop between this record and the repository.

## Part index

The parts are strictly sequential: 01 → 02 → 03 → 04 → 05.

| Part | Scope |
| --- | --- |
| [01](plan-a-01.md) | Repo bootstrap through the skill gates, plus the PG On Rails stack |
| [02](plan-a-02.md) | Hand-written schema, vendored DSL, and the deterministic seed pipeline |
| [03](plan-a-03.md) | Edge functions and the shared handler layer |
| [04](plan-a-04.md) | CLI and web surfaces, with the visual token layer |
| [05](plan-a-05.md) | Deployment, the success-criteria smoke, and interviews |

Libraries used: the six `@forwardimpact` libraries (`libcli`, `libui`,
`libformat`, `libtemplate`, `librepl`, `libutil`) plus build-time
`fit-terrain`.

## Risks

The table below is the one home for the hard-won constraints the
first-week fix commits on `forwardimpact/bionova-apps` proved. Parts cite
rows by id and never restate them.

| Id | Constraints | Symptom when violated |
| --- | --- | --- |
| C1 | Images and ports: the pgbouncer image tags carry a `-pN` patch suffix and default to port 5432, so set `LISTEN_PORT=6432`; TEI listens on container port 80 (not 8080) and needs the amd64 platform; the PostgREST image is distroless, so its probe needs a copied-in static busybox. Evidence: `eb29652` | Services stay unhealthy or unreachable on the compose network |
| C2 | Connection routing: only PostgREST connects through the transaction pooler; GoTrue, Storage, and Realtime connect directly to Postgres; pooled PostgREST runs with prepared statements and the reload channel disabled. Evidence: `86ca2df` | `FATAL 08P01` on startup params, `42P05` prepared-statement collisions, stale schema cache |
| C3 | Probes: probe only with tools the image ships; target `127.0.0.1`, never `localhost` (BusyBox resolves `localhost` to IPv6 while services bind IPv4). Evidence: `eb29652` | Containers stay `unhealthy` forever with a working service inside |
| C4 | Auth coherence: the anon and service-role keys are JWTs signed with `JWT_SECRET`; re-sign both whenever the secret changes and keep the Kong copies in sync. Evidence: `741e891` | Anonymous reads still work, but every verified-JWT path returns 401 `JWSInvalidSignature` |
| C5 | Render safety: always render with `--output-root` into a disposable directory (the write sink deletes output path prefixes, which would delete `products/polaris/`); assert the six prose tables after each render (the renderer drops unknown entities silently) | Deleted application code, or blank prose surfaces that fail late |
| C6 | Seed lifecycle: `db push --include-all`; reload the PostgREST schema cache after each push; stable migration versions carry mutable content, so a re-seed needs the destructive reset path. Evidence: `4fa35f3` | "Out of order" push refusals, 404s on new tables, a re-render that never reaches an already-seeded database |
| C7 | Bundled runtime: set `outputFileTracingRoot` for the standalone build; set `POLARIS_ABOUT_PATH` for the bundled YAML read; use plain `bun install`. Evidence: `612f950` | A flat `server.js` the Dockerfile cannot copy, an unreadable about file, a rejected install flag |
| C8 | Toolchain minimums: spec § Version policy states them; this row points there and does not restate them | A build against a toolchain that predates a required capability |
| C9 | TEI operations: pass `--auto-truncate`; pre-fetch the model on the host where a TLS-inspecting proxy breaks the in-container download. Evidence: `d7d908d` | 413 rejections on long condition texts; a stack that stalls on model download |

Two risks sit outside the parts:

- **npm version drift beyond the minimums.** A rebuild resolves current
  versions. A minor or major bump on a consumed library needs a
  breaking-change scan over the symbols the surfaces import, recorded in
  the rebuild PR body.
- **Railway account access.** Without it, the implementer documents the
  gap, defers the deploy verification, and ships local-only smoke.

## Execution

One part is one PR in `bionova-apps`, in part order. Each part carries
its own verification list. Part 05 closes with the full success-criteria
smoke.

— Staff Engineer 🛠️
