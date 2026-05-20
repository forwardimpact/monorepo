# Monorepo command runner — run `just --list` to list recipes.

set dotenv-load
set quiet

ARGS := ""

# ── Core ──────────────────────────────────────────────────────────

# Pull latest agent memory from wiki
wiki-pull:
    bunx fit-wiki pull

# Commit and push agent memory to wiki
wiki-push:
    bunx fit-wiki push

# Audit agent memory against the wiki contract
wiki-audit:
    bunx fit-wiki audit

# Install dependencies and tooling
install: install-bun install-gh

# Install bun dependencies and generate code
install-bun:
    bun install --frozen-lockfile
    bunx --workspace=@forwardimpact/libcodegen fit-codegen --all

# Install the GitHub CLI (gh)
install-gh:
    bash scripts/install-gh.sh

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
    bunx --workspace=@forwardimpact/libcodegen fit-codegen --all

# Generate types only
codegen-type:
    bunx --workspace=@forwardimpact/libcodegen fit-codegen --type

# Generate clients only
codegen-client:
    bunx --workspace=@forwardimpact/libcodegen fit-codegen --client

# Generate service bases only
codegen-service:
    bunx --workspace=@forwardimpact/libcodegen fit-codegen --service

# Generate definitions only
codegen-definition:
    bunx --workspace=@forwardimpact/libcodegen fit-codegen --definition

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
    bunx --workspace=@forwardimpact/libresource fit-process-resources

# Process vector indices
process-vectors:
    bunx --workspace=@forwardimpact/libvector fit-process-vectors

# Process graph indices
process-graphs:
    bunx --workspace=@forwardimpact/libgraph fit-process-graphs

# ── Data ──────────────────────────────────────────────────────────

# Initialize data directories
data-init:
    mkdir -p generated data/cli data/eval data/graphs data/ingest/in data/ingest/pipeline data/ingest/done data/knowledge data/logs data/memories data/policies data/resources data/traces data/vectors data/teams-tenant-configs data/teams-resource-ids data/tenants data/activity data/pathway data/personal

# Remove generated data
data-clean:
    rm -rf generated data/cli data/eval data/logs data/graphs data/knowledge data/memories data/policies data/resources data/traces data/vectors data/teams-tenant-configs data/teams-resource-ids data/tenants

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

# ── CLI ───────────────────────────────────────────────────────────

# Agent conversations
cli-chat:
    bunx fit-guide {{ARGS}}

# Vector similarity search
cli-search:
    bunx --workspace=@forwardimpact/libvector fit-search {{ARGS}}

# Graph triple pattern queries
cli-query:
    bunx --workspace=@forwardimpact/libgraph fit-query {{ARGS}}

