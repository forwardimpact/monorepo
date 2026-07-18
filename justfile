# Monorepo command runner — run `just --list` to list recipes.

set dotenv-load
set quiet

ARGS := ""

# ── Core ──────────────────────────────────────────────────────────

# Pull latest agent memory from wiki
wiki-pull:
    bunx fit-wiki pull

# Commit and push agent memory to wiki. Run as the session-end Stop hook: a
# push failure (non-zero CLI exit) is translated to exit 2 so Claude Code
# blocks the stop and feeds the failure reason back for a remediation turn
# (D4 hook fidelity). The CLI status is read directly — a single command, no
# pipeline that could mask it with another process's status.
wiki-push:
    bunx fit-wiki push || exit 2

# Audit agent memory against the wiki contract
wiki-audit:
    bunx fit-wiki audit

# Install dependencies and tooling
install: install-bun install-deps

# Install bun dependencies and generate code
install-bun:
    bun install --frozen-lockfile
    bunx --workspace=@forwardimpact/libcodegen fit-codegen generate --all

# Install CLI dependencies (apm, just, gh, rg, gitleaks)
install-deps:
    bash .github/actions/bootstrap/fit-install.sh

# Bootstrap from scratch
quickstart: env-reset env-setup synthetic data-init codegen process-fast _quickstart-seed
    echo ""
    echo "=== Quickstart complete ==="
    printf "  Knowledge files: %s\n" "$(find data/knowledge -name '*.html' 2>/dev/null | wc -l | tr -d ' ')"
    printf "  Resources:       %s\n" "$(find data/resources -type f 2>/dev/null | wc -l | tr -d ' ')"
    printf "  Graph indices:   %s\n" "$(find data/graphs -type f 2>/dev/null | wc -l | tr -d ' ')"
    echo ""
    echo "Next: just rc-start && just cli-chat"

# Conditionally seed if Docker is running
_quickstart-seed:
    #!/usr/bin/env bash
    if timeout 3 docker info --format '{{"{{"}}.ID{{"}}"}}' >/dev/null 2>&1; then
      echo "Docker detected — seeding activity database..."
      just supabase-up && just supabase-migrate && just seed
    else
      echo "Docker not running — skipping activity seed (run 'just seed-full' later)"
    fi

# ── Synthetic ─────────────────────────────────────────────────────

# Generate synthetic data (cached prose)
synthetic:
    bunx fit-terrain build
    bunx fit-map generate-index

# Generate synthetic data with LLM and update prose cache
synthetic-update:
    bunx fit-terrain generate
    bunx fit-map generate-index

# Generate all (types, services, clients)
codegen:
    bunx --workspace=@forwardimpact/libcodegen fit-codegen generate --all

# Generate types only
codegen-type:
    bunx --workspace=@forwardimpact/libcodegen fit-codegen generate --type

# Generate clients only
codegen-client:
    bunx --workspace=@forwardimpact/libcodegen fit-codegen generate --client

# Generate service bases only
codegen-service:
    bunx --workspace=@forwardimpact/libcodegen fit-codegen generate --service

# Generate definitions only
codegen-definition:
    bunx --workspace=@forwardimpact/libcodegen fit-codegen generate --definition

# ── Process ───────────────────────────────────────────────────────

# Process all resources
process: export-standard process-resources process-graphs process-vectors

# Process without vectors
process-fast: export-standard process-resources process-graphs

# Export standard entities to HTML/microdata
export-standard:
    bunx --workspace=@forwardimpact/map fit-map export

# Process knowledge resources
process-resources:
    bunx --workspace=@forwardimpact/librag fit-process resources

# Process vector indices
process-vectors:
    bunx --workspace=@forwardimpact/librag fit-process vectors

# Process graph indices
process-graphs:
    bunx --workspace=@forwardimpact/librag fit-process graphs

# ── Data ──────────────────────────────────────────────────────────

# Initialize data directories
data-init:
    mkdir -p generated data/cli data/eval data/graphs data/ingest/in data/ingest/pipeline data/ingest/done data/knowledge data/logs data/memories data/policies data/resources data/spans data/vectors data/teams-tenant-configs data/teams-resource-ids data/tenants data/activity data/pathway data/personal

