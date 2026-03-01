# Guide Makefile
# ====================
# Platform automation commands. Run `make help` for usage.
#
# Environment Variables:
#   ENV=local|docker       Network configuration (default: local)
#   STORAGE=local|minio|supabase  Storage backend (default: local)
#   AUTH=none|gotrue|supabase  Authentication backend (default: none)
#
# Examples:
#   make cli-chat                         # Uses local env, local storage
#   make cli-chat ENV=docker STORAGE=minio  # Uses docker env, minio storage
#   make eval ENV=local STORAGE=supabase AUTH=supabase  # Uses local env, supabase
#
# NOTE: Help text in the `help` target and inline `##` comments for each target
# must be kept in sync. Descriptions should make sense when read in isolation.

# ====================
# Environment Configuration
# ====================

ENV ?= local
STORAGE ?= local
AUTH ?= none

# Helper script to load environment files
ENVLOAD = ENV=$(ENV) STORAGE=$(STORAGE) AUTH=$(AUTH) ./scripts/env.sh

.PHONY: help
help:
	@echo "Usage: make <target> [ENV=local|docker] [STORAGE=local|minio|supabase] [AUTH=none|gotrue|supabase]"
	@echo ""
	@echo "Environment Variables:"
	@echo "  ENV=local         	Network config: local (default) or docker"
	@echo "  STORAGE=local     	Storage backend: local (default), minio, or supabase"
	@echo "  AUTH=none         	Auth backend: none (default), gotrue, or supabase"
	@echo ""
	@echo "Data Management:"
	@echo "  data-init         	Initialize data directories"
	@echo "  data-clean        	Remove generated data"
	@echo "  data-reset        	Clean, init, and regenerate code"
	@echo "  data-download     	Download demo data"
	@echo "  data-download-last Download latest demo data only"
	@echo ""
	@echo "Code Generation:"
	@echo "  codegen           	Generate all (types, services, clients)"
	@echo "  codegen-type      	Generate types only"
	@echo "  codegen-client    	Generate clients only"
	@echo "  codegen-service	Generate service bases only"
	@echo "  codegen-definition	Generate definitions only"
	@echo ""
	@echo "Processing:"
	@echo "  transform         	Transform documents (PDF)"
	@echo "  ingest            	Load and process ingestion pipeline"
	@echo "  ingest-load       	Load documents into pipeline"
	@echo "  ingest-pipeline  	Run ingestion pipeline"
	@echo "  process          	Process all resources"
	@echo "  process-fast      	Process without vectors"
	@echo "  process-agents	Process assistant definitions"
	@echo "  process-resources 	Process knowledge resources"
	@echo "  process-tools     	Process tool definitions"
	@echo "  process-vectors   	Process vector indices"
	@echo "  process-graphs    	Process graph indices"
	@echo ""
	@echo "Services:"
	@echo "  rc                	Run rc command"
	@echo "  rc-start          	Start services via rc"
	@echo "  rc-stop           	Stop services via rc"
	@echo "  rc-restart        	Restart services via rc"
	@echo "  rc-status         	Show service status"
	@echo ""
	@echo "TEI (Text Embeddings Inference):"
	@echo "  tei-install       	Install TEI binary via cargo"
	@echo "  tei-start         	Start TEI embedding service"
	@echo ""
	@echo "Docker:"
	@echo "  docker            	Build and start Docker Compose"
	@echo "  docker-build      	Build Docker images"
	@echo "  docker-up         	Start Docker Compose (core services only)"
	@echo "  docker-up-minio   	Start Docker Compose with MinIO storage"
	@echo "  docker-up-supabase Start Docker Compose with Supabase"
	@echo "  docker-down       	Stop Docker Compose"
	@echo ""
	@echo "Storage Management: (use STORAGE=minio|supabase)"
	@echo "  storage-setup     	Full setup (start, wait, init, upload)"
	@echo "  storage-start     	Start storage backend containers"
	@echo "  storage-stop      	Stop storage backend containers"
	@echo "  storage-wait      	Wait for storage to be ready"
	@echo "  storage-init      	Create bucket in storage backend"
	@echo "  storage-upload    	Upload data to storage backend"
	@echo "  storage-download  	Download data from storage backend"
	@echo "  storage-list      	List storage contents"
	@echo ""
	@echo "Auth Management: (use AUTH=gotrue|supabase)"
	@echo "  auth-start        	Start auth backend containers"
	@echo "  auth-stop         	Stop auth backend containers"
	@echo "  auth-user         	Create demo auth user"
	@echo ""
	@echo "Documentation:"
	@echo "  docs              	Serve documentation"
	@echo "  docs-build        	Build documentation"
	@echo "  docs-watch        	Serve with live reload"
	@echo ""
	@echo "CLI Tools:"
	@echo "  cli-chat          	Agent conversations"
	@echo "  cli-search        	Vector similarity search"
	@echo "  cli-query         	Graph triple pattern queries"
	@echo "  cli-subjects      	List graph subjects by type"
	@echo "  cli-visualize     	Trace visualization"
	@echo "  cli-window        	Fetch memory window as JSON"
	@echo "  cli-completion    	Send window to LLM API"
	@echo "  cli-tiktoken      	Token counting"
	@echo "  cli-unary         	Unary gRPC calls"
	@echo ""
	@echo "Evaluation:"
	@echo "  eval              	Run evaluation suite"
	@echo "  eval-report       	Generate evaluation report"
	@echo "  eval-reset        	Reset evaluation state"
	@echo ""
	@echo "Environment:"
	@echo "  env-setup         	Set up all environment secrets and storage config"
	@echo "  env-github         GitHub token utility"
	@echo "  env-secrets       	Generate service and JWT secrets"
	@echo "  env-storage       	Generate storage backend credentials"
	@echo "  env-reset         	Reset environment config from examples"
	@echo ""
	@echo "Utilities:"
	@echo "  config-reset     	Reset config files from examples"
	@echo "  download-bundle   	Download generated code bundle from S3"
	@echo "  ontology-topdown  	Generate ontology (top-down approach)"
	@echo "  security          	Run security audit"
	@echo "  spellcheck        	Check spelling in documentation"
	@echo "  validate-html     	Validate HTML files in eval/output"
	@echo ""
	@echo "NPM Scripts (pass-through):"
	@echo "  dev               	Start development server"
	@echo "  start             	Start services"
	@echo "  test              	Run tests"
	@echo "  test-watch        	Run tests in watch mode"
	@echo "  test-perf         	Run performance tests"
	@echo "  lint              	Run ESLint"
	@echo "  lint-fix          	Run ESLint with auto-fix"
	@echo "  format            	Check formatting with Prettier"
	@echo "  format-fix        	Fix formatting with Prettier"
	@echo "  check             	Run all checks (spelling, format, lint)"
	@echo "  check-fix         	Run all checks with auto-fix"

