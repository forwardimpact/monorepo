---
title: Jidoka Instruction Architecture
description: Built-in quality for agent instructions. Eight layers each hold one job. Checks stop the line the moment a layer drifts. Grounded in Jidoka, Jobs To Be Done, and The Checklist Manifesto.
toc: false
layout: home
---

<div class="jidoka-section jidoka-hero">
  <svg class="layer-stack-hero" viewBox="0 0 64 64" role="img" aria-label="An andon lamp lit above eight stepped instruction layers">
    <rect class="layer-bar" x="10" y="54" width="44" height="4" rx="1.5" />
    <rect class="layer-bar" x="12" y="49" width="40" height="4" rx="1.5" />
    <rect class="layer-bar" x="14" y="44" width="36" height="4" rx="1.5" />
    <rect class="layer-bar" x="16" y="39" width="32" height="4" rx="1.5" />
    <rect class="layer-bar" x="18" y="34" width="28" height="4" rx="1.5" />
    <rect class="layer-bar" x="20" y="29" width="24" height="4" rx="1.5" />
    <rect class="layer-bar" x="22" y="24" width="20" height="4" rx="1.5" />
    <rect class="layer-bar layer-bar-top" x="24" y="19" width="16" height="4" rx="1.5" />
    <line class="layer-cord" x1="32" y1="58" x2="32" y2="7" />
    <circle class="layer-lamp" cx="32" cy="7" r="4" />
  </svg>
  <h1 class="hero-title">Build quality into agent instructions</h1>
  <p class="hero-subtitle">One instruction architecture for humans and agents. Eight layers each hold a single job. Checks stop the line the moment a layer drifts.</p>
  <div class="scroll-hint">
    <span>Scroll</span>
    <div class="scroll-line"></div>
  </div>
</div>

<div class="jidoka-section jidoka-section-cool">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Problem</div>
      <h2 class="section-headline">Instructions sprawl. Nothing stops the drift.</h2>
      <p class="section-body">Prompts pile up. Layers restate each other. Jobs go stale. Nobody notices until an agent misbehaves. Jidoka takes the Toyota path and builds quality into the process itself. In one layered architecture, every layer owns a single job and carries a machine-checkable budget. A defect then traces to exactly one layer. The line stops before the defect ships.</p>
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
    <rect class="layer-bar" x="2" y="13" width="12" height="2" rx="1" />
    <rect class="layer-bar" x="4" y="9" width="8" height="2" rx="1" />
    <rect class="layer-bar layer-bar-top" x="6" y="5" width="4" height="2" rx="1" />
    <circle class="layer-lamp" cx="8" cy="2" r="1.3" />
  </svg>
</div>

<div class="jidoka-section">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Architecture</div>
      <h2 class="section-headline">Eight layers. Most general to most specific.</h2>
      <p class="section-body">Each layer loads at the right moment and owns one concern. Auto-loaded layers stay budgeted, so context never bloats. On-demand layers disclose only when the work calls for them.</p>
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
        <p class="layer-desc">Project identity: what it is, who it serves, and where to find its jobs and checklists.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L2</div>
        <div class="layer-name">CONTRIBUTING.md &amp; JTBD.md</div>
        <p class="layer-desc">Contribution standards and the jobs each persona hires the work to do.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L3</div>
        <div class="layer-name">Agent Profile</div>
        <p class="layer-desc">One persona: voice, skill routing, and scope constraints. It sets boundaries. It does not give steps.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L4</div>
        <div class="layer-name">Agent References</div>
        <p class="layer-desc">Cross-cutting protocols shared across agents: memory, coordination, approval.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L5</div>
        <div class="layer-name">Skill Procedure</div>
        <p class="layer-desc">The complete, imperative steps for one domain of work. They need no tribal knowledge.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L6</div>
        <div class="layer-name">Skill References</div>
        <p class="layer-desc">The data a procedure consults: templates, worked examples, lookup tables.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L7</div>
        <div class="layer-name">Checklists</div>
        <p class="layer-desc">Binary verification at a pause point. It confirms. It does not explain.</p>
      </div>
    </div>
  </div>
</div>

