---
name: libformat
description: >
  libformat - Markdown formatting and text processing utilities. HtmlFormatter
  converts markdown to sanitized HTML. TerminalFormatter converts markdown to
  ANSI terminal output. createHtmlFormatter and createTerminalFormatter factory
  functions auto-inject dependencies. Use for rendering markdown content in web
  and CLI contexts.
---

# libformat Skill

## When to Use

- Rendering markdown content as sanitized HTML
- Displaying markdown in terminal with ANSI formatting
- Processing HTML details/summary elements
- Building multi-format output renderers

## Key Concepts

**FormatterInterface**: Both formatters implement `format(markdown): string` for
consistent usage across output targets.

**Dependency injection**: Constructors accept dependencies (Marked,
sanitize-html, marked-terminal) for testability. Factory functions auto-inject
production dependencies.

**Details handling**: Both formatters process `<details>/<summary>` elements
appropriately for their target format.

## Usage Patterns

### Pattern 1: HTML output

```javascript
import { createHtmlFormatter } from "@forwardimpact/libformat";

const formatter = createHtmlFormatter();
const html = formatter.format("# Hello\n\nThis is **bold** text.");
```

### Pattern 2: Terminal output

```javascript
import { createTerminalFormatter } from "@forwardimpact/libformat";

const formatter = createTerminalFormatter();
const output = formatter.format("# Hello\n\nThis is **bold** text.");
```

### Pattern 3: Testing with mocks

```javascript
import { HtmlFormatter } from "@forwardimpact/libformat";

const mockSanitize = (html) => html;
const mockMarked = { Marked: class { setOptions() { return this; } } };
const formatter = new HtmlFormatter(mockSanitize, mockMarked);
```

## Integration

Used by pathway formatters and CLI commands for rendering markdown content in
web pages and terminal output.
