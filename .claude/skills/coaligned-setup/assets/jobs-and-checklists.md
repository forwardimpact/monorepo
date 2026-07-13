<!--
  Starter snippet for the CLAUDE.md "Jobs and Checklists" section. Copy it into
  the root CLAUDE.md and adapt the first line to the jobs shape chosen in Step 1:
  a single static JTBD.md, or generated .jobs blocks where per-package jobs also
  live in each README.md. The tag names and rg patterns are fixed — they are the
  discovery contract every contributor and the `coaligned` checks rely on, so
  keep them verbatim. Delete this comment after copying.
-->

## Jobs and Checklists

Jobs live in [JTBD.md](JTBD.md) — the progress each persona hires this repo for.
Tagged checklists gate pause points. Discover both with `rg`:

```sh
rg '<job '                  # Jobs To Be Done
rg '<read_do_checklist'     # entry gates — read each item, then do it
rg '<do_confirm_checklist'  # exit gates — do from memory, then confirm
```
