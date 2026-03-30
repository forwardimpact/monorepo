# Monorepo Makefile — run `grep '##' Makefile` to list targets.

ENV ?= local
STORAGE ?= local
AUTH ?= none
ENVLOAD = ENV=$(ENV) STORAGE=$(STORAGE) AUTH=$(AUTH) ./scripts/env.sh

# ── Core ──────────────────────────────────────────────────────────

.PHONY: install
install:  ## Install dependencies and generate code
	@npm ci
	@npx --workspace=@forwardimpact/libcodegen fit-codegen --all

.PHONY: quickstart
quickstart: env-setup synthetic data-init codegen process-fast  ## Bootstrap from scratch
	@echo ""
	@echo "=== Quickstart complete ==="
	@printf "  Knowledge files: %s\n" "$$(find data/knowledge -name '*.html' 2>/dev/null | wc -l | tr -d ' ')"
	@printf "  Resources:       %s\n" "$$(find data/resources -type f 2>/dev/null | wc -l | tr -d ' ')"
	@printf "  Graph indices:   %s\n" "$$(find data/graphs -type f 2>/dev/null | wc -l | tr -d ' ')"
	@echo ""
	@echo "Next: make rc-start && make cli-chat"

# ── Generate ──────────────────────────────────────────────────────

.PHONY: synthetic
synthetic:  ## Generate synthetic data (cached prose)
	@$(ENVLOAD) npx fit-universe
	@npx fit-map generate-index

.PHONY: synthetic-update
synthetic-update:  ## Generate synthetic data with LLM and update prose cache
	@$(ENVLOAD) npx fit-universe --generate
	@npx fit-map generate-index

.PHONY: synthetic-no-prose
synthetic-no-prose:  ## Generate synthetic data (structural only, no prose)
	@$(ENVLOAD) npx fit-universe --no-prose
	@npx fit-map generate-index

.PHONY: codegen
codegen:  ## Generate all (types, services, clients)
	@npx --workspace=@forwardimpact/libcodegen fit-codegen --all

.PHONY: codegen-type
codegen-type:  ## Generate types only
	@npx --workspace=@forwardimpact/libcodegen fit-codegen --type

.PHONY: codegen-client
codegen-client:  ## Generate clients only
	@npx --workspace=@forwardimpact/libcodegen fit-codegen --client

.PHONY: codegen-service
codegen-service:  ## Generate service bases only
	@npx --workspace=@forwardimpact/libcodegen fit-codegen --service

.PHONY: codegen-definition
codegen-definition:  ## Generate definitions only
	@npx --workspace=@forwardimpact/libcodegen fit-codegen --definition

# ── Process ───────────────────────────────────────────────────────

.PHONY: process
process: process-agents process-resources process-tools process-graphs process-vectors  ## Process all resources

.PHONY: process-fast
process-fast: process-agents process-resources process-tools process-graphs  ## Process without vectors

.PHONY: process-agents
process-agents:  ## Process assistant definitions
	@$(ENVLOAD) npx --workspace=@forwardimpact/libagent fit-process-agents

.PHONY: process-resources
process-resources:  ## Process knowledge resources
	@$(ENVLOAD) npx --workspace=@forwardimpact/libresource fit-process-resources

.PHONY: process-tools
process-tools:  ## Process tool definitions
	@$(ENVLOAD) npx fit-process-tools

.PHONY: process-vectors
process-vectors:  ## Process vector indices
	@$(ENVLOAD) npx --workspace=@forwardimpact/libvector fit-process-vectors

.PHONY: process-graphs
process-graphs:  ## Process graph indices
	@$(ENVLOAD) npx --workspace=@forwardimpact/libgraph fit-process-graphs

# ── Data ──────────────────────────────────────────────────────────

.PHONY: data-init
data-init:  ## Initialize data directories
	@mkdir -p generated data/cli data/eval data/graphs data/ingest/in data/ingest/pipeline data/ingest/done data/knowledge data/logs data/memories data/policies data/resources data/traces data/vectors data/teams-tenant-configs data/teams-resource-ids data/tenants data/activity data/pathway data/personal

.PHONY: data-clean
data-clean:  ## Remove generated data
	@rm -rf generated data/cli data/eval data/logs data/graphs data/knowledge data/memories data/policies data/resources data/traces data/vectors data/teams-tenant-configs data/teams-resource-ids data/tenants

.PHONY: data-reset
data-reset: data-clean data-init codegen  ## Clean, init, and regenerate code

# ── Services ──────────────────────────────────────────────────────

