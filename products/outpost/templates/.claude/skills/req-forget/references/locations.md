# Discovery Search Recipes

Reference for `req-forget` Step 1. Run every recipe; record every match into the
inventory.

## Knowledge base — direct notes

```bash
ls -d "Knowledge/Candidates/{Name}/" 2>/dev/null
ls "Knowledge/People/{Name}.md" 2>/dev/null

# Common name variations
ls "Knowledge/People/{First} {Last}.md" 2>/dev/null
ls "Knowledge/People/{Last}, {First}.md" 2>/dev/null
```

## Knowledge base — backlinks and mentions

```bash
rg -l "{Name}" Knowledge/
rg -l "{First name} {Last name}" Knowledge/
rg -l "\[\[.*{Name}.*\]\]" Knowledge/
rg -l "{email}" Knowledge/
```

## Cached email threads

```bash
rg -l "{Name}" ~/.cache/fit/outpost/apple_mail/ 2>/dev/null
rg -l "{email}" ~/.cache/fit/outpost/apple_mail/ 2>/dev/null
find ~/.cache/fit/outpost/apple_mail/attachments/ -iname "*{Name}*" 2>/dev/null
```

## Cached calendar events

```bash
rg -l "{Name}" ~/.cache/fit/outpost/apple_calendar/ 2>/dev/null
rg -l "{email}" ~/.cache/fit/outpost/apple_calendar/ 2>/dev/null
```

## Agent state files

```bash
rg -l "{Name}" ~/.cache/fit/outpost/state/ 2>/dev/null
```

## Drafts

```bash
rg -l "{Name}" Drafts/ 2>/dev/null
```

## Final verification

```bash
rg "{Name}" Knowledge/ ~/.cache/fit/outpost/ Drafts/
```

Expected: only the erasure report matches.
