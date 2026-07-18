---
title: Kata Agent Team
description: An autonomous, continuously improving agent team organized as a daily Plan-Do-Study-Act cycle. Three lines to set up. Zero infrastructure to maintain.
toc: false
layout: home
---

<div class="kata-section kata-hero">
  <svg class="pdsa-wheel-hero" viewBox="0 0 64 64" aria-hidden="true">
    <path class="wheel-quadrant" d="M32 4 A28 28 0 0 1 60 32 L32 32 Z" />
    <path class="wheel-quadrant" d="M60 32 A28 28 0 0 1 32 60 L32 32 Z" />
    <path class="wheel-quadrant" d="M32 60 A28 28 0 0 1 4 32 L32 32 Z" />
    <path class="wheel-quadrant" d="M4 32 A28 28 0 0 1 32 4 L32 32 Z" />
    <text class="wheel-label" x="43" y="20">P</text>
    <text class="wheel-label" x="48" y="44">D</text>
    <text class="wheel-label" x="21" y="50">S</text>
    <text class="wheel-label" x="17" y="24">A</text>
  </svg>
  <h1 class="hero-title">Autonomous coding agents that continuously improve</h1>
  <!-- enum:published-skills:count -->
  <p class="hero-subtitle">An autonomous agent team that keeps getting better — organized as a daily Plan-Do-Study-Act cycle. Eighteen skills. A focused agent roster. Zero infrastructure.</p>
  <!-- /enum -->
  <div class="scroll-hint">
    <span>Scroll</span>
    <div class="scroll-line"></div>
  </div>
</div>

<div class="kata-section kata-section-warm">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">Simplicity</div>
      <h2 class="section-headline">Agent teams fail when they get complicated.</h2>
      <p class="section-body">Most agent setups drown in infrastructure, sprawling toolchains, and unauditable prompt chains. Kata takes the opposite path — radical simplicity. Everything you need, nothing you don't.</p>
    </div>
    <div class="stats-grid stagger">
      <div class="stat-card stagger-item">
        <!-- enum:published-skills:count -->
        <div class="stat-number">18</div>
        <!-- /enum -->
        <div class="stat-label">Skills</div>
        <div class="stat-detail">Each under 200 lines of text</div>
      </div>
      <div class="stat-card stagger-item">
        <div class="stat-number">0</div>
        <div class="stat-label">Infrastructure</div>
        <div class="stat-detail">No databases, no queues, no servers</div>
      </div>
      <div class="stat-card stagger-item">
        <div class="stat-number">0</div>
        <div class="stat-label">Dependencies</div>
        <div class="stat-detail">Plain JavaScript, no third-party packages</div>
      </div>
    </div>
  </div>
</div>

<div class="pdsa-divider">
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <path class="wheel-quadrant" d="M32 4 A28 28 0 0 1 60 32 L32 32 Z" />
    <path class="wheel-quadrant" d="M60 32 A28 28 0 0 1 32 60 L32 32 Z" />
    <path class="wheel-quadrant" d="M32 60 A28 28 0 0 1 4 32 L32 32 Z" />
    <path class="wheel-quadrant" d="M4 32 A28 28 0 0 1 32 4 L32 32 Z" />
  </svg>
</div>

<div class="kata-section">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Loop</div>
      <h2 class="section-headline">One cycle. Every day.</h2>
      <p class="section-body">Every workflow maps to a phase. Findings from Study always re-enter the loop — nothing is observed without downstream action.</p>
    </div>
    <div class="pdsa-grid stagger">
      <div class="pdsa-card stagger-item">
        <div class="phase-letter">P</div>
        <div class="phase-name">Plan</div>
        <p class="phase-desc">Turn approved specs into architectural designs, then executable plans with steps, files, sequencing, and risks.</p>
      </div>
      <div class="pdsa-card stagger-item">
        <div class="phase-letter">D</div>
        <div class="phase-name">Do</div>
        <p class="phase-desc">Execute plans via implementation PRs. Run scheduled workflows that harden, release, and maintain. Every run captures a trace.</p>
      </div>
      <div class="pdsa-card stagger-item">
        <div class="phase-letter">S</div>
        <div class="phase-name">Study</div>
        <p class="phase-desc">Analyze outputs across four streams: security audits, feedback triage, documentation review, and grounded theory from traces.</p>
      </div>
      <div class="pdsa-card stagger-item">
        <div class="phase-letter">A</div>
        <div class="phase-name">Act</div>
        <p class="phase-desc">Trivial findings become fix PRs. Structural findings become spec documents. Fix and spec branches never mix.</p>
      </div>
    </div>
  </div>
