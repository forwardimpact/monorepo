# Improve Skills for Agent Documents

Review and improve skills in a capability file to produce excellent agent skill
documents. Focus on `toolReferences` and `implementationReference` sections.

## Context

Skills with `agent:` sections generate SKILL.md files using
`templates/skill.template.md`. The template:

- Renders `toolReferences` as a **Recommended Tools** table automatically
- Renders `implementationReference` as a **Reference** section

Because the template handles tool rendering separately, the
`implementationReference` must NOT duplicate tool information.

## Core Principle: Outcome-Oriented Instructions

Skills exist to help someone achieve an outcome. The `implementationReference`
should provide **clear step-by-step instructions** that guide the reader from
start to finish—not a scattered collection of code snippets or best practices.

Ask: _"If I follow these instructions, will I achieve the skill's stated
purpose?"_

## Your Task

1. **Identify the capability** to review (ask if not specified)
2. **Read the capability file** from `data/capabilities/{id}.yaml`
3. **For each skill with an `agent:` section**, review and improve
4. **Study the updated skill** by running `npx pathway skill <name> --agent`
5. **Iterate** until the skill document is clear, complete, and well-structured

### Tool References Review

Check that `toolReferences`:

- Include all tools used in `implementationReference` code samples
- Have accurate, concise `description` fields
- Have specific `useWhen` guidance (not generic)
- Include `url` for official documentation where available
- Don't include tools not actually used in the implementation

### Implementation Reference Review

Check that `implementationReference`:

- **Follows a logical sequence** from setup to implementation to verification
- **Does NOT contain** tool tables or "Technology Stack" sections (duplicates
  `toolReferences`)
- **Provides step-by-step guidance** to achieve the skill's purpose
- **Shows complete, working code** (not fragments or pseudocode)
- **Connects the steps** so the reader understands the flow
- **Includes verification** so the reader knows when they've succeeded

### Common Problems to Fix

| Problem                 | Fix                                             |
| ----------------------- | ----------------------------------------------- |
| Scattered snippets      | Restructure as numbered steps or logical flow   |
| Tool lists in reference | Remove (already in `toolReferences`)            |
| Code without context    | Add prose explaining what each section achieves |
| Missing setup           | Add installation/configuration steps            |
| No verification         | Add "you'll know it works when..." guidance     |
| Generic best practices  | Make specific to achieving the skill's outcome  |

### Good Structure Pattern

```markdown
## Setup

[Installation and configuration]

## Step 1: [First action]

[Explanation + code]

## Step 2: [Next action]

[Explanation + code]

## Verification

[How to confirm success]

## Common Pitfalls

[What to watch out for]
```

## Output

1. Summarize issues found
2. Apply fixes directly to the capability file
3. Run `npm run validate` to verify changes

## Examples

**BAD - Incoherent snippets (no clear path to outcome):**

````yaml
implementationReference: |
  ## Technology Stack
  - **Langfuse**: Tracing
  - **LangChain**: Pipelines

  ## Tracing
  ```python
  from langfuse.callback import CallbackHandler
  handler = CallbackHandler()
  ```

  ## Datasets
  ```python
  dataset = langfuse.create_dataset(name="test")
  ```

  ## Best Practices
  - Use meaningful trace names
  - Version your datasets
````

**GOOD - Step-by-step instructions (clear path to outcome):**

````yaml
implementationReference: |
  ## Setup

  ```bash
  pip install langfuse langchain
  export LANGFUSE_PUBLIC_KEY="pk-..."
  export LANGFUSE_SECRET_KEY="sk-..."
  ```

  ## Step 1: Instrument Your Application

  Add tracing to capture execution flow:

  ```python
  from langfuse.callback import CallbackHandler

  handler = CallbackHandler()
  result = chain.invoke(input, config={"callbacks": [handler]})
  ```

  ## Step 2: Create Evaluation Dataset

  Build a dataset from traced executions:

  ```python
  langfuse = Langfuse()
  langfuse.create_dataset(name="qa-evaluation")
  langfuse.create_dataset_item(
      dataset_name="qa-evaluation",
      input={"question": "..."},
      expected_output="..."
  )
  ```

  ## Verification

  Open Langfuse UI. Navigate to Datasets. Verify items appear with
  correct input/output pairs.

  ## Common Pitfalls

  - **Missing environment variables**: Traces silently fail
  - **No expected_output**: Can't measure correctness
````

**BAD - Generic useWhen:**

```yaml
toolReferences:
  - name: pytest
    useWhen: Testing
```

**GOOD - Specific useWhen:**

```yaml
toolReferences:
  - name: pytest
    useWhen: Writing unit tests for Python ML pipelines and evaluators
```
