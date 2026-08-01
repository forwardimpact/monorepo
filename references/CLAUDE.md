# References

Reference specs for things built outside this monorepo.

Each subdirectory is a self-contained record for a deliverable whose
implementation target is a **separate repository**. The record holds the spec,
the design, and the plan. Each record is a template that stays current. It is
not an archive. When this repo's libraries, skills, and standards change, we
adapt the reference spec here. Then we recreate the reference implementation
from it. The purpose is to keep it current.

They sit outside the `specs/` pipeline. The Kata loop, the release gate, and
`wiki/STATUS.md` track work that ships *from* this repo. A reference ships
elsewhere. But they are spec-shaped documents. By nature they cite prerequisite
specs, commit SHAs, dates, and version pins. So the `temporal` and
`model-defaults` invariants skip `references/**` the way they skip `specs/**`.

Create one subdirectory per referenced deliverable. Name it for what it builds.

## Keep a reference current

A reference has two artifacts to hold in agreement: the spec here, and its
implementation repository elsewhere. Work flows both ways. A defect that you
find while you build the repo flows back into the spec. An evolved library,
skill, or standard flows forward into the repo. To run a pass on one:

1. **Add the repository to this session.** Use the `add_repo` tool to bring the
   reference's repo into this session's scope. Then clone it. Now you can read
   its history and open pull requests against it from here.
2. **Reconcile the spec against reality.** Read the repo's commits since the
   last pass. The fixes made while you built it show what the spec got wrong.
   Confirm the spec still reproduces a build that works.
3. **Route each change to the layer that owns it.** A change that applies to
   every repository of this kind belongs in the skill or standard that owns it.
   It does not belong in the spec. Only reference-specific detail belongs in
   the spec. Never restate in the spec what an authoritative layer owns. Point
   to it instead.
4. **Bring the repository up to the spec.** Apply the reconciled change in the
   implementation repo so the built reference and its spec agree again.
