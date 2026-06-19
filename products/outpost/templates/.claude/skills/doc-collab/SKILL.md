---
name: doc-collab
description: Help the user create, edit, and refine documents in the knowledge base. Use when the user asks to create, edit, review, or collaborate on a document. Supports direct editing and approval-based workflows with knowledge base context for entity references.
---

# Document Collaboration

Help the user create, edit, and refine documents in the knowledge base. Supports
direct editing and approval-based workflows. Always uses knowledge base context
for entity references.

## Trigger

Run when the user asks to create, edit, review, or collaborate on a document.

## Prerequisites

- Knowledge base directory exists

## Inputs

- User's editing instructions
- `Knowledge/` — existing notes and documents
- Document to edit (user-specified or searched)

## Outputs

- Created or modified documents in `Knowledge/` or user-specified location

---

## First: Ask About Edit Mode

**Before doing anything, ask:** "Should I make edits directly, or show you
changes first for approval?"

- **Direct mode:** Make edits immediately, confirm after
- **Approval mode:** Show proposed changes, wait for approval

Follow their choice for the entire session.

## Core Principles

- **Re-read before every response** — the user may have edited the file manually
- **Be concise** — don't propose outlines unless asked
- **Don't assume** — if unclear, ask ONE simple question
- **Use knowledge context** — search knowledge base for mentioned entities, use
  `[[wiki-links]]`

## Processing Flow

### Step 1: Find the Document

Search thoroughly before saying a document doesn't exist:

```bash
rg -l -i "roadmap" Knowledge/
find Knowledge/ -iname "*roadmap*" 2>/dev/null
```

**If found:** Read it and proceed. **If NOT found:** Ask "I couldn't find
[name]. Shall I create it?"

**Creating new documents:**

1. Ask: "Shall I create Knowledge/[name].md?"
2. Create with just a title — don't pre-populate with structure
3. Ask: "What would you like in this?"

### Step 2: Understand the Request

**NEVER make unsolicited edits.** If the user hasn't specified what to change,
ask: "What would you like to change?"

Types of requests:

1. **Direct edits** — "Change the title", "Add a bullet about Y"
2. **Content generation** — "Write an intro", "Draft the summary"
3. **Review/feedback** — "What do you think?", "Is this clear?"
4. **Research-backed additions** — "Add context about [Person]"
5. **No clear request** — Read the doc, then ask: "What would you like to
   change?"

### Step 3: Execute Changes

Make targeted edits — change only what's needed. Preserve the user's voice and
don't reorganize unless asked.

### Step 4: Confirm and Continue

- Briefly confirm: "Added the executive summary section"
- Ask: "What's next?"
- Don't read back the entire document unless asked

## Searching Knowledge for Context

When the user mentions people, companies, or projects:

```bash
rg -l "Name" Knowledge/
cat "Knowledge/People/Person.md"
cat "Knowledge/Organizations/Company.md"
```

Use `[[wiki-links]]` to connect to other notes. Only link to notes that exist.

## Constraints

- Match the user's tone and style
- Make surgical edits — change only what's needed
- Preserve the user's voice — don't reorganize unless asked
- Only link to notes that exist — use `[[Person Name]]` for existing notes
