---
title: Gemba
description: The agent-runtime platform. One command family for a terminal and four composite actions for CI run the same loop. Stand up, run, see, remember, then measure.
toc: false
layout: home
---

<div class="gemba-section gemba-hero">
  <div class="hero-wordmark">
    <span class="wordmark-text">Gemba</span>
    <svg class="trace-mark trace-mark-flat" viewBox="0 0 64 4" preserveAspectRatio="none" aria-hidden="true">
      <line class="trace-tread" x1="2" y1="2" x2="11" y2="2" />
      <line class="trace-tread" x1="14" y1="2" x2="23" y2="2" />
      <line class="trace-tread" x1="27" y1="2" x2="36" y2="2" />
      <line class="trace-tread" x1="40" y1="2" x2="49" y2="2" />
      <line class="trace-tread" x1="53" y1="2" x2="62" y2="2" />
    </svg>
  </div>
  <svg class="trace-mark trace-mark-hero reveal" viewBox="0 0 64 24" role="img" aria-label="The Gemba loop: stand up, run, see, remember, measure">
    <path class="trace-riser" d="M15 20 V17 M26 17 V14 M37 14 V11 M48 11 V8" />
    <line class="trace-tread" data-step="stand-up" x1="4" y1="20" x2="15" y2="20" />
    <line class="trace-tread" data-step="run" x1="15" y1="17" x2="26" y2="17" />
    <line class="trace-tread" data-step="see" x1="26" y1="14" x2="37" y2="14" />
    <line class="trace-tread" data-step="remember" x1="37" y1="11" x2="48" y2="11" />
    <line class="trace-tread" data-step="measure" x1="48" y1="8" x2="59" y2="8" />
    <path class="trace-return" d="M59 8 Q32 28 4 20" />
  </svg>
  <h1 class="hero-title">Go to where the work happens</h1>
  <p class="hero-subtitle">The agent-runtime platform. One command family for a terminal. One set of CI actions for every push. Both run the same loop.</p>
  <div class="scroll-hint">
    <span>Scroll</span>
    <div class="scroll-line"></div>
  </div>
</div>

<div class="gemba-section gemba-section-warm">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Situation</div>
      <h2 class="section-headline">Every team rebuilds the same plumbing.</h2>
      <p class="section-body">A team that wants to run coding agents continuously writes a bootstrap script. Then it writes a session harness. Then it needs somewhere for traces to go and somewhere for memory to live. Then it needs a way to tell real improvement from noise.</p>
      <p class="section-body">Gemba packages that work as one platform. In Lean practice, <em>gemba</em> names the actual place where the work happens. This platform is the place where your agent team does the work.</p>
    </div>
    <div class="stats-grid stagger">
      <div class="stat-card stagger-item">
        <div class="stat-number">1</div>
        <div class="stat-label">Loop</div>
        <div class="stat-detail">Stand up, run, see, remember, measure</div>
      </div>
      <div class="stat-card stagger-item">
        <div class="stat-number">2</div>
        <div class="stat-label">Surfaces</div>
        <div class="stat-detail">A terminal and CI run the same steps</div>
      </div>
      <div class="stat-card stagger-item">
        <div class="stat-number">0</div>
        <div class="stat-label">Plumbing to write</div>
        <div class="stat-detail">No bootstrap, no trace store, no chart code</div>
      </div>
    </div>
  </div>
</div>

<div class="trace-divider">
  <svg class="trace-mark reveal" viewBox="0 0 64 24" aria-hidden="true">
    <path class="trace-riser" d="M15 20 V17 M26 17 V14 M37 14 V11 M48 11 V8" />
    <line class="trace-tread" x1="4" y1="20" x2="15" y2="20" />
    <line class="trace-tread" x1="15" y1="17" x2="26" y2="17" />
    <line class="trace-tread" x1="26" y1="14" x2="37" y2="14" />
    <line class="trace-tread" x1="37" y1="11" x2="48" y2="11" />
    <line class="trace-tread" x1="48" y1="8" x2="59" y2="8" />
    <path class="trace-return" d="M59 8 Q32 28 4 20" />
  </svg>
</div>

