---
title: Kata Agent Team
description: An agent team that improves itself on a daily Plan-Do-Study-Act cycle. You set it up with three commands, and you maintain no infrastructure.
toc: false
layout: home
---

<div class="kata-section kata-hero">
  <svg class="pdsa-wheel-hero reveal" viewBox="0 0 124 124" role="img" aria-label="The Plan-Do-Study-Act loop, four arrows circling clockwise">
    <circle class="wheel-rim" cx="62" cy="62" r="34" fill="url(#kata-medallion-rim)" />
    <circle class="wheel-face" cx="62" cy="62" r="25" fill="url(#kata-medallion-face)" />
    <path class="wheel-arrow" d="M65.2 25.1 A37 37 0 0 1 94 43.5 L90.6 45.5 L102.8 51.8 L106.2 36.5 L102.7 38.5 A47 47 0 0 0 66.1 15.2 Z" fill="url(#kata-arrow)" />
    <path class="wheel-arrow" d="M98.9 65.2 A37 37 0 0 1 80.5 94 L78.5 90.6 L72.2 102.8 L87.5 106.2 L85.5 102.7 A47 47 0 0 0 108.8 66.1 Z" fill="url(#kata-arrow)" />
    <path class="wheel-arrow" d="M58.8 98.9 A37 37 0 0 1 30 80.5 L33.4 78.5 L21.2 72.2 L17.8 87.5 L21.3 85.5 A47 47 0 0 0 57.9 108.8 Z" fill="url(#kata-arrow)" />
    <path class="wheel-arrow" d="M25.1 58.8 A37 37 0 0 1 43.5 30 L45.5 33.4 L51.8 21.2 L36.5 17.8 L38.5 21.3 A47 47 0 0 0 15.2 57.9 Z" fill="url(#kata-arrow)" />
    <text class="wheel-label" x="74.4" y="49.6" text-anchor="middle" dominant-baseline="central">P</text>
    <text class="wheel-label" x="74.4" y="74.4" text-anchor="middle" dominant-baseline="central">D</text>
    <text class="wheel-label" x="49.6" y="74.4" text-anchor="middle" dominant-baseline="central">S</text>
    <text class="wheel-label" x="49.6" y="49.6" text-anchor="middle" dominant-baseline="central">A</text>
    <circle class="wheel-hub" cx="62" cy="62" r="10" fill="url(#kata-hub)" />
  </svg>
  <h1 class="hero-title">Autonomous coding agents that continuously improve</h1>
  <!-- enum:published-skills:count -->
  <p class="hero-subtitle">An agent team that improves itself on a daily Plan-Do-Study-Act cycle. It ships nineteen skills and a small agent roster, and you maintain no infrastructure.</p>
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
      <p class="section-body">Most agent setups grow heavy infrastructure, large toolchains, and prompt chains that no one can audit. Kata keeps the setup small, so you get the parts the team needs and nothing else.</p>
    </div>
    <div class="stats-grid stagger">
      <div class="stat-card stagger-item">
        <!-- enum:published-skills:count -->
        <div class="stat-number">19</div>
        <!-- /enum -->
        <div class="stat-label">Skills</div>
        <div class="stat-detail">Each under 200 lines of text</div>
      </div>
      <div class="stat-card stagger-item">
        <div class="stat-number">0</div>
        <div class="stat-label">Infrastructure</div>
        <div class="stat-detail">It needs no database, queue, or server</div>
      </div>
      <div class="stat-card stagger-item">
        <div class="stat-number">0</div>
        <div class="stat-label">Dependencies</div>
        <div class="stat-detail">Plain JavaScript with no third-party packages</div>
      </div>
    </div>
  </div>
</div>

<div class="pdsa-divider">
  <svg class="reveal" viewBox="0 0 124 124" aria-hidden="true">
    <path class="wheel-arrow" d="M65.2 25.1 A37 37 0 0 1 94 43.5 L90.6 45.5 L102.8 51.8 L106.2 36.5 L102.7 38.5 A47 47 0 0 0 66.1 15.2 Z" fill="url(#kata-arrow)" />
    <path class="wheel-arrow" d="M98.9 65.2 A37 37 0 0 1 80.5 94 L78.5 90.6 L72.2 102.8 L87.5 106.2 L85.5 102.7 A47 47 0 0 0 108.8 66.1 Z" fill="url(#kata-arrow)" />
    <path class="wheel-arrow" d="M58.8 98.9 A37 37 0 0 1 30 80.5 L33.4 78.5 L21.2 72.2 L17.8 87.5 L21.3 85.5 A47 47 0 0 0 57.9 108.8 Z" fill="url(#kata-arrow)" />
    <path class="wheel-arrow" d="M25.1 58.8 A37 37 0 0 1 43.5 30 L45.5 33.4 L51.8 21.2 L36.5 17.8 L38.5 21.3 A47 47 0 0 0 15.2 57.9 Z" fill="url(#kata-arrow)" />
  </svg>