.PHONY: rc-start
rc-start:  ## Start services via rc
	@$(ENVLOAD) npx fit-rc start

.PHONY: rc-stop
rc-stop:  ## Stop services via rc
	@$(ENVLOAD) npx fit-rc stop

.PHONY: rc-restart
rc-restart:  ## Restart services via rc
	@$(ENVLOAD) npx fit-rc restart

.PHONY: rc-status
rc-status:  ## Show service status
	@$(ENVLOAD) npx fit-rc status

# ── CLI ───────────────────────────────────────────────────────────

.PHONY: cli-chat
cli-chat: ## Agent conversations
	@$(ENVLOAD) npx fit-guide $(ARGS)

.PHONY: cli-search
cli-search: ## Vector similarity search
	@$(ENVLOAD) npx --workspace=@forwardimpact/libvector fit-search $(ARGS)

.PHONY: cli-query
cli-query: ## Graph triple pattern queries
	@$(ENVLOAD) npx --workspace=@forwardimpact/libgraph fit-query $(ARGS)

.PHONY: cli-subjects
cli-subjects: ## List graph subjects by type
	@$(ENVLOAD) npx --workspace=@forwardimpact/libgraph fit-subjects $(ARGS)

.PHONY: cli-visualize
cli-visualize:  ## Trace visualization
	@$(ENVLOAD) npx --workspace=@forwardimpact/libtelemetry fit-visualize $(ARGS)

.PHONY: cli-window
cli-window:  ## Fetch memory window as JSON
	@$(ENVLOAD) npx --workspace=@forwardimpact/libmemory fit-window $(ARGS)

.PHONY: cli-completion
cli-completion:  ## Send window to LLM API
	@$(ENVLOAD) npx --workspace=@forwardimpact/libllm fit-completion $(ARGS)

.PHONY: cli-tiktoken
cli-tiktoken:  ## Token counting
	@$(ENVLOAD) npx --workspace=@forwardimpact/libutil fit-tiktoken $(ARGS)

.PHONY: cli-unary
cli-unary:  ## Unary gRPC calls
	@$(ENVLOAD) npx --workspace=@forwardimpact/librpc fit-unary $(ARGS)

# ── Docs ──────────────────────────────────────────────────────────

.PHONY: docs-build
docs-build:  ## Build documentation
	@npx --workspace=@forwardimpact/libdoc docs-build

.PHONY: docs-serve
docs-serve:  ## Serve documentation
	@npx --workspace=@forwardimpact/libdoc docs-serve

.PHONY: docs-watch
docs-watch:  ## Serve with live reload
	@npx --workspace=@forwardimpact/libdoc docs-serve --watch

# ── Quality ───────────────────────────────────────────────────────

.PHONY: audit
audit: audit-vulnerabilities audit-secrets  ## Run security audit (vulnerability + secret scanning)

.PHONY: audit-vulnerabilities
audit-vulnerabilities:  ## Check dependencies for known vulnerabilities
	@npm audit --audit-level=high --omit=dev --workspaces

.PHONY: audit-secrets
audit-secrets:  ## Scan repository for leaked secrets
	@if command -v gitleaks >/dev/null 2>&1; then \
		gitleaks detect --source . --verbose; \
	else \
		echo "Warning: gitleaks not installed, skipping secret scan"; \
	fi


# ── Environment ───────────────────────────────────────────────────

.PHONY: env-setup
env-setup: env-reset env-secrets env-storage  ## Set up all environment secrets and storage config

.PHONY: env-reset
env-reset: config-reset ## Reset environment config from examples
	@for file in .env*.example; do [ -f "$$file" ] && cp -f "$$file" "$${file%.example}" || true; done

.PHONY: env-secrets
env-secrets:  ## Generate service and JWT secrets
	@node scripts/env-secrets.js

.PHONY: env-storage
env-storage:  ## Generate storage backend credentials
	@node scripts/env-storage.js

.PHONY: env-github
env-github:  ## GitHub token utility
	@$(ENVLOAD) node scripts/env-github.js