# Remove generated data
data-clean:
    rm -rf generated data/cli data/eval data/logs data/graphs data/knowledge data/memories data/policies data/resources data/spans data/vectors data/teams-tenant-configs data/teams-resource-ids data/tenants

# Clean, init, and regenerate code
data-reset: data-clean data-init codegen

# ── Services ──────────────────────────────────────────────────────

# Start services via rc
rc-start:
    bunx fit-rc start

# Stop services via rc
rc-stop:
    bunx fit-rc stop

# Restart services via rc
rc-restart:
    bunx fit-rc restart

# Show service status
rc-status:
    bunx fit-rc status

# ── MS Teams Bridge ──────────────────────────────────────────────

# Start the cloudflared tunnel for the MS Teams bridge
msbridge-tunnel:
    bunx fit-rc start msbridge-tunnel

# Package the Teams App for sideloading (reads tunnel domain from .env)
msbridge-package *ARGS:
    bun scripts/msteams-package.js {{ARGS}}

# Start the MS Teams bridge service
msbridge:
    bunx fit-rc start msbridge

# ── CLI ───────────────────────────────────────────────────────────

# Agent conversations
cli-chat:
    bunx fit-guide {{ARGS}}

# Vector similarity search
cli-search:
    bunx --workspace=@forwardimpact/librag fit-rag search {{ARGS}}

# Graph triple pattern queries
cli-query:
    bunx --workspace=@forwardimpact/librag fit-rag query {{ARGS}}

# List graph subjects by type
cli-subjects:
    bunx --workspace=@forwardimpact/librag fit-rag subjects {{ARGS}}

# Trace visualization
cli-visualize:
    bunx --workspace=@forwardimpact/libtelemetry fit-visualize {{ARGS}}

# Token counting
cli-tiktoken:
    bunx --workspace=@forwardimpact/libutil fit-tiktoken {{ARGS}}

# Unary gRPC calls
cli-unary:
    bunx --workspace=@forwardimpact/librpc fit-unary {{ARGS}}

# XmR control chart analysis
cli-xmr:
    bunx --workspace=@forwardimpact/libxmr fit-xmr {{ARGS}}

# ── Bundles ───────────────────────────────────────────────────────

# Compile NAME (a bin entry like fit-codegen) into dist/binaries/NAME
build-binary NAME TARGET="bun-darwin-arm64":
    bash build/build-binary.sh "{{NAME}}" "{{TARGET}}"

# Build every distributable binary for TARGET, driven by build/cli-manifest.json
build-all TARGET="bun-darwin-arm64": codegen
    bash build/build-all.sh "{{TARGET}}"

# Assemble dist/apps/fit-<BUNDLE>.app — one manifest-driven path for every
# bundle (gear and products alike; outpost's launcher is manifest data)
build-app BUNDLE:
    bash build/build-app.sh "{{BUNDLE}}"

# ── Quality ───────────────────────────────────────────────────────

# Enforce instruction layer limits (KATA.md § Instruction length)
check-instructions:
    bunx coaligned instructions

# Run security audit (vulnerability + secret scanning)
audit: audit-vulnerabilities audit-secrets

# Check dependencies for known vulnerabilities
audit-vulnerabilities:
    #!/usr/bin/env bash
    set -euo pipefail
    # Replace bun workspace protocol with plain wildcard for npm compatibility.
    # Use perl for sed -i portability across GNU (Linux) and BSD (macOS) sed.
    find . -name package.json -not -path '*/node_modules/*' -exec \
      perl -pi -e 's/"workspace:\*"/"*"/g' {} +
    npm install --package-lock-only --ignore-scripts --force 2>/dev/null
    npm audit --audit-level=high --omit=dev --workspaces
    rm -f package-lock.json
    git checkout -- '*/package.json' package.json 2>/dev/null || true

# Scan repository for leaked secrets
audit-secrets:
    #!/usr/bin/env bash
    if command -v gitleaks >/dev/null 2>&1; then
        gitleaks detect --source . --verbose
    else
        echo "Error: gitleaks not installed — install it (brew install gitleaks) or skip with: just audit-vulnerabilities" >&2
        exit 1
    fi

# ── Sibling actions ───────────────────────────────────────────────

