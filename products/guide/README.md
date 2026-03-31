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
bun install @forwardimpact/guide
```

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

1. Clone the monorepo and start the service stack:

   ```sh
   git clone https://github.com/forwardimpact/monorepo
   cd monorepo
   make services
   ```

2. Set the service secret in your environment:

   ```sh
   export SERVICE_SECRET=<your-secret>
   ```

3. Run Guide:

   ```sh
   bunx fit-guide
   ```

## CLI Usage

```sh
# Start an interactive conversation
bunx fit-guide

# Pipe a question directly
echo "Tell me about the company" | bunx fit-guide

# Specify a framework data directory
bunx fit-guide --data=./my-data

# Show help
bunx fit-guide --help

# Show version
bunx fit-guide --version
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
