---
title: Meta
description: The system that emerged when we built the Forward Impact products. It is Monorepo, Jidoka, and Kata.
toc: false
---

The work on the Forward Impact products surfaced a system underneath them. The
system has three layers of structure and discipline. Each layer builds on the
one below. We named the layers and made them their own thing.

---

```text
   Kata        ← autonomous agent team running PDSA
    ▲
   Jidoka      ← instruction architecture standard
    ▲
   Monorepo    ← repository structure standard
```

---

**[Monorepo](https://www.monorepo.team/)** — Repository structure standard for
humans and coding agents. Top-level directories, root files, a jobs catalogue.

**[Jidoka](https://www.jidoka.team/)** — Instruction architecture
standard grounded in Jobs-To-Be-Done (JTBD) and The Checklist Manifesto. Builds
on the Monorepo standard.

**[Kata Agent Team](https://www.kata.team/)** — An autonomous agentic
development team that runs a daily Plan-Do-Study-Act (PDSA) loop. Implements
both upstream standards.

The Forward Impact products now sit downstream and consume all three layers.
