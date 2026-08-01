# Source of Truth

Verify claims against the canonical source when you write or review
documentation. Never trust documentation alone. Read the code.

| Documentation topic  | Verify against                                   |
| -------------------- | ------------------------------------------------ |
| Entity definitions   | `data/pathway/` (capabilities, behaviours, etc.) |
| Library derivations  | `libraries/{lib}/src/`                           |
| Product validation   | `products/{product}/src/`                        |
| Product CLIs         | `products/{product}/bin/fit-{product}.js`        |
| Library CLIs         | `libraries/{lib}/bin/fit-{lib}.js`               |
| Templates            | `products/{product}/templates/`                  |
| JSON Schema          | `products/{product}/schema/json/`                |
| RDF/SHACL Schema     | `products/{product}/schema/rdf/`                 |
| LLM / SEO outputs    | `websites/llms.txt`, `websites/robots.txt`       |
| Kata Agent Team      | `KATA.md`                                        |
