---
name: organize-files
description: Organize, tidy up, and find files in ~/Desktop/ and ~/Downloads/. Use when the user asks to find, organize, clean up, or tidy files on their Mac. Always previews changes before it acts. Never deletes without explicit confirmation. Extracts entities from document files with the extract-entities skill.
compatibility: Requires macOS filesystem access
---

# Organize Files

Write tier: none (delegates graph writes to extract-entities)
Frontmatter: none

Organize, tidy up, and find files in `~/Desktop/` and `~/Downloads/`. Always
preview changes before you act. Never delete without explicit confirmation.

After you organize, extract entities from document files. Invoke the
**`extract-entities`** skill.

## Trigger

Run when the user asks to find, organize, clean up, or tidy files on their Mac.

## Prerequisites

- macOS filesystem access

## Inputs

- User's description of what to organize or find
- Source directories: `~/Desktop/` and `~/Downloads/`

## Outputs

- Organized files moved to logical subdirectories within `~/Desktop/` and
  `~/Downloads/`
- Entity extraction triggered on document files with the **`extract-entities`**
  skill
- Summary of actions taken

---

## Core Capabilities

1. **Find files** — Locate files by name, type, or content in `~/Desktop/` and
   `~/Downloads/`
2. **Organize files** — Move files into logical subfolders
3. **Tidy up** — Clean up cluttered `~/Desktop/` and `~/Downloads/`
4. **Create structure** — Set up folder hierarchies
5. **Extract entities** — After you organize, invoke the
   **`extract-entities`** skill on document files to populate the knowledge
   graph

## Key Principles

**Always preview before you act:**

- Show which files change BEFORE you move or delete them
- List proposed changes and ask for confirmation

**Be conservative with destructive operations:**

- Never delete without explicit confirmation
- Move to a "to-review" folder rather than delete

## Summarize the Contents

Get an overview of both directories:

```text
node scripts/summarize.mjs
```

## Find Files

```bash
find ~/Downloads -maxdepth 1 -name "*.pdf" -type f
find ~/Desktop -maxdepth 1 -iname "*AI*" -type f
find ~/Desktop -maxdepth 1 -type f \( -name "*.png" -o -name "*.jpg" \)
find ~/Downloads -maxdepth 1 -type f -mtime -7     # last 7 days
find ~/Downloads -maxdepth 1 -type f -mtime +30    # older than 30 days
find ~/Desktop -maxdepth 1 \( -name "Screenshot*" -o -name "Screen Shot*" \)
```

## Organize by File Type

Organize a directory into type-based subdirectories (Documents, Images,
Archives, Installers, Screenshots):

```text
node scripts/organize-by-type.mjs ~/Downloads
node scripts/organize-by-type.mjs ~/Desktop
```

The script creates subdirectories and moves the files that match. It does NOT
delete anything.

## Entity Extraction

After you organize the files, identify document files that may contain entity
information (people, organizations, projects, topics). Then invoke the
**`extract-entities`** skill to process them.

### Which files to send for extraction

**Include:** `.pdf`, `.txt`, `.md`, `.rtf`, `.doc`, `.docx`, `.csv`, `.xlsx`

**Exclude:** Images, installers, archives, media, system files

### How to invoke

After you organize, collect the paths of the document files. Then invoke the
**`extract-entities`** skill and pass the file paths as ad-hoc file inputs.

## Output Format

**Plan:**

```text
Organization Plan: Desktop & Downloads Cleanup

Found 47 files to organize:
- 23 screenshots → ~/Desktop/Screenshots/
- 12 PDFs → ~/Downloads/Documents/
- 8 images → ~/Downloads/Images/
- 4 DMGs → ~/Downloads/Installers/

Document files for entity extraction: 12
→ Will invoke extract-entities skill after organizing

Should I proceed?
```

**Results:**

```text
Organization Complete

Moved 47 files:
- 23 screenshots to ~/Desktop/Screenshots/
- 12 PDFs to ~/Downloads/Documents/
- 8 images to ~/Downloads/Images/
- 4 DMGs to ~/Downloads/Installers/

Entity extraction: invoked extract-entities on 12 document files
```

## Safety Rules

1. **Never delete without permission** — "cleanup" means organize. It does not
   mean delete
2. **Don't touch system folders** — /System, /Library, /Applications
3. **Don't touch hidden files** — files that start with `.` unless asked
4. **Limit scope** — only operate on `~/Desktop/` and `~/Downloads/`
5. **Limit depth** — use `-maxdepth 1` unless the user wants recursive
6. **Show before you act** — always preview first
7. **Quote paths** — handle spaces: `"$HOME/My Documents"`
