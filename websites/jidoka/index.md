---
title: Jidoka Instruction Architecture
description: Built-in quality for agent instructions. Each of the eight layers holds one job, and one command stops the line when a layer drifts, a job goes stale, or an invariant breaks.
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
  <p class="hero-subtitle">One instruction architecture for humans and agents. Each of the eight layers holds a single job, and one command stops the line when a layer drifts, a job goes stale, or an invariant breaks.</p>
  <div class="scroll-hint">
    <span>Scroll</span>
    <div class="scroll-line"></div>
  </div>
</div>

<div class="jidoka-section jidoka-section-cool">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Problem</div>
      <h2 class="section-headline">Instruction files grow, and nothing catches the drift.</h2>
      <p class="section-body">Prompt files pile up, layers repeat each other, and job entries go stale. No one notices until an agent does the wrong thing. Jidoka follows the Toyota practice of building quality into the process, so that the line stops at the first defect. In this architecture, every layer owns a single job and has a budget that a check can measure. A defect then points to exactly one layer, and the check fails before the defect ships.</p>
    </div>
    <div class="stats-grid stagger">
      <div class="stat-card stagger-item">
        <div class="stat-number">8</div>
        <div class="stat-label">Layers</div>
        <div class="stat-detail">Each layer owns one job and repeats none of the others</div>
      </div>
      <div class="stat-card stagger-item">
        <div class="stat-number">3</div>
        <div class="stat-label">Checks</div>
        <div class="stat-detail">Each check catches one class of defect</div>
      </div>
      <div class="stat-card stagger-item">
        <div class="stat-number">0</div>
        <div class="stat-label">Guesswork</div>
        <div class="stat-detail">Every defect points to one layer</div>
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
      <h2 class="section-headline">Eight layers, from the most general to the most specific.</h2>
      <p class="section-body">Each layer loads at a set moment and owns one concern. The layers that load on every run have a budget, so the context window stays small. The other layers load only when the work needs them.</p>
    </div>
    <div class="layers-grid stagger">
      <div class="layer-card stagger-item">
        <div class="layer-tag">L0</div>
        <div class="layer-name">System Prompt</div>
        <p class="layer-desc">How the harness works: turns, tool calls, and the completion signal. It contains nothing about your project.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L1</div>
        <div class="layer-name">CLAUDE.md</div>
        <p class="layer-desc">Project identity: what it is, who it serves, and where to find its jobs and checklists.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L2</div>
        <div class="layer-name">CONTRIBUTING.md &amp; JTBD.md</div>
        <p class="layer-desc">Contribution standards, and the jobs each persona wants the repository to do.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L3</div>
        <div class="layer-name">Agent Profile</div>
        <p class="layer-desc">One persona: its voice, the skills it routes to, and the limits of its scope. It holds no steps.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L4</div>
        <div class="layer-name">Agent References</div>
        <p class="layer-desc">Protocols that several agents share: memory, coordination, and approval.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L5</div>
        <div class="layer-name">Skill Procedure</div>
        <p class="layer-desc">The complete steps for one domain of work, written as instructions. A reader needs no unwritten knowledge.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L6</div>
        <div class="layer-name">Skill References</div>
        <p class="layer-desc">The data a procedure reads: templates, worked examples, and lookup tables.</p>
      </div>
      <div class="layer-card stagger-item">
        <div class="layer-tag">L7</div>
        <div class="layer-name">Checklists</div>
        <p class="layer-desc">A yes-or-no check at a pause point. It confirms that a known step happened.</p>
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
      <h2 class="section-headline">One command runs three checks and stops at the first defect.</h2>
      <p class="section-body">The <code>jidoka</code> command works as the andon cord: it stops the line when it finds a defect. Each check owns one class of defect, so every finding maps to exactly one fix. Run it in your check script and in CI, and the build fails before a drifted layer reaches the next agent run.</p>
    </div>
    <div class="check-grid stagger">
      <div class="check-card stagger-item">
        <div class="check-kind">Budgets</div>
        <code class="check-cmd">jidoka instructions</code>
        <p class="check-desc">Every layer has a line cap and a word cap. A checklist block with too many items fails the check, and so does a checklist item that explains instead of confirms.</p>
      </div>
      <div class="check-card stagger-item">
        <div class="check-kind">Jobs</div>
        <code class="check-cmd">jidoka jtbd</code>
        <p class="check-desc">Every job entry must match the schema, and every generated block must match the manifest it comes from. <code>--fix</code> regenerates a stale block in place.</p>
      </div>
      <div class="check-card stagger-item">
        <div class="check-kind">Your rules</div>
        <code class="check-cmd">jidoka invariants</code>
        <p class="check-desc">It finds every <code>*.rules.mjs</code> module under <code>.jidoka/invariants/</code> and runs it through one engine. The engine ships with the CLI, and the policy stays in your repository.</p>
      </div>
    </div>
    <div class="reveal">
      <h3 class="demo-headline">Write your own rule in about twenty lines.</h3>
      <p class="demo-sub">State one claim the code must satisfy, collect the subjects, and declare the rule. The check then fails the build on the first file that breaks the claim.</p>
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
        <p class="andon-caption">The finding shows the file, the line number, the rule id, and the fix, so you do not need to search the repository yourself. The <a href="/docs/stop-the-line/write-invariant-rules/">invariant rules guide</a> covers AST scans, values that must agree across files, and a deny-list that only shrinks during a migration.</p>
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
      <h2 class="section-headline">Two gates: one at entry and one at exit.</h2>
      <p class="section-body">A checklist confirms that a known step happened. It does not teach the step. If you have to explain an item, the procedure above it is incomplete. A <code>&lt;read_do_checklist&gt;</code> or <code>&lt;do_confirm_checklist&gt;</code> tag wraps each gate, so one <code>rg</code> search finds every pause point in the repository.</p>
    </div>
    <div class="duo-grid stagger">
      <div class="gate-card stagger-item">
        <div class="gate-kind">Entry gate</div>
        <div class="gate-name">READ-DO</div>
        <p class="gate-desc">Read each item, then do it. This gate loads the constraints into memory before the first line of work, because one missed constraint at that point sends the whole change in the wrong direction.</p>
        <code class="gate-find">rg '&lt;read_do_checklist'</code>
      </div>
      <div class="gate-card stagger-item">
        <div class="gate-kind">Exit gate</div>
        <div class="gate-name">DO-CONFIRM</div>
        <p class="gate-desc">Do the work from memory, then pause and confirm each item. This gate checks that you missed nothing before a commit, a merge, or a release. The items are independent, so the gate does not interrupt the work.</p>
        <code class="gate-find">rg '&lt;do_confirm_checklist'</code>
      </div>
    </div>
  </div>
</div>

<div class="jidoka-section jidoka-section-cool">
  <div class="section-inner">
    <div class="reveal">
      <h2 class="getting-started-label">Adopt it in four steps.</h2>
      <p class="getting-started-sub">Install the skill pack and the CLI, ask Claude to set it up, and run the checks.</p>
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
    <p class="closing-note reveal">The bare command runs the layer check and the jobs check, and the second call runs your own rules. To add both to your check script and your CI workflow, see the <a href="/docs/stop-the-line/">stop the line guide</a>. For the full standard, read the <a href="/docs/layered-instructions/">layered instruction architecture guide</a>.</p>
  </div>
</div>
