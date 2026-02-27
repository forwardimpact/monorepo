# libdoc

Documentation build and serve tools for the Forward Impact documentation site.
Generates static sites from Markdown files with Mustache templating support.

## Usage

```javascript
import {
  DocsBuilder,
  DocsServer,
  parseFrontMatter,
} from "@forwardimpact/libdoc";

const builder = new DocsBuilder({ srcDir: "docs", outDir: "public" });
await builder.build();

const server = new DocsServer({ port: 3000 });
await server.start();
```

## CLI

```sh
# Build documentation site
npx fit-doc build --src=docs --out=dist

# Serve documentation locally
npx fit-doc serve --port=3000

# Serve with watch mode for development
npx fit-doc serve --watch
```

## API

| Export             | Description                                  |
| ------------------ | -------------------------------------------- |
| `DocsBuilder`      | Build static documentation sites             |
| `DocsServer`       | Serve documentation locally with live reload |
| `parseFrontMatter` | Parse YAML front matter from markdown files  |
