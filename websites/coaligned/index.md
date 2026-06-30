---
title: Co-Aligned Instruction Architecture
description: An instruction architecture for humans and coding agents — eight layers, each with one job, each independently auditable. Grounded in Jobs To Be Done and The Checklist Manifesto.
toc: false
layout: home
---

<div class="coaligned-section coaligned-hero">
  <svg class="layer-stack-hero" viewBox="0 0 64 64" aria-hidden="true">
    <rect class="layer-bar" x="10" y="54" width="44" height="4" rx="1.5" />
    <rect class="layer-bar" x="12" y="47" width="40" height="4" rx="1.5" />
    <rect class="layer-bar" x="14" y="40" width="36" height="4" rx="1.5" />
    <rect class="layer-bar" x="16" y="33" width="32" height="4" rx="1.5" />
    <rect class="layer-bar" x="18" y="26" width="28" height="4" rx="1.5" />
    <rect class="layer-bar" x="20" y="19" width="24" height="4" rx="1.5" />
    <rect class="layer-bar" x="22" y="12" width="20" height="4" rx="1.5" />
    <rect class="layer-bar layer-bar-top" x="24" y="5" width="16" height="4" rx="1.5" />
  </svg>
  <h1 class="hero-title">Coding agents that stay aligned under load</h1>
  <p class="hero-subtitle">One instruction architecture for humans and agents. Eight layers, each with a single job, each one you can audit on its own.</p>
  <div class="scroll-hint">
    <span>Scroll</span>
    <div class="scroll-line"></div>
  </div>
</div>

<div class="coaligned-section coaligned-section-cool">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Problem</div>
      <h2 class="section-headline">Instructions sprawl, and alignment breaks under load.</h2>
      <p class="section-body">Prompts pile up. Instruction chains grow unauditable. The more expert the contributor, the more readily they skip the procedure — because they think they don't need it. Co-Aligned takes the opposite path: one layered architecture where every layer owns a single job, and a defect always traces to exactly one of them.</p>
    </div>
    <div class="stats-grid stagger">
      <div class="stat-card stagger-item">
        <div class="stat-number">8</div>
        <div class="stat-label">Layers</div>
        <div class="stat-detail">Most general to most specific</div>
      </div>
      <div class="stat-card stagger-item">
        <div class="stat-number">1</div>
        <div class="stat-label">Job per layer</div>
        <div class="stat-detail">No layer restates another</div>
      </div>
      <div class="stat-card stagger-item">
        <div class="stat-number">0</div>
        <div class="stat-label">Guesswork</div>
        <div class="stat-detail">Every defect localizes to one layer</div>
      </div>
    </div>
  </div>
</div>

<div class="layer-divider">
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <rect class="layer-bar" x="2" y="11" width="12" height="2" rx="1" />
    <rect class="layer-bar" x="3" y="7" width="10" height="2" rx="1" />
    <rect class="layer-bar layer-bar-top" x="4" y="3" width="8" height="2" rx="1" />
  </svg>
</div>

<div class="coaligned-section">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Architecture</div>
      <h2 class="section-headline">Eight layers. Most general to most specific.</h2>
      <p class="section-body">Each layer loads at the right moment and owns one concern. Auto-loaded layers stay budgeted so context never bloats; on-demand layers disclose only when the work calls for them.</p>
    </div>
    <div class="layers-grid stagger">
      <div class="layer-card stagger-item">
        <div class="layer-tag">L0</div>
        <div class="layer-name">System Prompt</div>
        <p class="layer-desc">Harness mechanics: turns, tool calls, the completion signal. Nothing about your project.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L1</div>
        <div class="layer-name">CLAUDE.md</div>
        <p class="layer-desc">Project identity. What it is, who it serves, and where to find things.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L2</div>
        <div class="layer-name">CONTRIBUTING.md &amp; JTBD.md</div>
        <p class="layer-desc">Contribution standards and the jobs each persona hires the work to do.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L3</div>
        <div class="layer-name">Agent Profile</div>
        <p class="layer-desc">One persona — voice, skill routing, and scope constraints. Boundaries, not steps.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L4</div>
        <div class="layer-name">Agent References</div>
        <p class="layer-desc">Cross-cutting protocols shared across agents: memory, coordination, approval.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L5</div>
        <div class="layer-name">Skill Procedure</div>
        <p class="layer-desc">The complete, imperative steps for one domain of work — no tribal knowledge required.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L6</div>
        <div class="layer-name">Skill References</div>
        <p class="layer-desc">The data a procedure consults: templates, worked examples, lookup tables.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L7</div>
        <div class="layer-name">Checklists</div>
        <p class="layer-desc">Binary verification at a pause point. No explanation — just confirmation.</p>
      </div>
    </div>
  </div>