.PHONY: config-reset
config-reset: ## Reset config files from examples
	@cp config/config.example.json config/config.json
	@cp config/tools.example.yml config/tools.yml
	@for file in config/agents/*.agent.example.md; do [ -f "$$file" ] && cp -f "$$file" "$${file%.example.md}.md" || true; done

.PHONY: download-bundle
download-bundle:  ## Download generated code bundle from S3
	@$(ENVLOAD) npx --workspace=@forwardimpact/libutil fit-download-bundle

# ── Docker ────────────────────────────────────────────────────────

.PHONY: docker-build
docker-build:  ## Build Docker images
	@. ./.env.build && docker --log-level debug compose build --no-cache

.PHONY: docker-up
docker-up:  ## Start Docker Compose (core services only)
	@docker compose up

.PHONY: docker-up-minio
docker-up-minio:  ## Start Docker Compose with MinIO storage
	@docker compose --env-file .env --env-file .env.docker --env-file .env.storage.minio --profile minio up

.PHONY: docker-up-supabase
docker-up-supabase:  ## Start Docker Compose with Supabase
	@docker compose --env-file .env --env-file .env.docker --env-file .env.storage.supabase --profile supabase up

.PHONY: docker-down
docker-down:  ## Stop Docker Compose
	@docker compose --profile minio --profile supabase down

# ── Storage ───────────────────────────────────────────────────────

.PHONY: storage-setup
storage-setup: storage-start storage-wait storage-init storage-upload  ## Full setup (start, wait, init, upload)

.PHONY: storage-start
storage-start:  ## Start storage backend containers
	@docker compose --env-file .env --env-file .env.$(ENV) --env-file .env.storage.$(STORAGE) --profile $(STORAGE) up -d storage-$(STORAGE)

.PHONY: storage-stop
storage-stop:  ## Stop storage backend containers
	@docker compose --profile minio --profile supabase down

.PHONY: storage-wait
storage-wait:  ## Wait for storage to be ready
	@$(ENVLOAD) npx --workspace=@forwardimpact/libstorage fit-storage wait

.PHONY: storage-init
storage-init:  ## Create bucket in storage backend
	@$(ENVLOAD) npx --workspace=@forwardimpact/libstorage fit-storage create-bucket

.PHONY: storage-upload
storage-upload:  ## Upload data to storage backend
	@$(ENVLOAD) npx --workspace=@forwardimpact/libstorage fit-storage upload

.PHONY: storage-download
storage-download:  ## Download data from storage backend
	@$(ENVLOAD) npx --workspace=@forwardimpact/libstorage fit-storage download

.PHONY: storage-list
storage-list:  ## List storage contents
	@$(ENVLOAD) npx --workspace=@forwardimpact/libstorage fit-storage list

# ── Auth ──────────────────────────────────────────────────────────

.PHONY: auth-start
auth-start:  ## Start auth backend containers
	@docker compose --env-file .env --env-file .env.$(ENV) --env-file .env.auth.$(AUTH) --profile $(AUTH) up -d auth-$(AUTH)

.PHONY: auth-stop
auth-stop:  ## Stop auth backend containers
	@docker compose --profile gotrue --profile supabase down

.PHONY: auth-user
auth-user:  ## Create demo auth user
	$(ENVLOAD) node scripts/auth-user.js

# ── Supabase ──────────────────────────────────────────────────────

.PHONY: supabase-install
supabase-install:  ## Install Supabase CLI (brew)
	@which supabase >/dev/null 2>&1 || brew install supabase/tap/supabase

.PHONY: supabase-up
supabase-up:  ## Start local Supabase instance
	@cd products/map && supabase start --workdir .

.PHONY: supabase-down
supabase-down:  ## Stop local Supabase instance
	@cd products/map && supabase stop --workdir .

.PHONY: supabase-start
supabase-start:  ## Start Supabase via fit-rc (oneshot)
	@$(ENVLOAD) npx fit-rc start supabase

.PHONY: supabase-stop
supabase-stop:  ## Stop Supabase via fit-rc (oneshot)
	@$(ENVLOAD) npx fit-rc stop supabase

.PHONY: supabase-migrate
supabase-migrate:  ## Run Map database migrations
	@cd products/map && supabase db reset --workdir .

.PHONY: supabase-status
supabase-status:  ## Supabase health check
	@curl -sf http://127.0.0.1:54321/rest/v1/ >/dev/null && echo "supabase: ok" || echo "supabase: not running"

.PHONY: supabase-seed
supabase-seed:  ## Load example data into Supabase
	@node products/map/scripts/load-examples.js

.PHONY: supabase-setup
supabase-setup: supabase-up supabase-seed  ## Start + migrate + seed

# ── TEI ───────────────────────────────────────────────────────────

.PHONY: tei-install
tei-install:  ## Install TEI binary via cargo
	@cargo install --git https://github.com/huggingface/text-embeddings-inference --features candle text-embeddings-router

.PHONY: tei-start
tei-start:  ## Start TEI embedding service
	@$(ENVLOAD) npx fit-rc start tei
