---
title: Jidoka Instruction Architecture
description: Built-in quality for agent instructions. Eight layers each hold one job. One command stops the line the moment a layer drifts, a job goes stale, or an invariant breaks.
toc: false
layout: home
---

<div class="jidoka-section jidoka-hero">
  <svg class="layer-stack-hero reveal" viewBox="0 0 100 150" role="img" aria-label="An andon lamp lit above eight stepped instruction layers">
    <ellipse class="layer-pedestal" cx="50" cy="144" rx="38" ry="4" />
    <rect class="layer-cord" x="47" y="37" width="6" height="103" rx="3" fill="url(#jidoka-cord)" />
    <rect class="layer-bar" x="16" y="132" width="68" height="8" rx="2" fill="url(#jidoka-bar)" />
    <rect class="layer-bar" x="20" y="120" width="60" height="8" rx="2" fill="url(#jidoka-bar)" />
    <rect class="layer-bar" x="24" y="108" width="52" height="8" rx="2" fill="url(#jidoka-bar)" />
    <rect class="layer-bar" x="28" y="96" width="44" height="8" rx="2" fill="url(#jidoka-bar)" />
    <rect class="layer-bar" x="32" y="84" width="36" height="8" rx="2" fill="url(#jidoka-bar)" />
    <rect class="layer-bar" x="36" y="72" width="28" height="8" rx="2" fill="url(#jidoka-bar)" />
    <rect class="layer-bar" x="40" y="60" width="20" height="8" rx="2" fill="url(#jidoka-bar)" />
    <rect class="layer-bar layer-bar-top" x="44" y="48" width="12" height="8" rx="2" fill="url(#jidoka-bar-top)" />
    <circle class="layer-glow" cx="50" cy="26" r="28" />
    <circle class="layer-glow" cx="50" cy="26" r="22" />
    <circle class="layer-glow" cx="50" cy="26" r="17" />
    <circle class="layer-lamp" cx="50" cy="26" r="11" fill="url(#jidoka-lamp)" />
  </svg>
  <h1 class="hero-title">Build quality into agent instructions</h1>
  <p class="hero-subtitle">One instruction architecture for humans and agents. Eight layers each hold a single job. One command stops the line the moment a layer drifts, a job goes stale, or an invariant breaks.</p>
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
        <div class="stat-detail">One job each. No layer restates another</div>
      </div>
      <div class="stat-card stagger-item">
        <div class="stat-number">3</div>
        <div class="stat-label">Checks</div>
        <div class="stat-detail">One per class of defect</div>
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
  <svg class="reveal" viewBox="0 0 60 94" aria-hidden="true">
    <ellipse class="layer-pedestal" cx="30" cy="80" rx="22" ry="3" />
    <rect class="layer-bar" x="10" y="68" width="40" height="8" rx="2" fill="url(#jidoka-bar)" />
    <rect class="layer-bar" x="16" y="52" width="28" height="8" rx="2" fill="url(#jidoka-bar)" />
    <rect class="layer-bar layer-bar-top" x="22" y="36" width="16" height="8" rx="2" fill="url(#jidoka-bar-top)" />
    <circle class="layer-glow" cx="30" cy="20" r="18" />
    <circle class="layer-glow" cx="30" cy="20" r="15" />
    <circle class="layer-glow" cx="30" cy="20" r="12" />
    <circle class="layer-lamp" cx="30" cy="20" r="8" fill="url(#jidoka-lamp)" />
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
  <svg class="reveal" viewBox="0 0 60 94" aria-hidden="true">
    <ellipse class="layer-pedestal" cx="30" cy="80" rx="22" ry="3" />
    <rect class="layer-bar" x="10" y="68" width="40" height="8" rx="2" fill="url(#jidoka-bar)" />
    <rect class="layer-bar" x="16" y="52" width="28" height="8" rx="2" fill="url(#jidoka-bar)" />
    <rect class="layer-bar layer-bar-top" x="22" y="36" width="16" height="8" rx="2" fill="url(#jidoka-bar-top)" />
    <circle class="layer-glow" cx="30" cy="20" r="18" />
    <circle class="layer-glow" cx="30" cy="20" r="15" />
    <circle class="layer-glow" cx="30" cy="20" r="12" />
    <circle class="layer-lamp" cx="30" cy="20" r="8" fill="url(#jidoka-lamp)" />
  </svg>
</div>