<div class="layer-divider">
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <rect class="layer-bar" x="2" y="13" width="12" height="2" rx="1" />
    <rect class="layer-bar" x="4" y="9" width="8" height="2" rx="1" />
    <rect class="layer-bar layer-bar-top" x="6" y="5" width="4" height="2" rx="1" />
    <circle class="layer-lamp" cx="8" cy="2" r="1.3" />
  </svg>
</div>

<div class="jidoka-section jidoka-section-cool">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Foundations</div>
      <h2 class="section-headline">What agents align to, and how alignment holds.</h2>
      <p class="section-body">Three well-publicized ideas answer the halves of the problem. Together they explain why the layers have the shape they have. They also explain why the checks stop the line.</p>
    </div>
    <div class="duo-grid stagger">
      <div class="foundation-card stagger-item">
        <div class="foundation-source">Toyota</div>
        <div class="foundation-name">Jidoka</div>
        <p class="foundation-desc">How quality holds. The process builds in quality. Inspection afterward does not. The checks halt at the first defect. They never pass one downstream.</p>
      </div>
      <div class="foundation-card stagger-item">
        <div class="foundation-source">Christensen &amp; Moesta</div>
        <div class="foundation-name">Jobs To Be Done</div>
        <p class="foundation-desc">What agents align to. Every layer traces to the progress a persona seeks in a specific circumstance. No layer traces to a feature list.</p>
      </div>
      <div class="foundation-card stagger-item">
        <div class="foundation-source">Atul Gawande</div>
        <div class="foundation-name">The Checklist Manifesto</div>
        <p class="foundation-desc">How alignment holds under load. Structured instructions keep humans and agents consistent in how they apply existing knowledge.</p>
      </div>
    </div>
  </div>
</div>

<div class="layer-divider">
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <rect class="layer-bar" x="2" y="13" width="12" height="2" rx="1" />
    <rect class="layer-bar" x="4" y="9" width="8" height="2" rx="1" />
    <rect class="layer-bar layer-bar-top" x="6" y="5" width="4" height="2" rx="1" />
    <circle class="layer-lamp" cx="8" cy="2" r="1.3" />
  </svg>
</div>

<div class="jidoka-section">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">Verification</div>
      <h2 class="section-headline">Two gates. One at entry, one at exit.</h2>
      <p class="section-body">Checklists never teach. They confirm. If you must explain an item, the procedure above it is incomplete. A semantic <code>&lt;read_do_checklist&gt;</code> or <code>&lt;do_confirm_checklist&gt;</code> tag wraps each gate. Every pause point in the repository is then one <code>rg</code> search away. You need no map.</p>
    </div>
    <div class="duo-grid stagger">
      <div class="gate-card stagger-item">
        <div class="gate-kind">Entry gate</div>
        <div class="gate-name">READ-DO</div>
        <p class="gate-desc">Read each item, then do it. The gate loads constraints into memory before the first line of work. At that moment, one missed constraint sends everything in the wrong direction.</p>
        <code class="gate-find">rg '&lt;read_do_checklist'</code>
      </div>
      <div class="gate-card stagger-item">
        <div class="gate-kind">Exit gate</div>
        <div class="gate-name">DO-CONFIRM</div>
        <p class="gate-desc">Do from memory, then pause and confirm. The gate verifies that you missed nothing before a commit, merge, or release. The checks stay independent. They do not interrupt you mid-flow.</p>
        <code class="gate-find">rg '&lt;do_confirm_checklist'</code>
      </div>
    </div>
  </div>
</div>

<div class="jidoka-section jidoka-section-cool">
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
        <div class="terminal-line"><span class="terminal-prompt">&#10095; </span><span class="terminal-cmd">apm install forwardimpact/jidoka-skills</span></div>
        <div class="terminal-line"><span class="terminal-prompt">&#10095; </span><span class="terminal-cmd">echo </span><span class="terminal-string">"Set up Jidoka"</span><span class="terminal-cmd"> | claude</span></div>
      </div>
    </div>
    <p class="closing-note reveal">Then wire the <code>jidoka</code> binary (or <code>npx @forwardimpact/jidoka</code>) into your checks, so the line stops at the first drifted layer. Read the full standard in the <a href="/docs/layered-instructions/">layered instruction architecture guide</a>.</p>
  </div>
</div>