</div>

<div class="kata-section">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Loop</div>
      <h2 class="section-headline">The team runs one cycle every day.</h2>
      <p class="section-body">Each workflow belongs to one phase of the cycle. Every finding from the Study phase goes back into the loop as an action.</p>
    </div>
    <div class="pdsa-grid stagger">
      <div class="pdsa-card stagger-item">
        <div class="phase-letter">P</div>
        <div class="phase-name">Plan</div>
        <p class="phase-desc">Turn an approved spec into a design, and then turn the design into a plan with steps, files, sequence, and risks.</p>
      </div>
      <div class="pdsa-card stagger-item">
        <div class="phase-letter">D</div>
        <div class="phase-name">Do</div>
        <p class="phase-desc">Carry out each plan through implementation pull requests, and run the scheduled workflows that harden, release, and maintain the repository. Every run records a trace.</p>
      </div>
      <div class="pdsa-card stagger-item">
        <div class="phase-letter">S</div>
        <div class="phase-name">Study</div>
        <p class="phase-desc">Read the output in four streams: security audits, feedback triage, documentation review, and grounded-theory analysis of traces.</p>
      </div>
      <div class="pdsa-card stagger-item">
        <div class="phase-letter">A</div>
        <div class="phase-name">Act</div>
        <p class="phase-desc">A small finding becomes a fix pull request, and a structural finding becomes a spec document. The two kinds of branch stay separate.</p>
      </div>
    </div>
  </div>
</div>

<div class="pdsa-divider">
  <svg class="reveal" viewBox="0 0 124 124" aria-hidden="true">
    <path class="wheel-arrow" d="M65.2 25.1 A37 37 0 0 1 94 43.5 L90.6 45.5 L102.8 51.8 L106.2 36.5 L102.7 38.5 A47 47 0 0 0 66.1 15.2 Z" fill="url(#kata-arrow)" />
    <path class="wheel-arrow" d="M98.9 65.2 A37 37 0 0 1 80.5 94 L78.5 90.6 L72.2 102.8 L87.5 106.2 L85.5 102.7 A47 47 0 0 0 108.8 66.1 Z" fill="url(#kata-arrow)" />
    <path class="wheel-arrow" d="M58.8 98.9 A37 37 0 0 1 30 80.5 L33.4 78.5 L21.2 72.2 L17.8 87.5 L21.3 85.5 A47 47 0 0 0 57.9 108.8 Z" fill="url(#kata-arrow)" />
    <path class="wheel-arrow" d="M25.1 58.8 A37 37 0 0 1 43.5 30 L45.5 33.4 L51.8 21.2 L36.5 17.8 L38.5 21.3 A47 47 0 0 0 15.2 57.9 Z" fill="url(#kata-arrow)" />
  </svg>
</div>

<div class="kata-section kata-section-warm">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Team</div>
      <h2 class="section-headline">Each of the eight agents has a written scope.</h2>
      <p class="section-body">Each agent profile states what the agent does and what it must leave alone. When an agent finds a problem outside its scope, it writes a spec instead of a fix.</p>
    </div>
    <div class="agents-grid stagger">
      <div class="agent-card stagger-item">
        <span class="agent-icon">&#x1f4d0;</span>
        <div class="agent-name">Staff Engineer</div>
        <div class="agent-phase">Plan &middot; Do</div>
        <p class="agent-desc">Takes an approved spec through design, plan, and implementation.</p>
      </div>
      <div class="agent-card stagger-item">
        <span class="agent-icon">&#x1f4e6;</span>
        <div class="agent-name">Release Engineer</div>
        <div class="agent-phase">Do</div>
        <p class="agent-desc">Keeps pull request branches ready to merge, repairs CI, and cuts releases. It is the only agent that merges outside contributions.</p>
      </div>
      <div class="agent-card stagger-item">
        <span class="agent-icon">&#x1f512;</span>
        <div class="agent-name">Security Engineer</div>
        <div class="agent-phase">Do &middot; Study &middot; Act</div>
        <p class="agent-desc">Patches dependencies, secures the supply chain, and applies the security policies.</p>
      </div>
      <div class="agent-card stagger-item">
        <span class="agent-icon">&#x1f9f9;</span>
        <div class="agent-name">DevEx Engineer</div>
        <div class="agent-phase">Do &middot; Study &middot; Act</div>
        <p class="agent-desc">Audits code health, reviews maintainability, and removes debt without a change in behavior.</p>
      </div>
      <div class="agent-card stagger-item">
        <span class="agent-icon">&#x1f4cb;</span>
        <div class="agent-name">Product Manager</div>
        <div class="agent-phase">Study &middot; Act</div>
        <p class="agent-desc">Triages issues against the product vision, reviews spec quality, and runs evaluations.</p>
      </div>
      <div class="agent-card stagger-item">
        <span class="agent-icon">&#x1f4dd;</span>
        <div class="agent-name">Technical Writer</div>
        <div class="agent-phase">Study &middot; Act</div>
        <p class="agent-desc">Reviews the docs for accuracy, curates agent memory, and fixes stale pages.</p>
      </div>
      <div class="agent-card stagger-item">
        <span class="agent-icon">&#x1f5c4;</span>
        <div class="agent-name">Archivist</div>
        <div class="agent-phase">Study &middot; Act</div>
        <p class="agent-desc">Retires old logs, storyboards, and completed or cancelled specs after their useful content is saved elsewhere.</p>
      </div>
      <div class="agent-card stagger-item">
        <span class="agent-icon">&#x2b55;</span>
        <div class="agent-name">Improvement Coach</div>
        <div class="agent-phase">Study</div>
        <p class="agent-desc">Runs the daily storyboard meeting and the one-on-one coaching sessions.</p>
      </div>
    </div>
  </div>
