---
name: organize-files
description: Organize, tidy up, and find files in ~/Desktop/ and ~/Downloads/. Use when the user asks to find, organize, clean up, or tidy files on their Mac. Always previews changes before acting and never deletes without explicit confirmation. Extracts entities from document files using the extract-entities skill.
compatibility: Requires macOS filesystem access
---

# Organize Files

Organize, tidy up, and find files in `~/Desktop/` and `~/Downloads/`. Always
previews changes before acting and never deletes without explicit confirmation.

After organizing, extract entities from document files by invoking the
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
- Entity extraction triggered on document files via the **`extract-entities`**
  skill
- Summary of actions taken

---

## Core Capabilities

1. **Find files** — Locate files by name, type, or content in `~/Desktop/` and
   `~/Downloads/`
2. **Organize files** — Move files into logical subfolders
3. **Tidy up** — Clean up cluttered `~/Desktop/` and `~/Downloads/`
4. **Create structure** — Set up folder hierarchies
5. **Extract entities** — After organizing, invoke the **`extract-entities`**
   skill on document files to populate the knowledge graph

## Key Principles

**Always preview before acting:**

- Show what files will be affected BEFORE moving/deleting
- List proposed changes and ask for confirmation

**Be conservative with destructive operations:**

- Never delete without explicit confirmation
- Prefer moving to a "to-review" folder over deleting

## Summarizing Contents

Get an overview of both directories:

    node scripts/summarize.mjs

## Finding Files

```bash
find ~/Downloads -maxdepth 1 -name "*.pdf" -type f
find ~/Desktop -maxdepth 1 -iname "*AI*" -type f
find ~/Desktop -maxdepth 1 -type f \( -name "*.png" -o -name "*.jpg" \)
find ~/Downloads -maxdepth 1 -type f -mtime -7     # last 7 days
find ~/Downloads -maxdepth 1 -type f -mtime +30    # older than 30 days
find ~/Desktop -maxdepth 1 \( -name "Screenshot*" -o -name "Screen Shot*" \)
```

## Organizing by File Type

Organize a directory into type-based subdirectories (Documents, Images,
Archives, Installers, Screenshots):

    node scripts/organize-by-type.mjs ~/Downloads
    node scripts/organize-by-type.mjs ~/Desktop

The script creates subdirectories and moves matching files. It does NOT delete
anything.

## Entity Extraction

After organizing files, identify document files that may contain entity
information (people, organizations, projects, topics) and invoke the
**`extract-entities`** skill to process them.

### Which files to send for extraction

**Include:** `.pdf`, `.txt`, `.md`, `.rtf`, `.doc`, `.docx`, `.csv`, `.xlsx`

**Exclude:** Images, installers, archives, media, system files

### How to invoke

After organizing, collect the paths of document files and invoke the
**`extract-entities`** skill, passing the file paths as ad-hoc file inputs.

## Output Format

**Plan:**

```
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

```
Organization Complete

Moved 47 files:
- 23 screenshots to ~/Desktop/Screenshots/
- 12 PDFs to ~/Downloads/Documents/
- 8 images to ~/Downloads/Images/
- 4 DMGs to ~/Downloads/Installers/

Entity extraction: invoked extract-entities on 12 document files
```

## Safety Rules

1. **Never delete without permission** — "cleanup" means organize, not delete
2. **Don't touch system folders** — /System, /Library, /Applications
3. **Don't touch hidden files** — files starting with `.` unless asked
4. **Limit scope** — only operate on `~/Desktop/` and `~/Downloads/`
5. **Limit depth** — use `-maxdepth 1` unless user wants recursive
6. **Show before doing** — always preview first
7. **Quote paths** — handle spaces: `"$HOME/My Documents"`
