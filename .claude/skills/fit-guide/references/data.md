# Data Pipeline

## Processing

Run processors from your project root after `npx fit-guide init` (see §
Initialization for the full list). They are independent and idempotent — re-run
any step after editing its inputs.

### Data Directories

| Path              | Contents                                |
| ----------------- | --------------------------------------- |
| `data/knowledge/` | Input HTML files                        |
| `data/resources/` | Processed resources                     |
| `data/vectors/`   | Embedding vector indices                |
| `data/graphs/`    | RDF quad index + ontology               |
| `data/memories/`  | Conversation state                      |
| `data/spans/`     | Distributed traces                      |
| `data/policies/`  | Access control policies                 |
| `data/logs/`      | Service logs                            |
| `data/cli/`       | CLI session data                        |
| `data/eval/`      | Evaluation results                      |
| `data/ingest/`    | Ingestion pipeline (in/pipeline/done)   |
| `data/pathway/`   | Standard data (created by fit-map init) |
