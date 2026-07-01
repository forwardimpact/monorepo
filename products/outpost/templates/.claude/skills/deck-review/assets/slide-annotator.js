/*!
 * slide-annotator.js — a tiny, self-contained text-highlight review overlay.
 * ---------------------------------------------------------------------------
 * Drop into ANY static HTML page (decks especially) with one line:
 *
 *     <script src="slide-annotator.js" defer
 *             data-slide-selector=".slide"
 *             data-label-selector=".slide-num"></script>
 *
 * Click the “✎ Review” button (bottom-left), select text on a slide, optionally
 * add a note, and Add. Annotations autosave to localStorage immediately. Click
 * “Connect folder” once to (a) write a real sidecar JSON next to the page and
 * (b) resolve each highlight to its SOURCE line/column + context lines by
 * reading the page’s own source file. No build step, no server, no deps.
 *
 * The connected folder is remembered across reloads (the directory handle is
 * stored in IndexedDB). On reload it reconnects silently if the browser still
 * grants permission; otherwise the button reads “Reconnect folder” and one
 * click re-grants access without re-picking the folder.
 *
 * Optional host hook: if the page defines `window.deckGoto(index)` the panel’s
 * “Go” buttons will navigate to the right slide. Without it, the tool still
 * works (it falls back to scrollIntoView).
 *
 * SIDECAR JSON SCHEMA (what an agent reads to act on the feedback):
 * {
 *   "version": 1, "tool": "slide-annotator",
 *   "target": "<page>.html", "updatedAt": "<iso>",
 *   "annotations": [{
 *     "id", "createdAt", "status": "open"|"done", "note",
 *     "slideId", "slideIndex", "slideLabel", "slideTitle",
 *     "quote",            // exact highlighted text (the anchor)
 *     "prefix", "suffix", // ~60 rendered chars either side (disambiguation)
 *     "renderedStart", "renderedEnd", // char offsets within the slide's text
 *     "domPath",          // CSS-ish path to the containing element
 *     "source": {         // best-effort, null until folder connected
 *       "file", "line", "column", "match": "exact"|"normalized"|"none",
 *       "contextBefore": [..], "contextLine": "..", "contextAfter": [..]
 *     }
 *   }]
 * }
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";
  if (window.__slideAnnotator) return;

  /* ----------------------------- config ----------------------------------- */
  var script = document.currentScript ||
               document.querySelector('script[src*="slide-annotator"]');
  var ds = (script && script.dataset) || {};
  var cfg = {
    slideSelector: ds.slideSelector || ".slide",
    labelSelector: ds.labelSelector || ".slide-num",
    target: ds.target || basename(),
    pre: 60, post: 60, ctx: 2
  };
  function basename() {
    try { return decodeURIComponent(location.pathname.split("/").pop()) || "page"; }
    catch (e) { return "page"; }
  }
  var SIDECAR = cfg.target.replace(/\.x?html?$/i, "") + ".annotations.json";
  var LS_KEY = "slide-annotator:" + cfg.target;

  /* ----------------------------- state ------------------------------------ */
  var state = loadLocal();        // { version, tool, target, annotations:[] }
  var review = false;
  var dirHandle = null;           // File System Access directory handle (active)
  var rememberedHandle = null;    // handle from a prior session, awaiting re-grant
  var sourceText = null;          // page source (for line/column)
  var pending = null;             // annotation awaiting note + confirm
  var ui = {};                    // DOM refs

  /* ----------------------------- styles ----------------------------------- */
  var css = "\
.sa-ui,.sa-ui *{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}\
.sa-fab{position:fixed;left:16px;bottom:14px;z-index:2147483000;display:flex;gap:0;\
  border:2px solid #000;background:#111;color:#fff;font-weight:700;font-size:13px;\
  box-shadow:3px 3px 0 0 rgba(0,0,0,.5);cursor:pointer;padding:9px 13px;letter-spacing:.02em}\
.sa-fab:hover{background:#000}\
.sa-fab.on{background:#FFDD00;color:#000;border-color:#000}\
.sa-banner{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483000;\
  background:#FFDD00;color:#000;border:2px solid #000;box-shadow:3px 3px 0 0 #000;\
  font-size:12.5px;font-weight:700;padding:7px 14px;text-transform:uppercase;letter-spacing:.04em;display:none}\
.sa-banner.on{display:block}\
.sa-panel{position:fixed;top:0;right:0;height:100vh;width:330px;z-index:2147482900;\
  background:#fbf7ee;border-left:3px solid #000;box-shadow:-6px 0 0 0 rgba(0,0,0,.12);\
  display:flex;flex-direction:column;transform:translateX(100%);transition:transform .22s ease}\
.sa-panel.on{transform:none}\
.sa-phead{padding:12px 14px;border-bottom:3px solid #000;background:#111;color:#fff}\
.sa-phead h3{margin:0 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase}\
.sa-phead .sa-row{display:flex;gap:6px;flex-wrap:wrap}\
.sa-btn{border:2px solid #000;background:#fff;color:#000;font-size:11.5px;font-weight:700;\
  padding:5px 9px;cursor:pointer;letter-spacing:.02em}\
.sa-btn:hover{background:#FFDD00}\
.sa-btn.dark{background:#3366FF;color:#fff;border-color:#000}\
.sa-btn.dark:hover{background:#1f49d6}\
.sa-status{font-size:11px;color:#cfcfcf;margin-top:8px;min-height:14px}\
.sa-list{flex:1;overflow:auto;padding:10px}\
.sa-empty{color:#777;font-size:12.5px;padding:18px 6px;line-height:1.5}\
.sa-card{border:2px solid #000;background:#fff;box-shadow:2px 2px 0 0 #000;padding:9px 10px;margin-bottom:9px}\
.sa-card.done{opacity:.55}\
.sa-meta{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#3366FF;margin-bottom:4px;display:flex;justify-content:space-between;gap:6px}\
.sa-meta .src{color:#999;font-weight:600;font-family:ui-monospace,Menlo,monospace}\
.sa-quote{font-size:13px;line-height:1.35;border-left:4px solid #FFDD00;padding-left:8px;margin:2px 0 6px}\
.sa-note{font-size:12px;color:#333;font-style:italic;margin-bottom:7px;white-space:pre-wrap}\
.sa-cardrow{display:flex;gap:5px;flex-wrap:wrap}\
.sa-mini{border:1px solid #000;background:#f3f3f3;font-size:10.5px;font-weight:700;padding:3px 7px;cursor:pointer}\
.sa-mini:hover{background:#FFDD00}\
.sa-mini.del:hover{background:#FF006E;color:#fff}\
.sa-pop{position:fixed;z-index:2147483600;background:#fff;border:2px solid #000;box-shadow:4px 4px 0 0 #000;\
  padding:9px;width:248px;display:none}\
.sa-pop.on{display:block}\
.sa-pop textarea{width:100%;height:52px;border:2px solid #000;font-size:12.5px;padding:6px;resize:none;font-family:inherit}\
.sa-pop .sa-poprow{display:flex;gap:6px;margin-top:7px;justify-content:flex-end}\
.sa-toast{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:2147483600;\
  background:#000;color:#fff;font-size:12px;font-weight:600;padding:8px 14px;border:2px solid #000;\
  opacity:0;transition:opacity .2s;pointer-events:none;max-width:70vw;text-align:center}\
.sa-toast.on{opacity:1}\
::highlight(sa-all){background:rgba(255,221,0,.45);text-decoration:underline;text-decoration-color:#caا}\
::highlight(sa-active){background:rgba(255,0,110,.35)}\
@media print{.sa-ui{display:none!important}}";
  // (one stray glyph above is harmless inside a CSS comment-free value; replaced below)
  css = css.replace("#caا", "#b38f00");
  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ------------------------------ UI build -------------------------------- */
  ui.fab = el("button", "sa-ui sa-fab", "✎ Review");
  ui.banner = el("div", "sa-ui sa-banner", "Review mode — select text to highlight · Esc to exit");
  ui.panel = el("div", "sa-ui sa-panel");
  ui.panel.innerHTML =
    '<div class="sa-phead">' +
      '<h3>Annotations · <span class="sa-count">0</span></h3>' +
      '<div class="sa-row">' +
        '<button class="sa-btn dark" data-act="connect">Connect folder</button>' +
        '<button class="sa-btn" data-act="save">Save</button>' +
        '<button class="sa-btn" data-act="load">Load</button>' +
        '<button class="sa-btn" data-act="onlyslide">This slide</button>' +
        '<button class="sa-btn" data-act="close">Close</button>' +
      '</div>' +
      '<div class="sa-status"></div>' +
    '</div>' +
    '<div class="sa-list"></div>';
  ui.pop = el("div", "sa-ui sa-pop");
  ui.pop.innerHTML =
    '<textarea placeholder="Optional note for this highlight…"></textarea>' +
    '<div class="sa-poprow">' +
      '<button class="sa-btn" data-act="cancel">Cancel</button>' +
      '<button class="sa-btn dark" data-act="add">Add</button>' +
    '</div>';
  ui.toast = el("div", "sa-ui sa-toast");
  [ui.fab, ui.banner, ui.panel, ui.pop, ui.toast].forEach(function (n) { document.body.appendChild(n); });

  ui.count = ui.panel.querySelector(".sa-count");
  ui.status = ui.panel.querySelector(".sa-status");
  ui.list = ui.panel.querySelector(".sa-list");
  ui.connectBtn = ui.panel.querySelector('[data-act="connect"]');
  ui.note = ui.pop.querySelector("textarea");
  var onlyThisSlide = false;

  // Keep the tool's own keystrokes from leaking to the host page (e.g. a deck's
  // Space / arrow-key slide navigation) while typing a note or using a panel
  // button. We stop propagation in the BUBBLE phase, so: (a) our capture-phase
  // Esc handler has already run, and (b) the default action — typing the
  // character, moving the caret — still happens. Scoped to the tool's own UI,
  // so arrow/Space navigation still works when focus is on the page itself.
  // Independent of any host: we never touch the host's handlers, just our own.
  [ui.fab, ui.banner, ui.panel, ui.pop].forEach(function (node) {
    ["keydown", "keyup", "keypress"].forEach(function (type) {
      node.addEventListener(type, function (e) { e.stopPropagation(); });
    });
  });

  /* ------------------------------ events ---------------------------------- */
  ui.fab.addEventListener("click", function () { toggle(); });
  ui.panel.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var act = b.getAttribute("data-act");
    if (act === "connect") connectFolder();
    else if (act === "save") saveDisk();
    else if (act === "load") loadDisk();
    else if (act === "close") toggle(false);
    else if (act === "onlyslide") { onlyThisSlide = !onlyThisSlide; b.classList.toggle("on"); renderPanel(); }
  });
  ui.pop.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    if (b.getAttribute("data-act") === "add") confirmPending();
    else cancelPending();
  });
  ui.list.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var id = b.closest(".sa-card").getAttribute("data-id");
    var act = b.getAttribute("data-act");
    if (act === "go") goTo(byId(id));
    else if (act === "del") { removeAnn(id); }
    else if (act === "toggle") { var a = byId(id); a.status = a.status === "done" ? "open" : "done"; persistLocal(); renderPanel(); }
  });

  // capture text selections while in review mode
  document.addEventListener("mouseup", function (e) {
    if (!review || e.target.closest(".sa-ui")) return;
    setTimeout(captureSelection, 0);
  });
  // Esc: cancel popover, else exit review
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (pending) { cancelPending(); e.stopPropagation(); }
    else if (review) { toggle(false); e.stopPropagation(); }
  }, true);

  // In review mode, swallow ONLY the click that ends a text-selection drag, so a
  // host with click-to-advance can't navigate out from under the highlight. Plain
  // clicks (with no active selection) pass through untouched — footer dots, links
  // and buttons keep working. Non-invasive and host-agnostic.
  function clickSuppressor(e) {
    if (e.target.closest(".sa-ui")) return;
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }

  /* ----------------------------- toggle ----------------------------------- */
  function toggle(force) {
    review = (force === undefined) ? !review : force;
    ui.fab.classList.toggle("on", review);
    ui.fab.textContent = review ? "✓ Reviewing" : "✎ Review";
    ui.banner.classList.toggle("on", review);
    ui.panel.classList.toggle("on", review);
    if (review) {
      document.addEventListener("click", clickSuppressor, true);
      renderPanel(); renderHighlights();
    } else {
      document.removeEventListener("click", clickSuppressor, true);
      cancelPending();
      if (window.CSS && CSS.highlights) { CSS.highlights.delete("sa-all"); CSS.highlights.delete("sa-active"); }
    }
  }

  /* ------------------------- selection capture ---------------------------- */
  function captureSelection() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    var range = sel.getRangeAt(0);
    var quote = sel.toString();
    if (!quote.trim()) return;

    var slide = slideOf(range.startContainer);
    var off = offsets(slide, range);
    var text = slide.textContent;
    var slides = allSlides();
    // Anchor on the underlying DOM text (text.slice), NOT Selection.toString():
    // the latter applies text-transform (e.g. uppercase headings) and would no
    // longer match the source or the slide's textContent.
    var storedQuote = text.slice(off.start, off.end) || quote;

    pending = {
      id: uid(),
      createdAt: new Date().toISOString(),
      status: "open",
      note: "",
      slideId: slide.id || null,
      slideIndex: slides.indexOf(slide),
      slideLabel: pick(slide, cfg.labelSelector),
      slideTitle: pickTitle(slide),
      quote: storedQuote,
      prefix: text.slice(Math.max(0, off.start - cfg.pre), off.start),
      suffix: text.slice(off.end, off.end + cfg.post),
      renderedStart: off.start,
      renderedEnd: off.end,
      domPath: cssPath(elementOf(range.commonAncestorContainer)),
      source: null
    };
    showPopover(range.getBoundingClientRect());
  }

  function showPopover(rect) {
    var p = ui.pop, w = 248;
    var left = Math.min(Math.max(8, rect.left), window.innerWidth - w - 8);
    var top = Math.min(rect.bottom + 8, window.innerHeight - 120);
    p.style.left = left + "px"; p.style.top = top + "px";
    p.classList.add("on");
    ui.note.value = "";
    setTimeout(function () { ui.note.focus(); }, 0);
  }
  function cancelPending() { pending = null; ui.pop.classList.remove("on"); var s = window.getSelection(); if (s) s.removeAllRanges(); }
  function confirmPending() {
    if (!pending) return;
    pending.note = ui.note.value.trim();
    if (sourceText) pending.source = locateInSource(pending);
    state.annotations.push(pending);
    pending = null;
    ui.pop.classList.remove("on");
    var s = window.getSelection(); if (s) s.removeAllRanges();
    persistLocal(); renderHighlights(); renderPanel();
    setStatus(state.annotations.length + " annotation(s) · autosaved locally");
  }

  function removeAnn(id) {
    state.annotations = state.annotations.filter(function (a) { return a.id !== id; });
    persistLocal(); renderHighlights(); renderPanel();
  }

  /* ----------------------- offset / range helpers ------------------------- */
  function allSlides() {
    var n = document.querySelectorAll(cfg.slideSelector);
    return n.length ? Array.prototype.slice.call(n) : [document.body];
  }
  function slideOf(node) {
    var e = node.nodeType === 1 ? node : node.parentElement;
    return (e && e.closest(cfg.slideSelector)) || document.body;
  }
  function elementOf(node) { return node.nodeType === 1 ? node : node.parentElement; }
  function pick(slide, sel) { var e = slide.querySelector(sel); return e ? e.textContent.trim() : null; }
  function pickTitle(slide) { var e = slide.querySelector("h1,h2,h3"); return e ? collapse(e.innerText || e.textContent) : null; }
  function offsets(slide, range) {
    var a = document.createRange(); a.setStart(slide, 0); a.setEnd(range.startContainer, range.startOffset);
    var b = document.createRange(); b.setStart(slide, 0); b.setEnd(range.endContainer, range.endOffset);
    return { start: a.toString().length, end: b.toString().length };
  }
  function rangeFromOffsets(slide, start, end) {
    var walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT, null);
    var pos = 0, range = document.createRange(), gotS = false, gotE = false, node;
    while ((node = walker.nextNode())) {
      var len = node.nodeValue.length;
      if (!gotS && start <= pos + len) { range.setStart(node, start - pos); gotS = true; }
      if (!gotE && end <= pos + len) { range.setEnd(node, end - pos); gotE = true; break; }
      pos += len;
    }
    return (gotS && gotE) ? range : null;
  }
  function resolveRange(a) {
    var slide = a.slideId ? document.getElementById(a.slideId) : allSlides()[a.slideIndex];
    if (!slide) return null;
    var r = rangeFromOffsets(slide, a.renderedStart, a.renderedEnd);
    if (r && slide.textContent.slice(a.renderedStart, a.renderedEnd) === a.quote) return r;
    // fallback: re-find by prefix+quote within the slide text
    var text = slide.textContent;
    var idx = text.indexOf(a.prefix + a.quote);
    if (idx >= 0) idx += a.prefix.length; else idx = text.indexOf(a.quote);
    if (idx < 0) return null;
    return rangeFromOffsets(slide, idx, idx + a.quote.length);
  }
  function cssPath(node) {
    if (!node || node.nodeType !== 1) return null;
    var parts = [], el = node, depth = 0;
    while (el && el.nodeType === 1 && depth < 5) {
      var part = el.tagName.toLowerCase();
      if (el.id) { parts.unshift("#" + el.id); break; }
      if (el.className && typeof el.className === "string") {
        var c = el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2);
        if (c.length) part += "." + c.join(".");
      }
      var sibs = el.parentElement ? Array.prototype.filter.call(el.parentElement.children,
        function (s) { return s.tagName === el.tagName; }) : [];
      if (sibs.length > 1) part += ":nth-of-type(" + (sibs.indexOf(el) + 1) + ")";
      parts.unshift(part); el = el.parentElement; depth++;
    }
    return parts.join(" > ");
  }

  /* --------------------------- highlights --------------------------------- */
  function renderHighlights() {
    if (!review || !(window.CSS && CSS.highlights && window.Highlight)) return;
    var ranges = [];
    state.annotations.forEach(function (a) {
      if (a.status === "done") return;
      var r = resolveRange(a); if (r) ranges.push(r);
    });
    CSS.highlights.set("sa-all", makeHL(ranges));
  }
  function makeHL(ranges) { var h = new Highlight(); ranges.forEach(function (r) { h.add(r); }); return h; }
  function flash(a) {
    if (!(window.CSS && CSS.highlights && window.Highlight)) return;
    var r = resolveRange(a); if (!r) return;
    var h = new Highlight(); h.add(r); CSS.highlights.set("sa-active", h);
    setTimeout(function () { CSS.highlights.delete("sa-active"); }, 1400);
  }
  function goTo(a) {
    if (!a) return;
    if (typeof window.deckGoto === "function" && a.slideIndex >= 0) window.deckGoto(a.slideIndex);
    else { var s = a.slideId ? document.getElementById(a.slideId) : allSlides()[a.slideIndex]; if (s) s.scrollIntoView({ behavior: "smooth", block: "center" }); }
    setTimeout(function () { flash(a); }, 220);
  }

  /* ------------------------------ panel ----------------------------------- */
  function renderPanel() {
    updateCount();
    var cur = currentSlideIndex();
    var list = state.annotations.filter(function (a) { return !onlyThisSlide || a.slideIndex === cur; });
    if (!list.length) {
      ui.list.innerHTML = '<div class="sa-empty">' +
        (onlyThisSlide ? "No annotations on this slide." :
        "No annotations yet.<br><br>Select text on a slide to highlight it. Highlights autosave locally; click <b>Connect folder</b> to write the sidecar JSON and capture source line numbers.") +
        '</div>';
      return;
    }
    ui.list.innerHTML = list.map(cardHTML).join("");
  }
  function cardHTML(a) {
    var loc = a.source && a.source.line ? ("L" + a.source.line + (a.source.column ? ":" + a.source.column : "")) : "";
    return '<div class="sa-card ' + (a.status === "done" ? "done" : "") + '" data-id="' + a.id + '">' +
      '<div class="sa-meta"><span>' + esc(a.slideLabel || ("#" + (a.slideIndex + 1))) +
        (a.slideTitle ? " · " + esc(a.slideTitle) : "") + '</span>' +
        '<span class="src">' + loc + '</span></div>' +
      '<div class="sa-quote">' + esc(trim(a.quote, 160)) + '</div>' +
      (a.note ? '<div class="sa-note">“' + esc(a.note) + '”</div>' : "") +
      '<div class="sa-cardrow">' +
        '<button class="sa-mini" data-act="go">Go</button>' +
        '<button class="sa-mini" data-act="toggle">' + (a.status === "done" ? "Reopen" : "Mark done") + '</button>' +
        '<button class="sa-mini del" data-act="del">Delete</button>' +
      '</div></div>';
  }
  function currentSlideIndex() {
    var slides = allSlides();
    for (var i = 0; i < slides.length; i++) if (slides[i].classList.contains("active")) return i;
    // else the slide most centered in viewport
    var best = 0, bestD = Infinity, cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    slides.forEach(function (s, i) {
      var r = s.getBoundingClientRect();
      if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) return;
      var d = Math.hypot((r.left + r.right) / 2 - cx, (r.top + r.bottom) / 2 - cy);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  /* --------------------------- persistence -------------------------------- */
  function loadLocal() {
    try { var t = localStorage.getItem(LS_KEY); if (t) return JSON.parse(t); } catch (e) {}
    return { version: 1, tool: "slide-annotator", target: cfg.target, annotations: [] };
  }
  function persistLocal() {
    state.updatedAt = new Date().toISOString();
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
    updateCount();
  }
  function updateCount() {
    if (ui.count) ui.count.textContent = state.annotations.length;
  }

  /* Persist the connected directory handle across reloads. FileSystemHandles are
   * structured-cloneable, so they live in IndexedDB (localStorage is strings
   * only). Re-granting read/write permission after a reload needs a user
   * gesture, so a remembered folder reconnects with one click via the same
   * "Connect folder" button rather than the full directory picker. Keyed by
   * cfg.target so distinct decks in a folder don't clobber each other. */
  var IDB_NAME = "slide-annotator", IDB_STORE = "handles";
  function idbOpen() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error("no-idb")); return; }
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbGet(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var r = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
        r.onsuccess = function () { resolve(r.result || null); };
        r.onerror = function () { reject(r.error); };
      });
    }).catch(function () { return null; });
  }
  function idbSet(key, val) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(val, key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () { return false; });
  }

  function updateConnectLabel() {
    if (!ui.connectBtn) return;
    ui.connectBtn.textContent = dirHandle ? "Folder connected"
      : rememberedHandle ? "Reconnect folder" : "Connect folder";
  }

  // Adopt a (freshly picked or re-granted) handle: link source, load any
  // sidecar, and remember it for next time. Shared by connect and restore.
  async function adoptFolder(handle) {
    dirHandle = handle;
    // read page source → enables source line/column resolution
    try {
      var fh = await dirHandle.getFileHandle(cfg.target);
      sourceText = await (await fh.getFile()).text();
      state.annotations.forEach(function (a) { a.source = locateInSource(a); });
    } catch (e) { sourceText = null; setStatus("Connected, but '" + cfg.target + "' not found in folder — line numbers unavailable."); }
    // load an existing sidecar if present
    try {
      var sh = await dirHandle.getFileHandle(SIDECAR);
      mergeLoaded(JSON.parse(await (await sh.getFile()).text()));
    } catch (e) { /* none yet */ }
    await idbSet(cfg.target, dirHandle);
    rememberedHandle = null;
    updateConnectLabel();
    persistLocal(); renderPanel(); renderHighlights();
    setStatus("Connected. Saving to " + SIDECAR + (sourceText ? " · source linked" : ""));
  }

  async function connectFolder() {
    // Prefer a folder remembered from a prior session: re-granting permission is
    // a single click (this click IS the required user gesture), no picker.
    if (rememberedHandle) {
      try {
        var perm = await rememberedHandle.requestPermission({ mode: "readwrite" });
        if (perm === "granted") { await adoptFolder(rememberedHandle); return; }
      } catch (e) { /* fall through to the picker */ }
      rememberedHandle = null; updateConnectLabel();
    }
    if (!window.showDirectoryPicker) { setStatus("Folder access unsupported in this browser. Use Save (downloads the JSON)."); return; }
    try {
      await adoptFolder(await window.showDirectoryPicker({ mode: "readwrite" }));
    } catch (e) {
      if (e && e.name !== "AbortError") setStatus("Folder access blocked (" + e.name + "). Use Save to download the JSON instead.");
    }
  }

  // On load, try to restore a previously connected folder. queryPermission needs
  // no gesture; if it's still "granted" we reconnect silently. If it's "prompt",
  // we keep the handle so the next "Connect folder" click reconnects with one
  // grant dialog (no picker). Handles cleared/denied storage are ignored.
  function restoreFolder() {
    idbGet(cfg.target).then(function (handle) {
      if (!handle || typeof handle.queryPermission !== "function") return;
      handle.queryPermission({ mode: "readwrite" }).then(function (perm) {
        if (perm === "granted") { adoptFolder(handle); }
        else {
          rememberedHandle = handle; updateConnectLabel();
          if (review) setStatus("Folder '" + cfg.target + "' remembered — click Reconnect folder.");
        }
      }).catch(function () {});
    });
  }

  async function saveDisk() {
    if (sourceText) state.annotations.forEach(function (a) { if (!a.source) a.source = locateInSource(a); });
    var json = JSON.stringify(serialize(), null, 2);
    if (dirHandle) {
      try {
        var sh = await dirHandle.getFileHandle(SIDECAR, { create: true });
        var w = await sh.createWritable(); await w.write(json); await w.close();
        setStatus("Saved " + SIDECAR + " ✓"); toast("Saved " + SIDECAR);
        return;
      } catch (e) { setStatus("Disk write failed (" + e.name + "). Downloaded instead."); }
    }
    download(SIDECAR, json);
    setStatus("Downloaded " + SIDECAR + " — move it next to the deck.");
  }

  async function loadDisk() {
    if (dirHandle) {
      try {
        var sh = await dirHandle.getFileHandle(SIDECAR);
        mergeLoaded(JSON.parse(await (await sh.getFile()).text()));
        persistLocal(); renderPanel(); renderHighlights();
        setStatus("Reloaded " + SIDECAR + " from disk."); return;
      } catch (e) { setStatus("Could not read " + SIDECAR + " from the folder."); return; }
    }
    // fallback: file input
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = "application/json,.json";
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function () { try { mergeLoaded(JSON.parse(fr.result)); persistLocal(); renderPanel(); renderHighlights(); setStatus("Loaded " + f.name); } catch (e) { setStatus("Invalid JSON."); } };
      fr.readAsText(f);
    };
    inp.click();
  }
  function mergeLoaded(obj) {
    if (obj && Array.isArray(obj.annotations)) state.annotations = obj.annotations;
  }
  function serialize() {
    return { version: 1, tool: "slide-annotator", target: cfg.target, updatedAt: new Date().toISOString(), annotations: state.annotations };
  }
  function download(name, text) {
    var blob = new Blob([text], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* --------------------- source line/column resolution -------------------- */
  // Normalize HTML source: strip tags, decode entities, collapse whitespace,
  // and keep a map from each normalized-char index back to a source index.
  function normSource(src) {
    if (normSource._src === src) return normSource._res;
    var ents = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
    var map = [], out = "", i = 0, inTag = false, lastSpace = true;
    while (i < src.length) {
      var c = src[i];
      if (inTag) { if (c === ">") inTag = false; i++; continue; }
      if (c === "<") { inTag = true; i++; continue; }
      if (c === "&") {
        var m = /^&(#?\w+);/.exec(src.slice(i, i + 12));
        if (m) {
          var ch = ents[m[1]];
          if (ch === undefined && m[1][0] === "#") { var code = parseInt(m[1].slice(1), 10); if (!isNaN(code)) ch = String.fromCharCode(code); }
          if (ch === undefined) ch = "?";
          if (/\s/.test(ch)) { if (!lastSpace) { out += " "; map.push(i); lastSpace = true; } }
          else { out += ch; map.push(i); lastSpace = false; }
          i += m[0].length; continue;
        }
      }
      if (/\s/.test(c)) { if (!lastSpace) { out += " "; map.push(i); lastSpace = true; } i++; continue; }
      out += c; map.push(i); lastSpace = false; i++;
    }
    normSource._src = src; normSource._res = { norm: out, map: map };
    return normSource._res;
  }
  function collapse(s) { return (s || "").replace(/\s+/g, " ").trim(); }
  function locateInSource(a) {
    var res = { file: cfg.target, line: null, column: null, match: "none", contextBefore: [], contextLine: null, contextAfter: [] };
    if (!sourceText) return res;
    var N = normSource(sourceText);
    var needle = collapse(a.quote); if (!needle) return res;
    var pfx = collapse(a.prefix), sfx = collapse(a.suffix);
    var nstart = -1, match = "none";
    var pt = pfx.slice(-25);
    if (pt) { var i = N.norm.indexOf(pt + needle); if (i >= 0) { nstart = i + pt.length; match = "exact"; } }
    if (nstart < 0) {
      var hits = [], from = 0, k;
      while ((k = N.norm.indexOf(needle, from)) >= 0) { hits.push(k); from = k + 1; }
      if (hits.length === 1) { nstart = hits[0]; match = "exact"; }
      else if (hits.length > 1) {
        var sh = sfx.slice(0, 25);
        for (var j = 0; j < hits.length; j++) { if (N.norm.slice(hits[j] + needle.length, hits[j] + needle.length + sh.length) === sh) { nstart = hits[j]; match = "normalized"; break; } }
        if (nstart < 0) { nstart = hits[0]; match = "normalized"; }
      }
    }
    if (nstart < 0) return res;
    var srcIdx = N.map[nstart];
    var upto = sourceText.slice(0, srcIdx);
    var line = (upto.match(/\n/g) || []).length + 1;
    var col = srcIdx - upto.lastIndexOf("\n");
    var lines = sourceText.split("\n");
    res.line = line; res.column = col; res.match = match;
    res.contextBefore = lines.slice(Math.max(0, line - 1 - cfg.ctx), line - 1);
    res.contextLine = lines[line - 1];
    res.contextAfter = lines.slice(line, line + cfg.ctx);
    return res;
  }

  /* ------------------------------ misc ------------------------------------ */
  var toastTimer;
  function toast(msg) { ui.toast.textContent = msg; ui.toast.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { ui.toast.classList.remove("on"); }, 2200); }
  function setStatus(msg) { if (ui.status) ui.status.textContent = msg; }
  function byId(id) { return state.annotations.filter(function (a) { return a.id === id; })[0]; }
  function uid() { return "a" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function trim(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  /* --------------------------- public hook -------------------------------- */
  window.__slideAnnotator = {
    toggle: toggle,
    save: saveDisk,
    connect: connectFolder,
    // Supply page source to resolve source line/column without the folder picker.
    setSource: function (text) { sourceText = text; state.annotations.forEach(function (a) { a.source = locateInSource(a); }); persistLocal(); renderPanel(); },
    get state() { return state; },
    // for automation/testing:
    _capture: captureSelection,
    _confirm: function (note) { if (pending) { ui.note.value = note || ""; confirmPending(); } }
  };

  updateCount();
  restoreFolder();
})();
