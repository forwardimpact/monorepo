---
title: Monorepo Structure Standard
description: The structure of a repository shared by humans and coding agents — six directories, three root files, and a Jobs To Be Done catalogue. Every directory and file traces back to a job.
toc: false
layout: home
---

<div class="monorepo-section monorepo-hero">
  <svg class="tree-hero" viewBox="0 0 64 64" aria-hidden="true">
    <rect class="tree-node tree-root" x="25" y="5" width="14" height="9" rx="2" />
    <path class="tree-branch" d="M32 14 V22 M14 22 H50 M14 22 V31 M32 22 V31 M50 22 V31" />
    <rect class="tree-node" x="7" y="31" width="14" height="9" rx="2" />
    <rect class="tree-node" x="25" y="31" width="14" height="9" rx="2" />
    <rect class="tree-node" x="43" y="31" width="14" height="9" rx="2" />
    <path class="tree-branch" d="M14 40 V48 M7 48 H21 M7 48 V55 M21 48 V55" />
    <rect class="tree-leaf" x="3" y="55" width="8" height="6" rx="1.5" />
    <rect class="tree-leaf" x="17" y="55" width="8" height="6" rx="1.5" />
  </svg>
  <h1 class="hero-title">Every file traces back to a job</h1>
  <p class="hero-subtitle">The structure of a repository shared by humans and coding agents. Six directories, three root files, one aim — and nothing that means nothing.</p>
  <div class="scroll-hint">
    <span>Scroll</span>
    <div class="scroll-line"></div>
  </div>
</div>

<div class="monorepo-section monorepo-section-soft">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Problem</div>
      <h2 class="section-headline">Structure without an aim is just folders.</h2>
      <p class="section-body">Most repositories grow by accretion. Files land wherever, directories mean whatever, and nobody — human or agent — can say why a thing lives where it does. Monorepo starts from the aim: every directory and every file traces back to a job someone is trying to get done.</p>
    </div>
    <div class="stats-grid stagger">
      <div class="stat-card stagger-item">
        <div class="stat-number">6</div>
        <div class="stat-label">Directories</div>
        <div class="stat-detail">Each with a README naming its jobs</div>
      </div>
      <div class="stat-card stagger-item">
        <div class="stat-number">3</div>
        <div class="stat-label">Root files</div>
        <div class="stat-detail">One job each, none restating another</div>
      </div>
      <div class="stat-card stagger-item">
        <div class="stat-number">1</div>
        <div class="stat-label">Aim</div>
        <div class="stat-detail">Every structure decision traces to it</div>
      </div>
    </div>
  </div>
</div>

<div class="tree-divider">
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <rect class="tree-node tree-root" x="6" y="2" width="4" height="3" rx="1" />
    <path class="tree-branch" d="M8 5 V8 M4 8 H12 M4 8 V11 M12 8 V11" />
    <rect class="tree-node" x="2" y="11" width="4" height="3" rx="1" />
    <rect class="tree-node" x="10" y="11" width="4" height="3" rx="1" />
  </svg>
</div>

<div class="monorepo-section">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Structure</div>
      <h2 class="section-headline">Six directories. Three ship, three support.</h2>
      <p class="section-body">Three directories carry shippable code; three support it without being shipped. Each carries a README that names the jobs it exists to serve.</p>
    </div>
    <div class="dir-band reveal">Carry shippable code</div>
    <div class="dir-grid stagger">
      <div class="dir-card stagger-item">
        <div class="dir-name">products/</div>
        <p class="dir-desc">User-facing products. Each names the personas it serves and the progress it helps them make.</p>
      </div>
      <div class="dir-card stagger-item">
        <div class="dir-name">services/</div>
        <p class="dir-desc">Long-running services consumed by products. Each captures the jobs it does for what depends on it.</p>
      </div>
      <div class="dir-card stagger-item">
        <div class="dir-name">libraries/</div>
        <p class="dir-desc">Shared code consumed by products and services, with the jobs it does for platform builders.</p>
      </div>
    </div>
    <div class="dir-band reveal">Support the code</div>
    <div class="dir-grid stagger">
      <div class="dir-card dir-card-soft stagger-item">
        <div class="dir-name">websites/</div>
        <p class="dir-desc">Documentation hubs. Every guide maps to a Big Hire or Little Hire it serves.</p>
      </div>
      <div class="dir-card dir-card-soft stagger-item">
        <div class="dir-name">wiki/</div>
        <p class="dir-desc">Shared working memory. Where humans and agents record what they learn while working.</p>
      </div>
      <div class="dir-card dir-card-soft stagger-item">
        <div class="dir-name">infrastructure/</div>
        <p class="dir-desc">Deployment assets — Docker, gateway, database, load balancer — each with its own README.</p>
      </div>
    </div>
  </div>
