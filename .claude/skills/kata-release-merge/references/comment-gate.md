# Open Comment Gate — Resolution Model

The STATUS approval signal in `wiki/STATUS.md` says ready-to-merge. A fresh,
unaddressed concern from a trusted human contributor overrides it. Do not close
a thread on behalf of a human who did not react yet.

## Procedure

`read` the change's discussion thread
([work-trackers.md](../../../agents/x-work-trackers.md)).
For each trusted human contributor (kata-release-merge Step 2 resolution) who
commented on the PR, read their **most recent** comment. If it raises a
concern, question, or objection, look for a **later** comment from the **same**
human that acknowledges or accepts the response. If no such comment exists,
mark the PR **blocked** with reason `awaiting trusted-contributor reply`.

## What Does and Does Not Resolve the Gate

- **A bot reply** (`product-manager`, `staff-engineer`, etc.) that addresses
  the concern does **not** resolve it. The trusted human must respond. The bot
  cannot speak for the human.
- **A later comment from the same human** resolves the gate when it
  acknowledges or accepts the response. Different humans do not substitute.
- **An explicit approval signal from a trusted human** overrides the gate. That
  signal is a label applied, an APPROVED review submitted, or a merge performed
  by that human. These are direct resolution. The human spoke with their hands
  on the keyboard.

## Why This Matters

Speed of merge is not consent. A merge that lands seconds after a substantive
revision request treats the comment thread as ornamental, even when it cites
"all gates pass". The gate exists so that a bot which finishes its checks first
does not bypass the humans who took the time to write feedback. Hold the block
open until the human who raised the concern gets the chance to accept the
response or to supply an explicit override signal.

The cost of a wait is small. It runs from a few minutes to a few hours. A merge
through an unaddressed concern breaks the trust loop. Contributors write no
more comments when their comments become no-ops.
