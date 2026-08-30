---
name: doc-collab
description: Help the user create, edit, and refine documents in the knowledge base. Use when the user asks to create, edit, review, or collaborate on a document. Supports direct edits and approval-based workflows, with context from the knowledge base for entity references.
---

# Document Collaboration

Write tier: `0-Draft` (working copies; the human promotes)
Frontmatter: none

Help the user create, edit, and refine documents in the knowledge base. This
skill supports direct edits and approval-based workflows. It always uses context
from the knowledge base for entity references. New documents start in
`0-Draft/`. The human promotes a finished document into its tier.

## Trigger

Run when the user asks to create, edit, review, or collaborate on a document.

## Prerequisites

- The KB root exists with its tier directories

## Inputs

- The user's edit instructions
- The tier directories — existing notes and documents
- Document to edit (user-specified or searched)

## Outputs

- New documents in `0-Draft/` (or a user-specified location)
- Modified documents in the tier where the user points

---

## First: Ask About Edit Mode

**Ask before you do anything:** "Should I make edits directly, or show you
changes first for approval?"

- **Direct mode:** Make edits immediately, then confirm
- **Approval mode:** Show proposed changes, then wait for approval

Follow their choice for the entire session.

## Core Principles

- **Re-read before every response** — the user may edit the file manually
- **Be concise** — don't propose outlines unless asked
- **Don't assume** — if something is unclear, ask ONE simple question
- **Use knowledge context** — search the knowledge base for mentioned entities,
  then use `[[wiki-links]]`

## Process Flow

### Step 1: Find the Document

Search thoroughly before you say a document doesn't exist:

```bash
rg -l -i "roadmap" [0-9]-*/
find [0-9]-*/ -iname "*roadmap*" 2>/dev/null
```

**If found:** Read it. Then proceed. **If NOT found:** Ask "I couldn't find
[name]. Shall I create it?"

**Create a new document:**

1. Ask: "Shall I create 0-Draft/[name].md?"
2. Create it with just a title. Don't pre-populate it with structure
3. Ask: "What would you like in this?"

### Step 2: Understand the Request

**NEVER make unsolicited edits.** If the user did not say what to change, ask:
"What would you like to change?"

Types of requests:

1. **Direct edits** — "Change the title", "Add a bullet about Y"
2. **Content generation** — "Write an intro", "Draft the summary"
3. **Review/feedback** — "What do you think?", "Is this clear?"
4. **Research-backed additions** — "Add context about [Person]"
5. **No clear request** — Read the doc, then ask: "What would you like to
   change?"

### Step 3: Execute Changes

Make targeted edits. Change only what's needed. Preserve the user's voice. Don't
reorganize unless the user asks.

### Step 4: Confirm and Continue

- Briefly confirm: "Added the executive summary section"
- Ask: "What's next?"
- Don't read back the entire document unless asked

## Search the Graph for Context

When the user mentions people, companies, or projects:

```bash
rg -l "Name" [0-9]-*/
cat "3-Team/People/Person.md"
cat "3-Team/Organizations/Company.md"
```

Use `[[wiki-links]]` to connect to other notes. Only link to notes that exist.

## Constraints

- Match the user's tone and style
- Make surgical edits that change only what's needed
- Preserve the user's voice, and don't reorganize unless the user asks
- Only link to notes that exist, and use `[[Person Name]]` for existing notes
