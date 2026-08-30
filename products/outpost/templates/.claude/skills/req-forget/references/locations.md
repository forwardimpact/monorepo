# Discovery Search Recipes

Reference for `req-forget` Step 1. Run every recipe from the KB root. Repeat
each recipe for every recorded alias and email. Record every match into the
inventory. The tier glob `[0-9]-*/` covers every tier present.

## Direct notes, per tier

```bash
ls -d "2-Confidential/Candidates/{Name}/" 2>/dev/null
ls "2-Confidential/Prospects/{Name}.md" 2>/dev/null
ls "2-Confidential/People/{Name}.md" 2>/dev/null   # overlay note
ls "3-Team/People/{Name}.md" 2>/dev/null

# Common name variations, in any tier
ls [0-9]-*/People/"{First} {Last}.md" 2>/dev/null
ls [0-9]-*/People/"{Last}, {First}.md" 2>/dev/null
```

## Backlinks and mentions, every tier

```bash
rg -l "{Name}" [0-9]-*/
rg -l "{First name} {Last name}" [0-9]-*/
rg -l "\[\[.*{Name}.*\]\]" [0-9]-*/
rg -l "{email}" [0-9]-*/
```

## Personal surfaces

```bash
rg -l "{Name}" 0-Draft/ Briefings/ 2>/dev/null
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
rg -l "{Name}" ~/.cache/fit/outpost/ 2>/dev/null
```

## Final verification

Run from the KB root so the search covers every tier and personal surface:

```bash
rg "{Name}" . ~/.cache/fit/outpost/
```

Expected: only the erasure report matches. Repeat per alias and email.
