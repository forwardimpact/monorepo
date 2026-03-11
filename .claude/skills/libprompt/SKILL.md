---
name: libprompt
description: >
  libprompt - Prompt template management with Mustache. PromptLoader loads
  .prompt.md files from directories and renders them with variable substitution.
  createPromptLoader factory for convenience. Use for managing LLM system
  prompts, creating reusable prompt templates, and dynamic prompt generation.
---

# libprompt Skill

## When to Use

- Managing LLM system prompts as templates
- Loading prompt files from directories
- Rendering prompts with dynamic variables
- Organizing prompts for different agents

## Key Concepts

**PromptLoader**: Loads .prompt.md files from a directory and renders them using
Mustache templating syntax.

**createPromptLoader**: Convenience factory function returning a PromptLoader
instance.

**Mustache templating**: Use `{{variable}}` syntax for dynamic content
insertion.

## Usage Patterns

### Pattern 1: Class instantiation (dependency injection)

```javascript
import { PromptLoader } from "@forwardimpact/libprompt";

const loader = new PromptLoader("./prompts");
const raw = loader.load("system");
const rendered = loader.render("system", {
  agentName: "Assistant",
  capabilities: ["search", "calculate"],
});
```

### Pattern 2: Factory function

```javascript
import { createPromptLoader } from "@forwardimpact/libprompt";

const loader = createPromptLoader("./prompts");
const rendered = loader.render("system", { agentName: "Assistant" });
```

### Pattern 3: Prompt file structure

```markdown
<!-- prompts/system.prompt.md -->

You are {{agentName}}.

Your capabilities: {{#capabilities}}

- {{.}} {{/capabilities}}
```

## Integration

Used wherever LLM prompts are managed as files. Prompt files use the
`.prompt.md` extension and live in `prompts/` directories.