<div class="gemba-section">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Loop</div>
      <h2 class="section-headline">Five steps. Every run leaves a record.</h2>
      <p class="section-body">The loop runs stand up, then run, then see, then remember, then measure. Each step answers one question. Four steps ship as a command. The first ships as the bootstrap action and its installer.</p>
    </div>
    <div class="step-grid stagger">
      <div class="step-card stagger-item">
        <div class="step-motif">The mains switch</div>
        <div class="step-name">Stand up</div>
        <p class="step-question">Is the environment ready and the toolchain pinned?</p>
        <span class="step-command step-action">gemba-bootstrap<span class="step-kind">action</span></span>
      </div>
      <div class="step-card stagger-item">
        <div class="step-motif">The spindle</div>
        <div class="step-name">Run</div>
        <p class="step-question">What did the agent do on this task?</p>
        <span class="step-command">gemba-harness</span>
      </div>
      <div class="step-card stagger-item">
        <div class="step-motif">The gauge face</div>
        <div class="step-name">See</div>
        <p class="step-question">What does the trace say about the session?</p>
        <span class="step-command">gemba-trace</span>
      </div>
      <div class="step-card stagger-item">
        <div class="step-motif">The tape spool</div>
        <div class="step-name">Remember</div>
        <p class="step-question">What did the team learn, and where does it live?</p>
        <span class="step-command">gemba-wiki</span>
      </div>
      <div class="step-card stagger-item">
        <div class="step-motif">The chart limits</div>
        <div class="step-name">Measure</div>
        <p class="step-question">Did the metric move, or is this noise?</p>
        <span class="step-command">gemba-xmr</span>
      </div>
    </div>
  </div>
</div>

<div class="gemba-section gemba-section-warm">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Command Family</div>
      <h2 class="section-headline">Six commands. One install.</h2>
      <p class="section-body">Every command installs with the platform package. Five of the six also run on their own through <code>npx</code>. <code>gemba-selfedit</code> ships with the package only.</p>
    </div>
    <div class="command-grid stagger">
      <div class="command-card stagger-item">
        <div class="command-name">gemba-harness</div>
        <div class="command-step">Run</div>
        <p class="command-desc">Runs agents against a task and captures an NDJSON trace. It drives a single agent or a team of specialists in one session.</p>
      </div>
      <div class="command-card stagger-item">
        <div class="command-name">gemba-trace</div>
        <div class="command-step">See</div>
        <p class="command-desc">Downloads, queries, and analyses the traces the harness produced. It reports token use, cost, and what the agent actually did.</p>
      </div>
      <div class="command-card stagger-item">
        <div class="command-name">gemba-wiki</div>
        <div class="command-step">Remember</div>
        <p class="command-desc">Keeps memory that outlives a session. It writes boot digests, claims, and memos, and it audits its own integrity.</p>
      </div>
      <div class="command-card stagger-item">
        <div class="command-name">gemba-xmr</div>
        <div class="command-step">Measure</div>
        <p class="command-desc">Records metrics and draws Wheeler and Vacanti XmR control charts. A real shift then stands out from ordinary fluctuation.</p>
      </div>
      <div class="command-card stagger-item">
        <div class="command-name">gemba-benchmark</div>
        <div class="command-step">Measure</div>
        <p class="command-desc">Proves whether a change to agent instructions helped. It grades many runs against hidden tests and reports pass@k evidence.</p>
      </div>
      <div class="command-card stagger-item">
        <div class="command-name">gemba-selfedit</div>
        <div class="command-step">Stand up</div>
        <p class="command-desc">Gives a sandboxed agent a narrow, audited path to edit its own instruction files.</p>
      </div>
    </div>
    <p class="closing-note reveal">Gemba adds no importable API of its own. It consumes published runtime libraries. When you need the components instead of the commands, import <code>@forwardimpact/libharness</code>, <code>@forwardimpact/libwiki</code>, and <code>@forwardimpact/libxmr</code> directly, and read the <a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#catalog">library catalog</a>.</p>
  </div>
</div>