<div class="jidoka-section jidoka-section-cool">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Andon Cord</div>
      <h2 class="section-headline">One command. Three checks. The line stops at the first defect.</h2>
      <p class="section-body">The <code>jidoka</code> command is the andon cord. Each check owns one class of defect, so every finding routes to exactly one fix. Run it in your check script and in CI. The build fails before a drifted layer reaches the next agent run.</p>
    </div>
    <div class="check-grid stagger">
      <div class="check-card stagger-item">
        <div class="check-kind">Budgets</div>
        <code class="check-cmd">jidoka instructions</code>
        <p class="check-desc">A line cap and a word cap gate every layer. A checklist block with too many items fails. So does a checklist item that explains instead of confirms.</p>
      </div>
      <div class="check-card stagger-item">
        <div class="check-kind">Jobs</div>
        <code class="check-cmd">jidoka jtbd</code>
        <p class="check-desc">Every job entry must fit the schema. Every generated block must match the manifest that feeds it. <code>--fix</code> regenerates a stale block in place.</p>
      </div>
      <div class="check-card stagger-item">
        <div class="check-kind">Your rules</div>
        <code class="check-cmd">jidoka invariants</code>
        <p class="check-desc">It discovers every <code>*.rules.mjs</code> module under <code>.jidoka/invariants/</code> and runs it through one engine. The engine ships with the CLI. The policy stays in your repository.</p>
      </div>
    </div>
    <div class="reveal">
      <h3 class="demo-headline">Your own rule. Twenty lines.</h3>
      <p class="demo-sub">State one claim the code must satisfy. Collect the subjects. Declare the rule. The check then fails the build on the first file that breaks the claim.</p>
    </div>
    <div class="andon-demo reveal">
      <div class="code-panel">
        <div class="terminal-bar">
          <div class="terminal-dot"></div>
          <div class="terminal-dot"></div>
          <div class="terminal-dot"></div>
          <div class="terminal-title">.jidoka/invariants/no-child-process.rules.mjs</div>
        </div>
        <pre><code><span class="code-comment">// Invariant: src/ never imports node:child_process.</span>
<span class="code-comment">// Every subprocess call goes through the shared runner.</span>
export default {
  name: <span class="code-string">"no-child-process"</span>,
  build: ({ grep }) =&gt; ({
    subjects: {
      <span class="code-string">"src-file"</span>: grep({
        pattern: <span class="code-string">'from "node:child_process"'</span>,
        globs: [<span class="code-string">"src/**/*.js"</span>],
      }),
    },
  }),
  rules: ({ failAll }) =&gt; [
    failAll(<span class="code-string">"src-file"</span>, {
      id: <span class="code-string">"no-child-process.import"</span>,
      message: () =&gt; <span class="code-string">'imports "node:child_process"'</span>,
      hint: <span class="code-string">"call the shared runner instead"</span>,
    }),
  ],
};</code></pre>
      </div>
      <div class="andon-finding">
        <div class="code-panel">
          <div class="terminal-bar">
            <div class="terminal-dot"></div>
            <div class="terminal-dot"></div>
            <div class="terminal-dot"></div>
            <div class="terminal-title">Terminal</div>
          </div>
          <pre><code><span class="terminal-prompt">&#10095; </span>npx jidoka invariants
src/deploy.js
  1  <span class="finding-level">error</span>  imports "node:child_process"  <span class="finding-id">no-child-process.import</span>
            <span class="finding-hint">→ call the shared runner instead</span>
&nbsp;
<span class="finding-level">✖ 1 problem</span> (1 error, 0 warnings)</code></pre>
        </div>
        <p class="andon-caption">The finding names the file, the line, the rule id, and the fix. Nobody searches the repository by hand. The <a href="/docs/stop-the-line/write-invariant-rules/">invariant rules guide</a> covers AST scans, value agreement across files, and a monotone deny-list for a migration.</p>
      </div>
    </div>
  </div>
</div>

<div class="layer-divider">
  <svg class="reveal" viewBox="0 0 60 94" aria-hidden="true">
    <ellipse class="layer-pedestal" cx="30" cy="80" rx="22" ry="3" />
    <rect class="layer-bar" x="10" y="68" width="40" height="8" rx="2" fill="url(#jidoka-bar)" />
    <rect class="layer-bar" x="16" y="52" width="28" height="8" rx="2" fill="url(#jidoka-bar)" />
    <rect class="layer-bar layer-bar-top" x="22" y="36" width="16" height="8" rx="2" fill="url(#jidoka-bar-top)" />
    <circle class="layer-glow" cx="30" cy="20" r="18" />
    <circle class="layer-glow" cx="30" cy="20" r="15" />
    <circle class="layer-glow" cx="30" cy="20" r="12" />
    <circle class="layer-lamp" cx="30" cy="20" r="8" fill="url(#jidoka-lamp)" />
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
      <h2 class="getting-started-label">Adopt it in four lines.</h2>
      <p class="getting-started-sub">Install the skill pack and the CLI. Tell Claude to set it up. Run the checks.</p>
    </div>
    <div class="terminal reveal">
      <div class="terminal-bar">
        <div class="terminal-dot"></div>
        <div class="terminal-dot"></div>
        <div class="terminal-dot"></div>
        <div class="terminal-title">Terminal</div>
      </div>
      <div class="terminal-lines">
        <div class="terminal-line"><span class="terminal-prompt">&#10095; </span><span class="terminal-cmd">apm install forwardimpact/jidoka-skills</span></div>
        <div class="terminal-line"><span class="terminal-prompt">&#10095; </span><span class="terminal-cmd">npm install --save-dev @forwardimpact/jidoka</span></div>
        <div class="terminal-line"><span class="terminal-prompt">&#10095; </span><span class="terminal-cmd">echo </span><span class="terminal-string">"Set up Jidoka"</span><span class="terminal-cmd"> | claude</span></div>
        <div class="terminal-line"><span class="terminal-prompt">&#10095; </span><span class="terminal-cmd">npx jidoka &amp;&amp; npx jidoka invariants</span></div>
      </div>
    </div>
    <p class="closing-note reveal">The bare command runs the layer and jobs checks. The second call runs your own rules. Wire both into your check script and your CI workflow with the <a href="/docs/stop-the-line/">stop the line guide</a>. Read the full standard in the <a href="/docs/layered-instructions/">layered instruction architecture guide</a>.</p>
  </div>
</div>
