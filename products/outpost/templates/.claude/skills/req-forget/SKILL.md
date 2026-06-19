---
name: req-forget
description: >
  Process GDPR Article 17 data erasure requests. Finds and removes all personal
  data related to a named individual from the knowledge base, cached data, and
  agent state files. Use when the user receives a right-to-be-forgotten
  request, asks to delete all data about a person, or needs to comply with a
  data erasure obligation.
compatibility: Requires macOS filesystem access
---

# Right to Be Forgotten

Process data erasure requests under GDPR Article 17. Given a person's name,
systematically find and remove all personal data from the knowledge base, cached
synced data, and agent state files. Produces an **erasure report** documenting
what was found, deleted, and redacted — the compliance audit trail.

## Trigger

- A formal GDPR erasure request arrives.
- The user asks to delete all data about a specific person.
- A candidate withdraws and requests data deletion.
- The user asks to "forget" someone.

## Prerequisites

- The person's full name (and any known aliases or email addresses).
- User confirmation before any deletion.

## Inputs

- **Name** (required) — full name of the data subject.
- **Aliases** (optional) — alternative names, maiden names, nicknames.
- **Emails** (optional) — improves search coverage.
- **Scope** — `all` (default) or `recruitment-only`.

## Outputs

- `Knowledge/Erasure/{Name}--{YYYY-MM-DD}.md` — erasure report.
- Deleted files and redacted references across the knowledge base.

<do_confirm_checklist goal="Verify erasure is complete and the audit trail is
sound">

- [ ] User confirmed intent before any deletion.
- [ ] All discovery recipes ran; inventory covers knowledge, cache, state,
      drafts.
- [ ] All dedicated files and directories deleted.
- [ ] All mentions and backlinks redacted from other notes.
- [ ] Cached email threads, attachments, and calendar entries handled.
- [ ] Agent state and `graph_processed` cleaned.
- [ ] Erasure report saved; contains **no** personal data beyond the name and
      actions taken.
- [ ] Final `rg` search shows only the erasure report as a match.

</do_confirm_checklist>

## Procedure

### 0. Confirm intent

State to the user:

> **Data erasure request for: {Name}**
>
> This will permanently delete all personal data related to {Name} from:
>
> - Knowledge base notes (People, Candidates, Organizations mentions)
> - Cached email threads and attachments
> - Agent state and triage files
>
> This action cannot be undone. Proceed?

**Wait for explicit confirmation before continuing.**

### 1. Discovery

Run every recipe in [references/locations.md](references/locations.md) and
compile a complete inventory of every file and reference found.

### 2. Classify

For each match, pick an action from the table in
[references/classify.md](references/classify.md). Apply its redaction rules
where redaction is the action.

### 3. Execute deletions

Process most-specific to most-general.

**3a. Dedicated files and directories:**

```bash
rm -rf "Knowledge/Candidates/{Name}/"
rm -f "Knowledge/People/{Name}.md"
find ~/.cache/fit/outpost/apple_mail/attachments/ -iname "*{Name}*" -delete
```

**3b. Redact mentions in other notes:** read each file, remove the specific
lines/bullets/sections per the rules in
[references/classify.md](references/classify.md#redaction-rules), remove broken
`[[backlinks]]` to deleted notes, write the file back.

**3c. Email threads:** delete sole-subject threads; redact paragraphs only in
multi-person threads.

**3d. Agent state files:**

```bash
for f in ~/.cache/fit/outpost/state/*_triage.md; do
  if rg -q "{Name}" "$f" 2>/dev/null; then
    rg -v "{Name}" "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  fi
done
```

**3e. Processing state:** drop deleted paths from `graph_processed`:

```bash
rg -v "{deleted_path}" ~/.cache/fit/outpost/state/graph_processed \
  > ~/.cache/fit/outpost/state/graph_processed.tmp \
  && mv ~/.cache/fit/outpost/state/graph_processed.tmp \
       ~/.cache/fit/outpost/state/graph_processed
```

### 4. Write the erasure report

Save to `Knowledge/Erasure/{Name}--{YYYY-MM-DD}.md` using the template in
[references/report-template.md](references/report-template.md). Record **only**
what was deleted — never CV content, skills, or assessments.

### 5. Verify

```bash
rg "{Name}" Knowledge/ ~/.cache/fit/outpost/ Drafts/
```

The only match should be the erasure report. If other matches remain, process
them and update the report.

## Scope variants

**`recruitment-only`** limits erasure to:

- `Knowledge/Candidates/{Name}/`
- `Knowledge/Candidates/Insights.md` mentions
- Recruitment threads (known agency domains)
- `recruiter_triage.md`

Leaves `Knowledge/People/{Name}.md` and the wider graph intact — the person may
be a colleague or non-recruitment contact.

**`all`** (default): full erasure across knowledge base, cache, and state.
