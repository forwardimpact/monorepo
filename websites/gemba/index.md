---
title: Gemba
description: The agent-runtime platform. A factory floor for your agent team. Six commands in a terminal and five composite actions in CI run the same loop. Stand up, run, see, remember, measure, then stop.
toc: false
layout: home
---

<div class="gemba-section gemba-hero">
  <div class="hero-wordmark">
    <span class="wordmark-text">Gemba</span>
    <svg class="trace-mark trace-mark-flat" viewBox="0 0 64 4" preserveAspectRatio="none" aria-hidden="true">
      <circle class="trace-dot" cx="6.5" cy="2" r="1.8" fill="url(#gemba-dot)" />
      <circle class="trace-dot" cx="16.7" cy="2" r="1.8" fill="url(#gemba-dot)" />
      <circle class="trace-dot" cx="26.9" cy="2" r="1.8" fill="url(#gemba-dot)" />
      <circle class="trace-dot" cx="37.1" cy="2" r="1.8" fill="url(#gemba-dot)" />
      <circle class="trace-dot" cx="47.3" cy="2" r="1.8" fill="url(#gemba-dot)" />
      <circle class="trace-dot" cx="57.5" cy="2" r="1.8" fill="url(#gemba-dot)" />
    </svg>
  </div>
  <svg class="trace-mark trace-mark-hero reveal" viewBox="0 0 64 30" role="img" aria-label="The Gemba loop: stand up, run, see, remember, measure, stop">
    <path class="trace-return" d="M53 8 Q29 22 4 21" />
    <path class="trace-line" d="M4 21 C6.5 21 6.5 20 9 20 C13.4 20 13.4 17.6 17.8 17.6 C22.2 17.6 22.2 15.2 26.6 15.2 C31 15.2 31 12.8 35.4 12.8 C39.8 12.8 39.8 10.4 44.2 10.4 C48.6 10.4 48.6 8 53 8" stroke="url(#gemba-trace-line)" />
    <circle class="trace-dot" data-step="stand-up" cx="9" cy="20" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" data-step="run" cx="17.8" cy="17.6" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" data-step="see" cx="26.6" cy="15.2" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" data-step="remember" cx="35.4" cy="12.8" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" data-step="measure" cx="44.2" cy="10.4" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-glow" cx="53" cy="8" r="8" />
    <circle class="trace-glow" cx="53" cy="8" r="6" />
    <circle class="trace-glow" cx="53" cy="8" r="4.2" />
    <circle class="trace-dot trace-dot-live" data-step="stop" cx="53" cy="8" r="3" fill="url(#gemba-nib)" />
  </svg>
  <h1 class="hero-title">Give your agent team a factory floor</h1>
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
      <h2 class="section-headline">Every team builds the same machines again.</h2>
      <p class="section-body">A team that wants to run coding agents continuously writes a bootstrap script. Then it writes a session harness. Then it needs somewhere for traces to go and somewhere for memory to live. Then it needs a way to tell real improvement from noise.</p>
      <p class="section-body">Gemba packages that work as one platform. In Lean practice, <em>gemba</em> is the factory floor. It is the place where value gets made, and it is the place you must stand to understand the work. This platform is that floor for your agent team. The commands are the machines on it.</p>
    </div>
    <div class="stats-grid stagger">
      <div class="stat-card stagger-item">
        <div class="stat-number">1</div>
        <div class="stat-label">Loop</div>
        <div class="stat-detail">Stand up, run, see, remember, measure, stop</div>
      </div>
      <div class="stat-card stagger-item">
        <div class="stat-number">2</div>
        <div class="stat-label">Surfaces</div>
        <div class="stat-detail">A terminal and CI run the same steps</div>
      </div>
      <div class="stat-card stagger-item">
        <div class="stat-number">0</div>
        <div class="stat-label">Machines to build</div>
        <div class="stat-detail">No bootstrap, no trace store, no chart code</div>
      </div>
    </div>
  </div>
</div>

