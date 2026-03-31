# Step 2: Research Guide architecture and requirements

You need to understand Guide's architecture so you can install it properly in a
fresh project (NOT by cloning the monorepo).

Fetch and read these pages from www.forwardimpact.team:

1. The Guide internals page at
   https://www.forwardimpact.team/docs/internals/guide/
2. The CLI reference page at https://www.forwardimpact.team/docs/reference/cli/
3. The operations reference at
   https://www.forwardimpact.team/docs/internals/operations/
4. The YAML schema reference at
   https://www.forwardimpact.team/docs/reference/yaml-schema/
5. The core model reference at
   https://www.forwardimpact.team/docs/reference/model/

After reading, write a summary to ./notes/02-architecture.md:
- The Guide service stack (what services are needed and their ports)
- The agent orchestration pipeline (planner, researcher, editor)
- The knowledge pipeline (how data flows from HTML to graph + vector stores)
- All required npm packages and their roles
- The configuration files needed (config.json, agents/, tools.yml)
- What a minimal standalone installation would require
