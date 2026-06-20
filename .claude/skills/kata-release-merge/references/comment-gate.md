# Open Comment Gate — Resolution Model

The STATUS approval signal in `wiki/STATUS.md` says ready-to-merge. A fresh,
unaddressed concern from a trusted human contributor overrides it — do not
close a thread on behalf of a human who has not yet reacted.

## Procedure

`read` the change's discussion thread
([work-trackers.md](../../../agents/references/work-trackers.md)).
For each top-7 human contributor (kata-release-merge Step 2 lookup) who has
commented on the PR, read their **most recent** comment. If it raises a
concern, question, or objection that has not been resolved by a **later**
comment from the **same** human acknowledging or accepting the response, mark
**blocked** with reason `awaiting trusted-contributor reply`.

## What Does and Does Not Resolve the Gate

- **A bot reply** (`product-manager`, `staff-engineer`, etc.) addressing the
  concern does **not** resolve it — the trusted human must respond. The bot
  cannot speak for the human.
- **A later comment from the same human** acknowledging or accepting the
  response resolves the gate. Different humans do not substitute.
- **An explicit approval signal from a trusted human** — label applied,
  APPROVED review submitted, or merge performed by that human — overrides the
  gate. These are direct resolution: the human has spoken with their hands on
  the keyboard.

## Why This Matters

Speed of merge is not consent. A merge posted seconds after a substantive
revision request, citing "all gates pass," treats the comment thread as
ornamental. The gate exists so that humans who took the time to write feedback
are not bypassed by a bot that finished its checks first. The block is **held
open** until the human who raised the concern has the chance to either accept
the response or supply an explicit override signal.

The cost of waiting is small — a few minutes to hours. The cost of merging
through an unaddressed concern is a broken trust loop: contributors stop
commenting when comments are treated as no-ops.
