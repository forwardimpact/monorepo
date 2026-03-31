# Step 4: Configure and bootstrap the Guide product

Now that the monorepo is installed, configure the Guide product following the
operations reference you read earlier.

Working inside the ./monorepo directory:

1. Run `make quickstart` to bootstrap the environment. This chains:
   env-setup → generate-cached → data-init → codegen → process-fast
2. If `make quickstart` fails, run the steps individually:
   a. `make env-setup` — reset .env files and generate secrets
   b. `make data-init` — create data directories and copy example knowledge
   c. `make codegen` — generate types from proto definitions
   d. `make process-fast` — process agents, resources, tools, and graphs
3. Verify the configuration:
   a. Check that `config/config.json` exists
   b. Check that `config/agents/` contains agent definition files
   c. Check that `config/tools.yml` exists
   d. Check that `data/knowledge/` contains HTML files
   e. Check that `data/resources/` contains processed resources
   f. Check that `data/graphs/` contains graph index files

Report what happened at each step. Save a log to ./notes/04-configure-log.md