# ====================
# Data Management
# ====================

.PHONY: data-init
data-init:  ## Initialize data directories
	@mkdir -p generated data/cli data/eval data/graphs data/ingest/in data/ingest/pipeline data/ingest/done data/knowledge data/memories data/policies data/resources data/traces data/vectors data/teams-tenant-configs data/teams-resource-ids data/tenants
	@if [ -d examples/knowledge ] && [ -z "$$(ls -A data/knowledge 2>/dev/null)" ]; then \
		cp -r examples/knowledge/* data/knowledge/ 2>/dev/null || true; \
		echo "Copied example knowledge data to data/knowledge/"; \
	fi

.PHONY: data-clean
data-clean:  ## Remove generated data
	@rm -rf generated data/cli data/eval data/logs data/graphs data/knowledge data/memories data/policies data/resources data/traces data/vectors data/teams-tenant-configs data/teams-resource-ids data/tenants

.PHONY: data-reset
data-reset: data-clean data-init codegen  ## Clean, init, and regenerate code

.PHONY: data-download
data-download:  ## Download demo data
	@node ./scripts/demo-data.js

.PHONY: data-download-last
data-download-last:  ## Download latest demo data only
	@node ./scripts/demo-data.js --last

# ====================
# Code Generation
# ====================

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

# ====================
# Processing
# ====================

.PHONY: transform
transform: transform-pdf  ## Transform documents (PDF)

.PHONY: transform-pdf
transform-pdf:  ## Transform documents (PDF)
	@$(ENVLOAD) npx --workspace=@forwardimpact/libtransform transform-pdf

.PHONY: ingest
ingest: ingest-load ingest-pipeline  ## Load and process ingestion pipeline

.PHONY: ingest-load
ingest-load:  ## Load documents into pipeline
	@$(ENVLOAD) npx --workspace=@forwardimpact/libingest ingest-load

.PHONY: ingest-pipeline
ingest-pipeline:  ## Run ingestion pipeline
	@$(ENVLOAD) npx --workspace=@forwardimpact/libingest ingest-pipeline

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
	@$(ENVLOAD) npx fit-process-tools --proto-root=../../

.PHONY: process-vectors
process-vectors:  ## Process vector indices
	@$(ENVLOAD) npx --workspace=@forwardimpact/libvector fit-process-vectors

.PHONY: process-graphs
process-graphs:  ## Process graph indices
	@$(ENVLOAD) npx --workspace=@forwardimpact/libgraph fit-process-graphs

# ====================
# Services
# ====================

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

# ====================
# TEI (Text Embeddings Inference)
# ====================

.PHONY: tei-install
tei-install:  ## Install TEI binary via cargo from huggingface/text-embeddings-inference
	@cargo install --git https://github.com/huggingface/text-embeddings-inference --features candle text-embeddings-router

.PHONY: tei-start
tei-start:  ## Start TEI embedding service (downloads model on first run)
	@$(ENVLOAD) npx fit-rc start tei

# ====================
# Docker
# ====================

.PHONY: docker
docker: docker-build docker-up  ## Build and start Docker Compose

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

# ====================
# Storage Management
# ====================

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

# ====================
# Auth Management
# ====================

.PHONY: auth-start
auth-start:  ## Start auth backend containers
	@docker compose --env-file .env --env-file .env.$(ENV) --env-file .env.auth.$(AUTH) --profile $(AUTH) up -d auth-$(AUTH)

.PHONY: auth-stop
auth-stop:  ## Stop auth backend containers
	@docker compose --profile gotrue --profile supabase down

.PHONY: auth-user
auth-user:  ## Create demo auth user
	$(ENVLOAD) node scripts/auth-user.js

# ====================
# Documentation
# ====================

.PHONY: docs
docs: docs-serve  ## Serve documentation

.PHONY: docs-build
docs-build:  ## Build documentation
	@npx --workspace=@forwardimpact/libdoc docs-build

.PHONY: docs-serve
docs-serve:  ## Serve documentation
	@npx --workspace=@forwardimpact/libdoc docs-serve

.PHONY: docs-watch
docs-watch:  ## Serve with live reload
	@npx --workspace=@forwardimpact/libdoc docs-serve --watch

# ====================
# CLI Tools
# ====================

.PHONY: cli-chat
cli-chat: ## Agent conversations
	@$(ENVLOAD) node ./bin/fit-guide.js $(ARGS)

.PHONY: cli-search
cli-search: ## Vector similarity search
	@$(ENVLOAD) node ./scripts/search.js $(ARGS)

.PHONY: cli-query
cli-query: ## Graph triple pattern queries
	@$(ENVLOAD) node ./scripts/query.js $(ARGS)

.PHONY: cli-subjects
cli-subjects: ## List graph subjects by type
	@$(ENVLOAD) node ./scripts/subjects.js $(ARGS)

.PHONY: cli-visualize
cli-visualize:  ## Trace visualization
	@$(ENVLOAD) npx --workspace=@forwardimpact/libtelemetry fit-visualize $(ARGS)

.PHONY: cli-window
cli-window:  ## Fetch memory window as JSON
	@$(ENVLOAD) node ./scripts/window.js $(ARGS)

.PHONY: cli-completion
cli-completion:  ## Send window to LLM API
	@$(ENVLOAD) node ./scripts/completion.js $(ARGS)

.PHONY: cli-tiktoken
cli-tiktoken:  ## Token counting
	@$(ENVLOAD) node ./scripts/tiktoken.js $(ARGS)

.PHONY: cli-unary
cli-unary:  ## Unary gRPC calls
	@$(ENVLOAD) node ./scripts/unary.js $(ARGS)

# ====================
# Evaluation
# ====================

.PHONY: eval
eval:  ## Run evaluation suite
	@$(ENVLOAD) npx --workspace=@forwardimpact/libeval evaluation

.PHONY: eval-report
eval-report:  ## Generate evaluation report
	@$(ENVLOAD) npx --workspace=@forwardimpact/libeval eval-report

.PHONY: eval-reset
eval-reset:  ## Reset evaluation state
	@rm -rf data/*.log data/logs/* data/cli/* data/eval/* data/memories/* data/resources/common.Conversation.* data/traces/*
	@$(ENVLOAD) npx fit-rc restart --silent

# ====================
# Environment
# ====================

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

# ====================
# Utilities
# ====================

.PHONY: config-reset
config-reset: ## Reset config files from examples
	@cp config/config.example.json config/config.json
	@cp config/tools.example.yml config/tools.yml
	@for file in config/agents/*.agent.example.md; do [ -f "$$file" ] && cp -f "$$file" "$${file%.example.md}.md" || true; done

.PHONY: download-bundle
download-bundle:  ## Download generated code bundle from S3
	@$(ENVLOAD) npx --workspace=@forwardimpact/libutil fit-download-bundle

.PHONY: ontology-topdown
ontology-topdown:  ## Generate ontology (top-down approach)
	@node ./scripts/ontology_top_down.js

.PHONY: security
security:  ## Run security audit
	@npm audit --audit-level=low --workspaces

.PHONY: spellcheck
spellcheck:  ## Check spelling in documentation
	@npx spellchecker --quiet --files '**/*.md' '**/*.html' '!examples/**' '!**/*-prompt.md' --dictionaries .dictionary.txt --no-suggestions

.PHONY: validate-html
validate-html:  ## Validate HTML files in eval/output
	@find eval/output -name '*.html' | node scripts/validate.js

# ====================
# NPM Scripts (pass-through)
# ====================

.PHONY: dev
dev:  ## Start development server
	@npm run dev

.PHONY: start
start:  ## Start services
	@npm run start

.PHONY: test
test:  ## Run tests
	@npm run test

.PHONY: test-watch
test-watch:  ## Run tests in watch mode
	@npm run test:watch

.PHONY: test-perf
test-perf:  ## Run performance tests
	@npm run test:perf

.PHONY: lint
lint:  ## Run ESLint
	@npm run lint

.PHONY: lint-fix
lint-fix:  ## Run ESLint with auto-fix
	@npm run lint:fix

.PHONY: format
format:  ## Check formatting with Prettier
	@npm run format

.PHONY: format-fix
format-fix:  ## Fix formatting with Prettier
	@npm run format:fix

.PHONY: check
check:  ## Run all checks (spelling, format, lint)
	@npm run check

.PHONY: check-fix
check-fix:  ## Run all checks with auto-fix
	@npm run check:fix