# Replay an external sibling PR into its monorepo prefix, preserving authorship.
# Sibling main is a projection of the monorepo, so external PRs are reviewed on
# the sibling but land here: the result is a normal monorepo PR under the usual
# gates, and the next outbound split republishes it. format-patch --binary plus
# am -3 cover binary hunks and merge fallback; --directory rewrites each patched
# path into the prefix; am preserves the original author. For a fork-based PR,
# first fetch the fork's <pr-head> into the clone so origin/main..<pr-head>
# resolves. On a conflict, run `git am --abort` and re-apply by hand.
# Usage: just action-pullback <sibling-clone> <pr-head> <prefix>
action-pullback clone head prefix:
    git -C {{clone}} format-patch origin/main..{{head}} --stdout --binary \
      | git am -3 --directory={{prefix}}

# ── Environment ───────────────────────────────────────────────────

# Generate every secret in .env (idempotent — preserves all values across runs)
env-setup:
    bun scripts/env-setup.js

# Reset environment config from examples (wipes .env)
env-reset PROFILE="local":
    cp -f .env.{{PROFILE}}.example .env

# Download generated code bundle from S3
download-bundle:
    bunx --workspace=@forwardimpact/libcodegen fit-codegen download

# ── Docker ────────────────────────────────────────────────────────

# Build Docker images
docker-build:
    . ./.env.build && docker --log-level debug compose build --no-cache

# Start Docker Compose (core services only)
docker-up:
    docker compose up

# Start Docker Compose with MinIO storage
docker-up-minio:
    docker compose --profile minio up

# Start Docker Compose with Supabase
docker-up-supabase:
    docker compose --profile supabase up

# Stop Docker Compose
docker-down:
    docker compose --profile minio --profile supabase down

# ── Storage ───────────────────────────────────────────────────────

# Full setup (start, wait, init, upload)
storage-setup: storage-start storage-wait storage-init storage-upload

# Start storage backend containers
storage-start PROFILE="minio":
    docker compose --profile {{PROFILE}} up -d storage-{{PROFILE}}

# Stop storage backend containers
storage-stop:
    docker compose --profile minio --profile supabase down

# Wait for storage to be ready
storage-wait:
    bunx --workspace=@forwardimpact/libstorage fit-storage wait

# Create bucket in storage backend
storage-init:
    bunx --workspace=@forwardimpact/libstorage fit-storage create-bucket

# Upload data to storage backend
storage-upload:
    bunx --workspace=@forwardimpact/libstorage fit-storage upload

# Download data from storage backend
storage-download:
    bunx --workspace=@forwardimpact/libstorage fit-storage download

# List storage contents
storage-list:
    bunx --workspace=@forwardimpact/libstorage fit-storage list

# ── Activity Seed ─────────────────────────────────────────────────

# Seed the activity database from synthetic data (requires Supabase running)
seed:
    bunx fit-map activity seed

# Full synthetic-to-database workflow
seed-full: supabase-up supabase-migrate synthetic seed

# ── Supabase ──────────────────────────────────────────────────────

# Install Supabase CLI (brew)
supabase-install:
    #!/usr/bin/env bash
    which supabase >/dev/null 2>&1 || brew install supabase/tap/supabase

# Start local Supabase instance
supabase-up:
    bunx fit-rc start supabase

# Stop local Supabase instance
supabase-down:
    bunx fit-rc stop supabase

# Run Map database migrations
supabase-migrate:
    cd products/map && supabase db reset --workdir .

# Supabase health check
supabase-status:
    #!/usr/bin/env bash
    curl -sf http://127.0.0.1:54321/rest/v1/ >/dev/null && echo "supabase: ok" || echo "supabase: not running"

# Start Supabase and run migrations
supabase-setup: supabase-up

# ── TEI ───────────────────────────────────────────────────────────

# Install TEI binary via cargo
tei-install:
    cargo install --git https://github.com/huggingface/text-embeddings-inference --features candle text-embeddings-router

# Start TEI embedding service via rc
tei-start:
    bunx fit-rc start embedding

# ── Synthetic data dependencies ───────────────────────────────────

# Install synthetic-data generation deps (Synthea JAR, SDV, faker) on demand
synthetic-deps:
    bash scripts/synthetic-deps.sh

# Report synthetic-data dependency status without installing
synthetic-deps-check:
    bash scripts/synthetic-deps.sh --check