# List graph subjects by type
cli-subjects:
    bunx --workspace=@forwardimpact/libgraph fit-subjects {{ARGS}}

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
    #!/usr/bin/env bash
    set -euo pipefail
    ENTRY=""
    PKG_DIR=""
    for PKG in products/*/package.json services/*/package.json libraries/*/package.json; do
      REL=$(jq -r --arg n "{{NAME}}" '.bin[$n] // empty' "$PKG" 2>/dev/null)
      if [ -n "$REL" ]; then
        PKG_DIR="$(dirname "$PKG")"
        ENTRY="$PKG_DIR/$REL"
        break
      fi
    done
    if [ -z "$ENTRY" ] || [ ! -f "$ENTRY" ]; then
      echo "Error: no package.json declares bin[{{NAME}}] with an existing entry" >&2
      exit 1
    fi
    # Inject the package version as a build-time literal. `bun --compile` mounts
    # source onto a virtual /$bunfs filesystem, so readFileSync(__dirname/../package.json)
    # ENOENTs at runtime (issue #627). Each bin reads `process.env.<NAME>_VERSION`
    # with a readFileSync fallback for source execution; --define inlines the
    # literal at compile time so the fallback branch tree-shakes away.
    VERSION=$(jq -r .version "$PKG_DIR/package.json")
    ENV_PREFIX=$(echo "{{NAME}}" | tr '[:lower:]-' '[:upper:]_')
    mkdir -p dist/binaries
    bun build --compile \
      --target "{{TARGET}}" \
      --no-compile-autoload-dotenv \
      --no-compile-autoload-bunfig \
      --define "process.env.${ENV_PREFIX}_VERSION=\"${VERSION}\"" \
      --outfile "dist/binaries/{{NAME}}" \
      "$ENTRY"

# Build every Mach-O for the default target (codegen + product + gear)
build-binaries: codegen build-product-binaries build-gear-binaries

# Compile every fit-<product> CLI
build-product-binaries:
    just build-binary fit-outpost
    just build-binary fit-guide
    just build-binary fit-landmark
    just build-binary fit-map
    just build-binary fit-pathway
    just build-binary fit-summit

# Compile every gear CLI (services + library binaries; must stay in sync with
# Casks/fit-gear.rb in the forwardimpact/homebrew-tap repo)
build-gear-binaries:
    just build-binary fit-svcgraph
    just build-binary fit-svcmcp
    just build-binary fit-svcpathway
    just build-binary fit-svctrace
    just build-binary fit-svcvector
    just build-binary fit-codegen
    just build-binary fit-terrain
    just build-binary fit-eval
    just build-binary fit-doc
    just build-binary fit-rc
    just build-binary fit-xmr
    just build-binary fit-storage
    just build-binary fit-logger
    just build-binary fit-svscan
    just build-binary fit-trace
    just build-binary fit-visualize
    just build-binary fit-query
    just build-binary fit-subjects
    just build-binary fit-process-graphs
    just build-binary fit-process-resources
    just build-binary fit-process-vectors
    just build-binary fit-search
    just build-binary fit-unary
    just build-binary fit-tiktoken
    just build-binary fit-download-bundle

# Assemble dist/apps/fit-<NAME>.app for a product (outpost is special-cased)
build-app-product NAME:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ "{{NAME}}" = "outpost" ]; then
      (cd products/outpost && just build)
      bash libraries/libmacos/scripts/build-app.sh \
        --bundle-name "fit-outpost" \
        --primary-exec "products/outpost/dist/Outpost" \
        --extra-exec "products/outpost/dist/fit-outpost" \
        --info-plist "products/outpost/macos/Info.plist" \
        --entitlements "products/outpost/macos/Outpost.entitlements" \
        --resource "products/outpost/config" \
        --resource "products/outpost/templates" \
        --resource "design/fit/assets/icon-outpost.svg" \
        --version "$(jq -r .version products/outpost/package.json)" \
        --out-dir dist/apps
    else
      bash libraries/libmacos/scripts/build-app.sh \
        --bundle-name "fit-{{NAME}}" \
        --primary-exec "dist/binaries/fit-{{NAME}}" \
        --info-plist "products/{{NAME}}/macos/Info.plist" \
        --entitlements "products/{{NAME}}/macos/entitlements.plist" \
        --version "$(jq -r .version products/{{NAME}}/package.json)" \
        --out-dir dist/apps
    fi

# Assemble dist/apps/fit-gear.app — bundles all 25 service + library CLIs
build-app-gear:
    bash libraries/libmacos/scripts/build-app.sh \
      --bundle-name "fit-gear" \
      --primary-exec "dist/binaries/fit-svcgraph" \
      --extra-exec "dist/binaries/fit-svcmcp" \
      --extra-exec "dist/binaries/fit-svcpathway" \
      --extra-exec "dist/binaries/fit-svctrace" \
      --extra-exec "dist/binaries/fit-svcvector" \
      --extra-exec "dist/binaries/fit-codegen" \
      --extra-exec "dist/binaries/fit-terrain" \
      --extra-exec "dist/binaries/fit-eval" \
      --extra-exec "dist/binaries/fit-doc" \
      --extra-exec "dist/binaries/fit-rc" \
      --extra-exec "dist/binaries/fit-xmr" \
      --extra-exec "dist/binaries/fit-storage" \
      --extra-exec "dist/binaries/fit-logger" \
      --extra-exec "dist/binaries/fit-svscan" \
      --extra-exec "dist/binaries/fit-trace" \
      --extra-exec "dist/binaries/fit-visualize" \
      --extra-exec "dist/binaries/fit-query" \
      --extra-exec "dist/binaries/fit-subjects" \
      --extra-exec "dist/binaries/fit-process-graphs" \
      --extra-exec "dist/binaries/fit-process-resources" \
      --extra-exec "dist/binaries/fit-process-vectors" \
      --extra-exec "dist/binaries/fit-search" \
      --extra-exec "dist/binaries/fit-unary" \
      --extra-exec "dist/binaries/fit-tiktoken" \
      --extra-exec "dist/binaries/fit-download-bundle" \
      --info-plist "macos/gear/Info.plist" \
      --entitlements "macos/gear/entitlements.plist" \
      --version "$(jq -r .version package.json)" \
      --out-dir dist/apps

# Fan-out: build every Mach-O, then every bundle
build-apps: build-binaries
    just build-app-product outpost
    just build-app-product guide
    just build-app-product landmark
    just build-app-product map
    just build-app-product pathway
    just build-app-product summit
    just build-app-gear

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

# ── Environment ───────────────────────────────────────────────────

# Generate every secret in .env (idempotent — preserves all values across runs)
env-setup:
    bun scripts/env-setup.js

# Reset environment config from examples (wipes .env)
env-reset PROFILE="local": config-reset
    cp -f .env.{{PROFILE}}.example .env


# Reset config files from examples
# config/config.example.json was removed in spec 580 (commit a353a4ab); cp removed accordingly.
# Agent example loop is guarded and safe if config/agents/ is absent.
config-reset:
    #!/usr/bin/env bash
    for file in config/agents/*.agent.example.md; do [ -f "$file" ] && cp -f "$file" "${file%.example.md}.md" || true; done

# Download generated code bundle from S3
download-bundle:
    bunx --workspace=@forwardimpact/libutil fit-download-bundle

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
    cd products/map && supabase start --workdir .

# Stop local Supabase instance
supabase-down:
    cd products/map && supabase stop --workdir .

# Start Supabase via fit-rc (oneshot)
supabase-start:
    bunx fit-rc start supabase

# Stop Supabase via fit-rc (oneshot)
supabase-stop:
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

# Start TEI embedding service (foreground, Ctrl-C to stop)
tei-start:
    text-embeddings-router --model-id BAAI/bge-small-en-v1.5 --port 8090 --json-output

# ── Synthea ───────────────────────────────────────────────────────

synthea_version := "3.3.0"
synthea_jar := "vendor/synthea/synthea-with-dependencies.jar"

# Download the Synthea JAR into vendor/synthea/ if not already present
synthea-install:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -f "{{synthea_jar}}" ]; then
        echo "synthea: already installed at {{synthea_jar}}"
        exit 0
    fi
    mkdir -p vendor/synthea
    echo "Downloading Synthea v{{synthea_version}}..."
    curl -fSL -o "{{synthea_jar}}" \
        "https://github.com/synthetichealth/synthea/releases/download/v{{synthea_version}}/synthea-with-dependencies.jar"
    echo "synthea: installed at {{synthea_jar}}"

# Report Synthea install status and Java availability
synthea-status:
    #!/usr/bin/env bash
    if [ ! -f "{{synthea_jar}}" ]; then
        echo "synthea: not installed (run 'just synthea-install')"
        exit 1
    fi
    if ! command -v java &>/dev/null; then
        echo "synthea: Java not found (install Java 11+)"
        exit 1
    fi
    java_version=$(java -version 2>&1 | head -1)
    echo "synthea: ok (${java_version})"
