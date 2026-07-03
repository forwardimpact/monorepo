# References

Reference specs for things built outside this monorepo.

Each subdirectory is a self-contained record — spec, design, and plan — for a
deliverable whose implementation target is a **separate repository**. They exist
so that artifact can be re-created and audited later, not to track work on this
repo.

Because the work lives elsewhere, these are **frozen historical records**:

- They sit outside the `specs/` pipeline. The Kata spec→design→plan→implement
  loop, the release gate, and `wiki/STATUS.md` govern monorepo work, not this.
- Their dates, issue/PR references, and model ids are history, so the `temporal`
  and `model-defaults` invariants skip `references/**` the way they skip
  `specs/**`.

One subdirectory per referenced deliverable, named for what it builds.