<div class="gemba-section">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">Two Surfaces</div>
      <h2 class="section-headline">What a team rehearses locally runs on every push.</h2>
      <p class="section-body">Gemba ships the loop twice. The commands run in a terminal. Four published composite actions run the same steps in GitHub Actions. A workflow pins each action by SHA.</p>
    </div>
    <div class="surface-grid stagger">
      <div class="surface-card stagger-item">
        <div class="surface-kind">Your terminal</div>
        <div class="surface-name">The command family</div>
        <p class="surface-desc">Install the six commands and work the loop by hand. A session, a trace, a memory write, and a control chart all happen where you already work. Nothing needs a server or a database.</p>
      </div>
      <div class="surface-card stagger-item">
        <div class="surface-kind">Your CI</div>
        <div class="surface-name">Four composite actions</div>
        <p class="surface-desc"><code>gemba-bootstrap</code> stands the platform environment up. <code>gemba-harness</code> runs the session and uploads the trace. <code>gemba-wiki</code> writes memory with a freshly minted token. <code>gemba-benchmark</code> spreads benchmark families across machines and merges the reports.</p>
      </div>
    </div>
  </div>
</div>

<div class="trace-divider">
  <svg class="trace-mark reveal" viewBox="0 0 64 24" aria-hidden="true">
    <path class="trace-riser" d="M15 20 V17 M26 17 V14 M37 14 V11 M48 11 V8" />
    <line class="trace-tread" x1="4" y1="20" x2="15" y2="20" />
    <line class="trace-tread" x1="15" y1="17" x2="26" y2="17" />
    <line class="trace-tread" x1="26" y1="14" x2="37" y2="14" />
    <line class="trace-tread" x1="37" y1="11" x2="48" y2="11" />
    <line class="trace-tread" x1="48" y1="8" x2="59" y2="8" />
    <path class="trace-return" d="M59 8 Q32 28 4 20" />
  </svg>
</div>

<div class="gemba-section gemba-section-amber">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Reference Tenant</div>
      <h2 class="section-headline">Kata runs on this platform. Daily.</h2>
      <p class="section-body">Kata is an agent team that plans specs, ships features, studies its traces, and acts on findings. Its skills call the same six commands. Its workflows pin the same four actions any other team would pin. Kata proves the platform is generic. Read the practice at <a href="https://www.kata.team/">kata.team</a>.</p>
      <p class="section-body">Two defaults still name that tenant. <code>gemba-wiki</code> creates a metrics directory only for a skill whose name starts with <code>kata-</code>. <code>gemba-xmr</code> uses <code>kata-shift</code> as its default shift type. Everything else in the platform is tenant-neutral.</p>
    </div>
  </div>
</div>

<div class="trace-divider">
  <svg class="trace-mark reveal" viewBox="0 0 64 24" aria-hidden="true">
    <path class="trace-riser" d="M15 20 V17 M26 17 V14 M37 14 V11 M48 11 V8" />
    <line class="trace-tread" x1="4" y1="20" x2="15" y2="20" />
    <line class="trace-tread" x1="15" y1="17" x2="26" y2="17" />
    <line class="trace-tread" x1="26" y1="14" x2="37" y2="14" />
    <line class="trace-tread" x1="37" y1="11" x2="48" y2="11" />
    <line class="trace-tread" x1="48" y1="8" x2="59" y2="8" />
    <path class="trace-return" d="M59 8 Q32 28 4 20" />
  </svg>
</div>

<div class="gemba-section">
  <div class="section-inner">
    <div class="reveal">
      <h2 class="getting-started-label">Three lines to a captured trace.</h2>
      <p class="getting-started-sub">Install the skill pack. Install the command family. Run one session.</p>
    </div>
    <div class="terminal reveal">
      <div class="terminal-bar">
        <div class="terminal-dot"></div>
        <div class="terminal-dot"></div>
        <div class="terminal-dot"></div>
        <div class="terminal-title">Terminal</div>
      </div>
      <div class="terminal-lines">
        <div class="terminal-line"><span class="terminal-prompt">&#10095; </span><span class="terminal-cmd">apm install forwardimpact/gemba-skills</span></div>
        <div class="terminal-line"><span class="terminal-prompt">&#10095; </span><span class="terminal-cmd">npm install -g @forwardimpact/gemba</span></div>
        <div class="terminal-line"><span class="terminal-prompt">&#10095; </span><span class="terminal-cmd">gemba-harness run --task-file=task.md --output=trace.ndjson</span></div>
      </div>
    </div>
    <p class="closing-note reveal">The <code>gemba-bootstrap</code> action does the same bring-up in CI. Its <code>fit-install.sh</code> installer does it on a workstation, and that installer ships in the shared <code>gear</code> release. Take the full path in <a href="/docs/getting-started/">Get started</a>, then read the <a href="/docs/">documentation</a>.</p>
  </div>
</div>
