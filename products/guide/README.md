# @forwardimpact/guide

> How do I find my bearing?

Guide is an AI agent that understands your organization's engineering framework
— skills, levels, behaviours, and expectations — and reasons about them in
context. It helps developers onboard, find growth areas, and interpret
engineering artifacts against skill markers.

Guide is part of the [Forward Impact](https://www.forwardimpact.team) product
suite alongside [Map](https://www.npmjs.com/package/@forwardimpact/map),
[Pathway](https://www.npmjs.com/package/@forwardimpact/pathway), Basecamp,
Landmark, and Summit.

## Install

```sh
npm install @forwardimpact/guide
npx fit-codegen --all
```

Guide depends on gRPC service clients generated from Protocol Buffer
definitions. The `fit-codegen` step produces these — without it, imports fail
with a missing module error.

## Service Requirements

Guide is a client for the Forward Impact knowledge platform. Unlike Map (local
YAML validation) and Pathway (local job derivation), Guide connects to a gRPC
service stack for LLM orchestration, memory, knowledge graphs, and vector
search.

The following services must be running:

- **agent** — orchestrates multi-turn conversations
- **llm** — provides LLM completions
- **memory** — manages conversation history
- **graph** — stores knowledge graph triples
- **vector** — provides embedding similarity search
- **tool** — executes tool calls
- **trace** — records execution traces
- **web** — serves web interface

## Quick Start

1. Install and generate service clients:

   ```sh
   npm install @forwardimpact/guide
   npx fit-codegen --all
   ```

2. Set the service secret in your environment:

   ```sh
   export SERVICE_SECRET=<your-secret>
   ```

3. Run Guide:

   ```sh
   npx fit-guide
   ```

## CLI Usage

```sh
# Start an interactive conversation
npx fit-guide

# Pipe a question directly
echo "Tell me about the company" | npx fit-guide

# Specify a framework data directory
npx fit-guide --data=./my-data

# Show help
npx fit-guide --help

# Show version
npx fit-guide --version
```

## Related Packages

- [@forwardimpact/map](https://www.npmjs.com/package/@forwardimpact/map) —
  Engineering framework validation and data product
- [@forwardimpact/pathway](https://www.npmjs.com/package/@forwardimpact/pathway)
  — Career progression web app and CLI

## Documentation

- [Guide product page](https://www.forwardimpact.team/guide)
- [Monorepo](https://github.com/forwardimpact/monorepo)

## License

Apache-2.0