<div class="trace-divider">
  <svg class="trace-mark reveal" viewBox="0 0 64 30" aria-hidden="true">
    <path class="trace-return" d="M53 8 Q29 22 4 21" />
    <path class="trace-line" d="M4 21 C6.5 21 6.5 20 9 20 C13.4 20 13.4 17.6 17.8 17.6 C22.2 17.6 22.2 15.2 26.6 15.2 C31 15.2 31 12.8 35.4 12.8 C39.8 12.8 39.8 10.4 44.2 10.4 C48.6 10.4 48.6 8 53 8" stroke="url(#gemba-trace-line)" />
    <circle class="trace-dot" cx="9" cy="20" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" cx="17.8" cy="17.6" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" cx="26.6" cy="15.2" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" cx="35.4" cy="12.8" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" cx="44.2" cy="10.4" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-glow" cx="53" cy="8" r="8" />
    <circle class="trace-glow" cx="53" cy="8" r="6" />
    <circle class="trace-glow" cx="53" cy="8" r="4.2" />
    <circle class="trace-dot trace-dot-live" cx="53" cy="8" r="3" fill="url(#gemba-nib)" />
  </svg>
</div>

<div class="gemba-section">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Loop</div>
      <h2 class="section-headline">Six steps. Every run leaves a record.</h2>
      <p class="section-body">The loop runs stand up, then run, then see, then remember, then measure, then stop. Each step answers one question. Five steps ship as a command. The first ships as the bootstrap action and its installer.</p>
      <p class="section-body">Two of the six steps come straight from factory practice. <em>See</em> is genchi genbutsu. You go to the actual place, and you look at the actual thing. For an agent session, the trace is that thing. <em>Measure</em> asks what Shewhart and Deming asked on the factory floor. Did the process shift, or is this ordinary variation? An XmR chart separates the two.</p>
    </div>
    <div class="step-grid stagger">
      <div class="step-card stagger-item">
        <div class="step-name">Stand up</div>
        <p class="step-question">Is the environment ready and the toolchain pinned?</p>
        <span class="step-command step-action">gemba-bootstrap<span class="step-kind">action</span></span>
      </div>
      <div class="step-card stagger-item">
        <div class="step-name">Run</div>
        <p class="step-question">What did the agent do on this task?</p>
        <span class="step-command">gemba-harness</span>
      </div>
      <div class="step-card stagger-item">
        <div class="step-name">See</div>
        <p class="step-question">What does the trace say about the session?</p>
        <span class="step-command">gemba-trace</span>
      </div>
      <div class="step-card stagger-item">
        <div class="step-name">Remember</div>
        <p class="step-question">What did the team learn, and where does it live?</p>
        <span class="step-command">gemba-wiki</span>
      </div>
      <div class="step-card stagger-item">
        <div class="step-name">Measure</div>
        <p class="step-question">Did the metric move, or is this noise?</p>
        <span class="step-command">gemba-xmr</span>
      </div>
      <div class="step-card stagger-item">
        <div class="step-name">Stop</div>
        <p class="step-question">Is the team creating work faster than a human can read it?</p>
        <span class="step-command">gemba-watchdog</span>
      </div>
    </div>
  </div>
</div>

<div class="gemba-section gemba-section-warm">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">Two Surfaces</div>
      <h2 class="section-headline">What a team rehearses locally runs on every push.</h2>
      <p class="section-body">Gemba ships the loop twice. The commands run in a terminal. Five published composite actions run the same steps in GitHub Actions. A workflow pins each action by SHA.</p>
    </div>
    <div class="surface-grid stagger">
      <div class="surface-card stagger-item">
        <div class="surface-kind">Your terminal</div>
        <div class="surface-name">The command family</div>
        <p class="surface-desc">Install the six commands, or run any one of them through <code>npx</code>. A session, a trace, a memory write, and a control chart all happen where you already work. Nothing needs a server or a database.</p>
      </div>
      <div class="surface-card stagger-item">
        <div class="surface-kind">Your CI</div>
        <div class="surface-name">Five composite actions</div>
        <p class="surface-desc"><code>gemba-bootstrap</code> stands the platform environment up. <code>gemba-harness</code> runs the session and uploads the trace. <code>gemba-wiki</code> writes memory with a freshly minted token. <code>gemba-benchmark</code> spreads benchmark families across machines and merges the reports. <code>gemba-watchdog</code> counts repository activity and engages an operator latch on a breach.</p>
      </div>
    </div>
    <p class="closing-note reveal">Gemba adds no importable API of its own. It consumes published runtime libraries. When you need the components instead of the commands, import <code>@forwardimpact/libharness</code>, <code>@forwardimpact/libwiki</code>, <code>@forwardimpact/libxmr</code>, and <code>@forwardimpact/libwatchdog</code> directly. Read the <a href="https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#catalog">library catalog</a>.</p>
  </div>
