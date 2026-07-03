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

## Keeping a reference current

A reference has two artifacts to hold in agreement: the spec here, and its
implementation repository elsewhere. Work flows both ways — a defect surfaced
while building the repo flows back into the spec; an evolved library, skill, or
standard flows forward into the repo. To run a pass on one:

1. **Add the repository to this session.** Use the `add_repo` tool to bring the
   reference's repo into this session's scope, then clone it — now you can read
   its history and open pull requests against it from here.
2. **Reconcile the spec against reality.** Read the repo's commits since the
   last pass; the fixes made while building it are what the spec got wrong.
   Confirm the spec still reproduces a working build.
3. **Route each change to the layer that owns it.** A change that applies to
   every repository of this kind belongs in the owning skill or standard, not
   the spec; only reference-specific detail belongs in the spec. Never restate
   in the spec what an authoritative layer owns — point to it.
4. **Bring the repository up to the spec.** Apply the reconciled change in the
   implementation repo so the built reference and its spec agree again.
