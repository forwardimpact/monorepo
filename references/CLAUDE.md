# References

Reference specs for things built outside this monorepo.

Each subdirectory is a self-contained record — spec, design, and plan — for a
deliverable whose implementation target is a **separate repository**. These are
living templates, not archives: as this repo's libraries, skills, and standards
evolve, we adapt the reference spec here and recreate the reference
implementation from it. Keeping it current is the point.

They sit outside the `specs/` pipeline — the Kata loop, the release gate, and
`wiki/STATUS.md` track work that ships *from* this repo, and a reference ships
elsewhere. But they are spec-shaped documents that cite prerequisite specs,
commit SHAs, dates, and version pins by nature, so the `temporal` and
`model-defaults` invariants skip `references/**` the way they skip `specs/**`.

One subdirectory per referenced deliverable, named for what it builds.