</div>

<div class="layer-divider">
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <rect class="layer-bar" x="2" y="11" width="12" height="2" rx="1" />
    <rect class="layer-bar" x="3" y="7" width="10" height="2" rx="1" />
    <rect class="layer-bar layer-bar-top" x="4" y="3" width="8" height="2" rx="1" />
  </svg>
</div>

<div class="coaligned-section coaligned-section-cool">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Foundations</div>
      <h2 class="section-headline">What agents align to, and how alignment holds.</h2>
      <p class="section-body">Two well-publicized ideas answer the two halves of the problem — and together they explain why the layers are shaped the way they are.</p>
    </div>
    <div class="duo-grid stagger">
      <div class="foundation-card stagger-item">
        <div class="foundation-source">Christensen &amp; Moesta</div>
        <div class="foundation-name">Jobs To Be Done</div>
        <p class="foundation-desc">What agents align to. Every layer traces to the progress a persona seeks in a specific circumstance — not to a feature list.</p>
      </div>
      <div class="foundation-card stagger-item">
        <div class="foundation-source">Atul Gawande</div>
        <div class="foundation-name">The Checklist Manifesto</div>
        <p class="foundation-desc">How alignment holds under load. Structured instructions keep existing knowledge consistently applied — by humans and agents alike.</p>
      </div>
    </div>
  </div>
</div>

<div class="layer-divider">
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <rect class="layer-bar" x="2" y="11" width="12" height="2" rx="1" />
    <rect class="layer-bar" x="3" y="7" width="10" height="2" rx="1" />
    <rect class="layer-bar layer-bar-top" x="4" y="3" width="8" height="2" rx="1" />
  </svg>
</div>

<div class="coaligned-section">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">Verification</div>
      <h2 class="section-headline">Two gates. One at entry, one at exit.</h2>
      <p class="section-body">Checklists never teach — they confirm. If an item needs explaining, the procedure above it is incomplete. Pick the right type for the moment, and the pause point stays natural instead of getting skipped.</p>
    </div>
    <div class="duo-grid stagger">
      <div class="gate-card stagger-item">
        <div class="gate-kind">Entry gate</div>
        <div class="gate-name">READ-DO</div>
        <p class="gate-desc">Read each item, then do it. Loads constraints into memory before the first line of work, when missing one sends everything in the wrong direction.</p>
      </div>
      <div class="gate-card stagger-item">
        <div class="gate-kind">Exit gate</div>
        <div class="gate-name">DO-CONFIRM</div>
        <p class="gate-desc">Do from memory, then pause and confirm. Verifies nothing was missed before a commit, merge, or release — independent checks, no interruption mid-flow.</p>
      </div>
    </div>
  </div>
</div>

<div class="coaligned-section coaligned-section-cool">
  <div class="section-inner">
    <div class="reveal">
      <h2 class="getting-started-label">Adopt it in three lines.</h2>
      <p class="getting-started-sub">Install the skill pack. Tell Claude to set it up.</p>
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
        <div class="terminal-line"><span class="terminal-prompt">&#10095; </span><span class="terminal-cmd">apm install forwardimpact/coaligned-skills</span></div>
        <div class="terminal-line"><span class="terminal-prompt">&#10095; </span><span class="terminal-cmd">echo </span><span class="terminal-string">"Set up Co-Aligned"</span><span class="terminal-cmd"> | claude</span></div>
      </div>
    </div>
    <p class="closing-note reveal">Then wire <code>npx coaligned</code> into your checks, so every layer keeps its job. Read the full standard in <a href="https://github.com/forwardimpact/monorepo/blob/main/COALIGNED.md">COALIGNED.md</a>.</p>
  </div>
</div>