</div>

<div class="tree-divider">
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <rect class="tree-node tree-root" x="6" y="2" width="4" height="3" rx="1" />
    <path class="tree-branch" d="M8 5 V8 M4 8 H12 M4 8 V11 M12 8 V11" />
    <rect class="tree-node" x="2" y="11" width="4" height="3" rx="1" />
    <rect class="tree-node" x="10" y="11" width="4" height="3" rx="1" />
  </svg>
</div>

<div class="monorepo-section monorepo-section-soft">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Root Files</div>
      <h2 class="section-headline">Three files. One job each. None restates another.</h2>
      <p class="section-body">Open the repository and three files orient you immediately — a link is cheaper than a duplicate, so each points at the others rather than repeating them.</p>
    </div>
    <div class="rootfile-grid stagger">
      <div class="rootfile-card stagger-item">
        <div class="rootfile-name">CLAUDE.md</div>
        <div class="rootfile-role">Orients</div>
        <p class="rootfile-desc">What the project is, who it serves, and where to find things. Auto-loaded on every run.</p>
      </div>
      <div class="rootfile-card stagger-item">
        <div class="rootfile-name">CONTRIBUTING.md</div>
        <div class="rootfile-role">Governs</div>
        <p class="rootfile-desc">Invariants, technical rules, git workflow, security policy. Read on demand — every rule verifiable.</p>
      </div>
      <div class="rootfile-card stagger-item">
        <div class="rootfile-name">JTBD.md</div>
        <div class="rootfile-role">Catalogues</div>
        <p class="rootfile-desc">The canonical Big Hires — one entry per persona-outcome pair, capturing the progress each persona seeks.</p>
      </div>
    </div>
  </div>
</div>

<div class="tree-divider">
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <rect class="tree-node tree-root" x="6" y="2" width="4" height="3" rx="1" />
    <path class="tree-branch" d="M8 5 V8 M4 8 H12 M4 8 V11 M12 8 V11" />
    <rect class="tree-node" x="2" y="11" width="4" height="3" rx="1" />
    <rect class="tree-node" x="10" y="11" width="4" height="3" rx="1" />
  </svg>
</div>

<div class="monorepo-section">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">Jobs To Be Done</div>
      <h2 class="section-headline">The aim, made discoverable.</h2>
      <p class="section-body">Jobs live near the code that serves them. Each is wrapped in a semantic <code>&lt;job&gt;</code> tag, so anyone — human or agent — finds every job in the repository with one <code>rg</code> search, no map required.</p>
    </div>
    <div class="duo-grid stagger">
      <div class="job-card stagger-item">
        <div class="job-kind">The adoption decision</div>
        <div class="job-name">Big Hire</div>
        <p class="job-desc">Why a persona hires this product over the alternatives — including hiring nothing at all. One per persona-outcome pair, in JTBD.md.</p>
      </div>
      <div class="job-card stagger-item">
        <div class="job-kind">The repeated daily use</div>
        <div class="job-name">Little Hire</div>
        <p class="job-desc">What brings the persona back each time. Lives wherever it fits best — a product, service, or library README, a design doc, nearby code.</p>
      </div>
    </div>
  </div>
</div>

<div class="monorepo-section monorepo-section-soft">
  <div class="section-inner">
    <div class="reveal">
      <h2 class="getting-started-label">Stand one up in three lines.</h2>
      <p class="getting-started-sub">Install the packs. Tell Claude to build the skeleton.</p>
    </div>
    <div class="terminal reveal">
      <div class="terminal-bar">
        <div class="terminal-dot"></div>
        <div class="terminal-dot"></div>
        <div class="terminal-dot"></div>
        <div class="terminal-title">Terminal</div>
      </div>
      <div class="terminal-lines">
        <div class="terminal-line"><span class="terminal-prompt">&#10095; </span><span class="terminal-cmd">cd my-new-repo/</span></div>
        <div class="terminal-line"><span class="terminal-prompt">&#10095; </span><span class="terminal-cmd">apm install forwardimpact/coaligned-skills forwardimpact/kata-skills</span></div>
        <div class="terminal-line"><span class="terminal-prompt">&#10095; </span><span class="terminal-cmd">echo </span><span class="terminal-string">"Set up a Monorepo-standard repo"</span><span class="terminal-cmd"> | claude</span></div>
      </div>
    </div>
    <p class="closing-note reveal">The structure layers an <a href="https://www.coaligned.team/">instruction architecture</a> on top, and the <a href="https://www.kata.team/">Kata Agent Team</a> runs it as a daily loop. Read the full standard in <a href="https://github.com/forwardimpact/monorepo/blob/main/MONOREPO.md">MONOREPO.md</a>.</p>
  </div>
</div>