</div>

<div class="trace-divider">
  <svg class="trace-mark reveal" viewBox="0 0 64 30" aria-hidden="true">
    <path class="trace-return" d="M53 8 Q29 22 4 21" />
    <path class="trace-line" d="M4 21 C6.5 21 6.5 20 9 20 C13.4 20 13.4 17.6 17.8 17.6 C22.2 17.6 22.2 15.2 26.6 15.2 C31 15.2 31 12.8 35.4 12.8 C39.8 12.8 39.8 10.4 44.2 10.4 C48.6 10.4 48.6 8 53 8" stroke="url(#gemba-trace-line)" />
    <circle class="trace-dot" cx="9" cy="20" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" cx="17.8" cy="17.6" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" cx="26.6" cy="15.2" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" cx="35.4" cy="12.8" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" cx="44.2" cy="10.4" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-glow" cx="53" cy="8" r="8" />
    <circle class="trace-glow" cx="53" cy="8" r="6" />
    <circle class="trace-glow" cx="53" cy="8" r="4.2" />
    <circle class="trace-dot trace-dot-live" cx="53" cy="8" r="3" fill="url(#gemba-nib)" />
  </svg>
</div>

<div class="gemba-section gemba-section-amber">
  <div class="section-inner">
    <div class="reveal">
      <div class="section-label">The Reference Tenant</div>
      <h2 class="section-headline">Kata runs on this platform. Daily.</h2>
      <p class="section-body">Kata is an agent team that plans specs, ships features, studies its traces, and acts on findings. Its skills call five of the six commands. Its workflows pin four of the five actions any other team would pin. Kata proves the platform is generic. Read the practice at <a href="https://www.kata.team/">kata.team</a>.</p>
      <p class="section-body">Two defaults still name that tenant. <code>gemba-wiki</code> creates a metrics directory only for a skill whose name starts with <code>kata-</code>. <code>gemba-xmr</code> uses <code>kata-shift</code> as its default shift type. Everything else in the platform is tenant-neutral.</p>
    </div>
  </div>
</div>

<div class="trace-divider">
  <svg class="trace-mark reveal" viewBox="0 0 64 30" aria-hidden="true">
    <path class="trace-return" d="M53 8 Q29 22 4 21" />
    <path class="trace-line" d="M4 21 C6.5 21 6.5 20 9 20 C13.4 20 13.4 17.6 17.8 17.6 C22.2 17.6 22.2 15.2 26.6 15.2 C31 15.2 31 12.8 35.4 12.8 C39.8 12.8 39.8 10.4 44.2 10.4 C48.6 10.4 48.6 8 53 8" stroke="url(#gemba-trace-line)" />
    <circle class="trace-dot" cx="9" cy="20" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" cx="17.8" cy="17.6" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" cx="26.6" cy="15.2" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" cx="35.4" cy="12.8" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-dot" cx="44.2" cy="10.4" r="2.2" fill="url(#gemba-dot)" />
    <circle class="trace-glow" cx="53" cy="8" r="8" />
    <circle class="trace-glow" cx="53" cy="8" r="6" />
    <circle class="trace-glow" cx="53" cy="8" r="4.2" />
    <circle class="trace-dot trace-dot-live" cx="53" cy="8" r="3" fill="url(#gemba-nib)" />
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