</div>

<div class="pdsa-divider">
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <path class="wheel-quadrant" d="M32 4 A28 28 0 0 1 60 32 L32 32 Z" />
    <path class="wheel-quadrant" d="M60 32 A28 28 0 0 1 32 60 L32 32 Z" />
    <path class="wheel-quadrant" d="M32 60 A28 28 0 0 1 4 32 L32 32 Z" />
    <path class="wheel-quadrant" d="M4 32 A28 28 0 0 1 32 4 L32 32 Z" />
  </svg>
</div>

<div class="kata-section kata-section-warm">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Team</div>
      <h2 class="section-headline">Eight agents. Explicit scope.</h2>
      <p class="section-body">Each persona knows what it must do — and what it must not. When a finding exceeds scope, the agent writes a spec rather than attempting the fix.</p>
    </div>
    <div class="agents-grid stagger">
      <div class="agent-card stagger-item">
        <span class="agent-icon">&#x1f4d0;</span>
        <div class="agent-name">Staff Engineer</div>
        <div class="agent-phase">Plan &middot; Do</div>
        <p class="agent-desc">Owns the full spec, design, plan, implement arc for approved specs.</p>
      </div>
      <div class="agent-card stagger-item">
        <span class="agent-icon">&#x1f4e6;</span>
        <div class="agent-name">Release Engineer</div>
        <div class="agent-phase">Do</div>
        <p class="agent-desc">Keeps PR branches merge-ready, repairs CI, cuts releases. The sole external merge point.</p>
      </div>
      <div class="agent-card stagger-item">
        <span class="agent-icon">&#x1f512;</span>
        <div class="agent-name">Security Engineer</div>
        <div class="agent-phase">Do &middot; Study &middot; Act</div>
        <p class="agent-desc">Patches dependencies, hardens supply chain, enforces security policies.</p>
      </div>
      <div class="agent-card stagger-item">
        <span class="agent-icon">&#x1f9f9;</span>
        <div class="agent-name">DevEx Engineer</div>
        <div class="agent-phase">Do &middot; Study &middot; Act</div>
        <p class="agent-desc">Audits codebase health, reviews maintainability, and clears debt without changing behavior.</p>
      </div>
      <div class="agent-card stagger-item">
        <span class="agent-icon">&#x1f4cb;</span>
        <div class="agent-name">Product Manager</div>
        <div class="agent-phase">Study &middot; Act</div>
        <p class="agent-desc">Triages issues against product vision, reviews spec quality, runs evaluations.</p>
      </div>
      <div class="agent-card stagger-item">
        <span class="agent-icon">&#x1f4dd;</span>
        <div class="agent-name">Technical Writer</div>
        <div class="agent-phase">Study &middot; Act</div>
        <p class="agent-desc">Reviews docs for accuracy, curates agent memory, fixes staleness.</p>
      </div>
      <div class="agent-card stagger-item">
        <span class="agent-icon">&#x1f5c4;</span>
        <div class="agent-name">Archivist</div>
        <div class="agent-phase">Study &middot; Act</div>
        <p class="agent-desc">Retires stale logs, storyboards, and completed or cancelled specs once their signal is safely preserved.</p>
      </div>
      <div class="agent-card stagger-item">
        <span class="agent-icon">&#x2b55;</span>
        <div class="agent-name">Improvement Coach</div>
        <div class="agent-phase">Study</div>
        <p class="agent-desc">Facilitates the daily storyboard meeting and 1-on-1 coaching sessions.</p>
      </div>
    </div>
  </div>