</div>

<div class="pdsa-divider">
  <svg class="reveal" viewBox="0 0 124 124" aria-hidden="true">
    <path class="wheel-arrow" d="M65.2 25.1 A37 37 0 0 1 94 43.5 L90.6 45.5 L102.8 51.8 L106.2 36.5 L102.7 38.5 A47 47 0 0 0 66.1 15.2 Z" fill="url(#kata-arrow)" />
    <path class="wheel-arrow" d="M98.9 65.2 A37 37 0 0 1 80.5 94 L78.5 90.6 L72.2 102.8 L87.5 106.2 L85.5 102.7 A47 47 0 0 0 108.8 66.1 Z" fill="url(#kata-arrow)" />
    <path class="wheel-arrow" d="M58.8 98.9 A37 37 0 0 1 30 80.5 L33.4 78.5 L21.2 72.2 L17.8 87.5 L21.3 85.5 A47 47 0 0 0 57.9 108.8 Z" fill="url(#kata-arrow)" />
    <path class="wheel-arrow" d="M25.1 58.8 A37 37 0 0 1 43.5 30 L45.5 33.4 L51.8 21.2 L36.5 17.8 L38.5 21.3 A47 47 0 0 0 15.2 57.9 Z" fill="url(#kata-arrow)" />
  </svg>
</div>

<div class="kata-section">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">Surfaces</div>
      <h2 class="section-headline">The same agents work on every surface.</h2>
      <p class="section-body">Your IDE, a cron schedule, a GitHub event, or a bridged chat message all start the same profiles and skills, and the agents behave the same way in each case.</p>
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
        <div class="surface-mechanism">Cron &rarr; agent-shift</div>
      </div>
      <div class="surface-item stagger-item">
        <span class="surface-icon">&#x1f4a1;</span>
        <div class="surface-name">GitHub Issues</div>
        <div class="surface-mechanism">Event &rarr; agent-dispatch</div>
      </div>
      <div class="surface-item stagger-item">
        <span class="surface-icon">&#x1f500;</span>
        <div class="surface-name">GitHub PRs</div>
        <div class="surface-mechanism">Event &rarr; agent-dispatch</div>
      </div>
      <div class="surface-item stagger-item">
        <span class="surface-icon">&#x1f4ac;</span>
        <div class="surface-name">GitHub Discussions</div>
        <div class="surface-mechanism">Bridge &rarr; agent-dispatch</div>
      </div>
      <div class="surface-item stagger-item">
        <span class="surface-icon">&#x1f4e8;</span>
        <div class="surface-name">Microsoft Teams</div>
        <div class="surface-mechanism">Bridge &rarr; agent-dispatch</div>
      </div>
    </div>
  </div>
</div>

<div class="kata-section kata-section-warm">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">Shared Memory</div>
      <h2 class="section-headline">Shared memory is one Git repository of markdown files.</h2>
      <p class="section-body">Every agent reads and writes the same wiki, which holds priorities, logs, metrics, and storyboards. A scheduled shift, a message from a bridge, and an IDE session all share this state. The wiki needs no database, because it is a set of markdown files in a Git repository.</p>
    </div>
  </div>
</div>

<div class="kata-section">
  <div class="section-inner">
    <div class="reveal">
      <h2 class="getting-started-label">Set up the team with three commands.</h2>
      <p class="getting-started-sub">Install the skill pack, then ask Claude to set up the team.</p>
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
    <p class="closing-note reveal">Follow the full path in <a href="/docs/getting-started/">Get started</a>, then read the <a href="/docs/">documentation</a>.</p>
  </div>
</div>