</div>

<div class="pdsa-divider">
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <path class="wheel-quadrant" d="M32 4 A28 28 0 0 1 60 32 L32 32 Z" />
    <path class="wheel-quadrant" d="M60 32 A28 28 0 0 1 32 60 L32 32 Z" />
    <path class="wheel-quadrant" d="M32 60 A28 28 0 0 1 4 32 L32 32 Z" />
    <path class="wheel-quadrant" d="M4 32 A28 28 0 0 1 32 4 L32 32 Z" />
  </svg>
</div>

<div class="kata-section">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">Surfaces</div>
      <h2 class="section-headline">Same agents. Every surface.</h2>
      <p class="section-body">The same profiles and skills operate identically whether triggered by your IDE, a cron schedule, a GitHub event, or a bridged message.</p>
    </div>
    <div class="surfaces-grid stagger">
      <div class="surface-item stagger-item">
        <span class="surface-icon">&#x1f4bb;</span>
        <div class="surface-name">IDE</div>
        <div class="surface-mechanism">Direct invocation</div>
      </div>
      <div class="surface-item stagger-item">
        <span class="surface-icon">&#x23f0;</span>
        <div class="surface-name">Scheduled Shifts</div>
        <div class="surface-mechanism">Cron &rarr; kata-shift</div>
      </div>
      <div class="surface-item stagger-item">
        <span class="surface-icon">&#x1f4a1;</span>
        <div class="surface-name">GitHub Issues</div>
        <div class="surface-mechanism">Event &rarr; kata-dispatch</div>
      </div>
      <div class="surface-item stagger-item">
        <span class="surface-icon">&#x1f500;</span>
        <div class="surface-name">GitHub PRs</div>
        <div class="surface-mechanism">Event &rarr; kata-dispatch</div>
      </div>
      <div class="surface-item stagger-item">
        <span class="surface-icon">&#x1f4ac;</span>
        <div class="surface-name">GitHub Discussions</div>
        <div class="surface-mechanism">Bridge &rarr; kata-dispatch</div>
      </div>
      <div class="surface-item stagger-item">
        <span class="surface-icon">&#x1f4e8;</span>
        <div class="surface-name">Microsoft Teams</div>
        <div class="surface-mechanism">Bridge &rarr; kata-dispatch</div>
      </div>
    </div>
  </div>
</div>

<div class="kata-section kata-section-warm">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">Shared Memory</div>
      <h2 class="section-headline">One Git repo of markdown files.</h2>
      <p class="section-body">Every agent reads and writes the same wiki — priorities, logs, metrics, and storyboards. A scheduled shift, a bridge-dispatched message, and an IDE session all share the same state. No database. Just markdown in a Git repository.</p>
    </div>
  </div>
</div>

<div class="kata-section">
  <div class="section-inner">
    <div class="reveal">
      <h2 class="getting-started-label">Three lines. That's it.</h2>
      <p class="getting-started-sub">Install the skill pack. Tell Claude to set up the team.</p>
    </div>
    <div class="terminal reveal">
      <div class="terminal-bar">
        <div class="terminal-dot"></div>
        <div class="terminal-dot"></div>
        <div class="terminal-dot"></div>
        <div class="terminal-title">Terminal</div>
      </div>
      <div class="terminal-lines">
        <div class="terminal-line"><span class="terminal-prompt">&#10095; </span><span class="terminal-cmd">cd my-repo/</span></div>
        <div class="terminal-line"><span class="terminal-prompt">&#10095; </span><span class="terminal-cmd">apm install forwardimpact/kata-skills</span></div>
        <div class="terminal-line"><span class="terminal-prompt">&#10095; </span><span class="terminal-cmd">echo </span><span class="terminal-string">"Setup the Kata Team"</span><span class="terminal-cmd"> | claude</span></div>
      </div>
    </div>
  </div>
</div>
