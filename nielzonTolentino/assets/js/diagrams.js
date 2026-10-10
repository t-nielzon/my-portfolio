/* interactive architecture diagrams: animated svg scenes rendered per frame,
   opened in a modal with playback controls and per-node explainers */
(function () {
  "use strict";

  var SLOW = 1.6; // scene seconds are stretched so motion reads calmly
  var W = 124, H = 44;
  var BX = function (i) { return 24 + i * 146; };

  // ---------- helpers ----------
  function clamp(x) { return Math.max(0, Math.min(1, x)); }
  function smooth(x) { x = clamp(x); return x * x * x * (x * (6 * x - 15) + 10); }
  function ease(x) { x = clamp(x); return x * x * (3 - 2 * x); }
  function k(t, a, b) { return ease((t - a) / (b - a)); }
  function dots(t) { return ".".repeat(1 + Math.floor((t * 5) % 3)); }
  function glowAt(t, a, b) {
    if (t >= a && t < b) return 1;
    if (t >= b) return Math.max(0, 1 - (t - b) / 0.5);
    return 0;
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function Ctx(sel, hov) { this.sel = sel; this.hov = hov; this.out = []; this.rects = []; }
  Ctx.prototype.push = function (s) { this.out.push(s); };
  Ctx.prototype.text = function (x, y, t, cls) {
    this.push('<text x="' + x + '" y="' + y + '" class="' + cls + '">' + esc(t) + "</text>");
  };
  Ctx.prototype.box = function (id, x, y, w, h, t1, t2, o) {
    o = o || {};
    var cls = "node" + (o.dark ? " dk" : "") + (this.sel === id ? " sel" : "") + (this.hov === id ? " hov" : "");
    this.rects.push({ id: id, x: x, y: y, w: w, h: h, label: t1 });
    var s = '<g class="' + cls + '" data-id="' + id + '">';
    if (o.glow > 0) {
      s += '<rect class="glow' + (o.ring === "bad" ? " bad" : "") + '" x="' + (x - 4) + '" y="' + (y - 4) +
        '" width="' + (w + 8) + '" height="' + (h + 8) + '" rx="11" opacity="' + Math.min(1, o.glow).toFixed(2) + '"/>';
    }
    s += '<rect class="nb' + (o.dashed ? " dash" : "") + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8"/>';
    var cy = y + h / 2;
    s += '<text class="t1" x="' + (x + w / 2) + '" y="' + (cy - 3) + '">' + esc(t1) + "</text>";
    s += '<text class="t2' + (o.sub ? " " + o.sub : "") + '" x="' + (x + w / 2) + '" y="' + (cy + 13) + '">' + esc(t2) + "</text>";
    this.push(s + "</g>");
  };
  Ctx.prototype.arrow = function (x1, y1, x2, y2) {
    this.push('<line class="ar" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" marker-end="url(#dg-arw)"/>');
  };
  Ctx.prototype.trip = function (t, ta, tb, a, b, cls) {
    // dots travel edge to edge and fade at both ends so they never cover node text
    if (!(t >= ta && t < tb)) return;
    var u = (t - ta) / (tb - ta), f = smooth(u);
    var al = Math.max(0, Math.min(1, u / 0.18, (1 - u) / 0.22));
    this.dot(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, al, cls);
  };
  Ctx.prototype.dot = function (x, y, al, cls) {
    this.push('<g class="pk' + (cls ? " " + cls : "") + '" opacity="' + al.toFixed(2) + '"><circle cx="' + x.toFixed(1) +
      '" cy="' + y.toFixed(1) + '" r="14" fill="url(#dg-pg)"/><circle class="pc" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="5"/></g>');
  };
  Ctx.prototype.head = function (label, title) {
    this.push('<rect class="bg" width="600" height="338"/><rect class="bar" width="6" height="338"/>');
    this.text(24, 34, label, "lbl");
    this.text(24, 60, title, "ttl");
  };

  // ---------- scenes ----------
  function scribe(c, t) {
    c.head("HEALTHCARE AI · NAVIX", "NavixScribe clinical documentation");
    [[94, "SCRIBE"], [168, "DICTATION"], [242, "BENEFITS VERIFICATION"]].forEach(function (l) { c.text(24, l[0] - 6, l[1], "lane"); });
    var row = function (y, items) {
      items.forEach(function (it, i) {
        c.box(it[0], BX(i), y, W, H, it[1], it[2], it[3]);
        if (i) c.arrow(BX(i) - 21, y + 22, BX(i) - 2, y + 22);
      });
    };
    var fail = t >= 0.9 && t < 1.4, ok1 = t >= 1.4 && t < 2.6;
    row(94, [
      ["audio", "Session audio", "5 s chunks", { glow: glowAt(t, 0.3, 0.6) }],
      ["upload", "Chunk upload", fail ? "upload failed" : ok1 ? "retry → persisted ✓" : "persist + retry",
        { dark: true, glow: glowAt(t, 0.9, 1.7), ring: fail ? "bad" : "", sub: fail ? "bad" : ok1 ? "ok" : "" }],
      ["transcribe", "Transcription", t >= 2.3 && t < 3.2 ? "polling" + dots(t) : t >= 3.2 && t < 4.4 ? "transcript ✓" : "bounded polling",
        { glow: glowAt(t, 2.3, 3.2), sub: t >= 3.2 && t < 4.4 ? "ok" : "" }],
      ["notegen", "Note generation", t >= 3.8 && t < 4.5 ? "drafting" + dots(t) : t >= 4.5 ? "note ready ✓" : "custom templates",
        { glow: glowAt(t, 3.8, 4.6), sub: t >= 4.5 ? "ok" : "" }]
    ]);
    var typed = t >= 4.8 ? "live transcript".slice(0, Math.max(0, Math.floor((t - 4.8) * 12))) : "";
    row(168, [
      ["mic", "Browser mic", "live capture", { glow: glowAt(t, 2.0, 2.3) }],
      ["broker", "Token broker", t >= 2.6 && t < 3.6 ? "token minted" : t >= 5.2 ? "token expired" : "ephemeral keys",
        { dark: true, glow: glowAt(t, 2.6, 3.0), sub: t >= 2.6 && t < 3.6 ? "ok" : t >= 5.2 ? "dim" : "" }],
      ["deepgram", "Deepgram", t >= 3.6 && t < 5.0 ? "streaming" + dots(t) : "streaming STT", { glow: glowAt(t, 3.6, 5.0) }],
      ["note", "Clinical note", t >= 4.8 && t < 6.2 ? typed + "▍" : t >= 6.2 ? "inserted ✓" : "inline insert",
        { glow: glowAt(t, 4.8, 6.2), sub: t >= 6.2 ? "ok" : "" }]
    ]);
    var n = t >= 7.0 ? Math.min(7, Math.floor((t - 7.0) / 0.12) + 1) : 0;
    row(242, [
      ["payer", "Payer documents", "chunked", { glow: glowAt(t, 4.5, 4.8) }],
      ["vob", "VOB agent", t >= 5.1 && t < 5.8 ? "reasoning" + dots(t) : "LangGraph", { dark: true, glow: glowAt(t, 5.1, 5.8) }],
      ["memory", "Case memory", t >= 6.1 ? "thread saved ✓" : "per-thread", { glow: glowAt(t, 5.8, 6.4), sub: t >= 6.1 ? "ok" : "" }],
      ["brief", "Admission brief", t >= 7.0 ? n + "/7 sections" : "7 sections", { glow: glowAt(t, 6.4, 7.9), sub: n === 7 ? "ok" : "" }]
    ]);
    var E = function (i, y, r) { return [BX(i) + (r ? W : 0), y + 22]; };
    [[0.3, 0.9, 0, 1, 94], [1.7, 2.3, 1, 2, 94], [3.2, 3.8, 2, 3, 94], [2.0, 2.6, 0, 1, 168], [3.0, 3.6, 1, 2, 168],
      [4.2, 4.8, 2, 3, 168], [4.5, 5.1, 0, 1, 242], [5.8, 6.1, 1, 2, 242], [6.4, 7.0, 2, 3, 242]].forEach(function (m) {
      c.trip(t, m[0], m[1], E(m[2], m[4], true), E(m[3], m[4], false));
    });
    if (fail) c.dot(BX(1) - 9, 116, 1, "bad");
    var cap = t < 2.0 ? "Audio chunks persist and retry, so a flaky clinic connection never loses a session."
      : t < 4.5 ? "Dictation runs on short-lived tokens, so speech-API keys never reach the browser."
        : "A LangGraph agent keeps per-case memory while it builds the admission brief.";
    c.text(24, 304, cap, "cap");
    c.text(24, 322, "Node.js · React · Azure OpenAI · Deepgram · LangGraph · Stripe billing", "foot");
  }

  function smartfill(c, t) {
    c.head("HEALTHCARE EMR · NAVIX HUB", "SmartFill multi-agent form autofill");
    c.box("form", 24, 152, 104, 50, "EMR form", t < 5.4 ? "clinical form" : "filled ✓", { glow: glowAt(t, 0.2, 0.5), sub: t >= 5.4 ? "ok" : "" });
    c.arrow(129, 177, 150, 177);
    c.box("orchestrator", 152, 152, 118, 50, "Orchestrator", t >= 0.9 && t < 1.6 ? "planning" + dots(t) : "field-group plan",
      { dark: true, glow: glowAt(t, 0.9, 1.6) });
    c.box("chart", 152, 240, 118, 44, "Chart retrieval", "targeted context", { glow: glowAt(t, 0.6, 1.2) });
    c.arrow(211, 239, 211, 204);
    var ends = [3.2, 3.9, 4.5], names = ["demographics", "clinical", "assessments"], ids = ["agentA", "agentB", "agentC"];
    for (var i = 0; i < 3; i++) {
      var y = 86 + i * 66, run = t >= 2.2 && t < ends[i], done = t >= ends[i];
      c.box(ids[i], 300, y, 136, 46, "Field-group agent", names[i] + (done ? " ✓" : ""),
        { glow: run ? 1 : glowAt(t, ends[i], ends[i]), sub: done ? "ok" : "" });
      var f = t >= 2.2 ? k(t, 2.2, ends[i]) : 0;
      c.push('<rect class="trk" x="312" y="' + (y + 41) + '" width="112" height="2.5" rx="1.25"/>');
      if (f > 0) c.push('<rect class="prg' + (done ? " ok" : "") + '" x="312" y="' + (y + 41) + '" width="' + (112 * f).toFixed(1) + '" height="2.5" rx="1.25"/>');
      c.arrow(271, 177, 298, y + 23);
      c.arrow(437, y + 23, 462, 165 + i * 12);
    }
    var landed = ends.filter(function (e) { return t >= e + 0.5; }).length;
    var pct = t >= 5.0 ? "schema ✓ · PII ✓" : ["schema · PII filter", "33% of fields", "67% of fields", "100% of fields"][landed];
    c.box("validated", 464, 152, 112, 50, "Validated fill", pct, { dark: true, glow: glowAt(t, ends[0] + 0.5, 5.4), sub: t >= 5.0 ? "ok" : "" });
    c.trip(t, 0.2, 0.9, [128, 177], [152, 177]);
    c.trip(t, 0.6, 1.2, [211, 240], [211, 202]);
    for (var j = 0; j < 3; j++) {
      c.trip(t, 1.6, 2.2, [270, 177], [300, 86 + j * 66 + 23]);
      c.trip(t, ends[j], ends[j] + 0.5, [436, 86 + j * 66 + 23], [464, 165 + j * 12]);
    }
    var cap = t < 1.6 ? "The orchestrator pulls only the chart context each field group needs."
      : t < 5.0 ? "Field-group agents run in parallel instead of one long serial prompt."
        : "Merged output is schema-validated and PII-filtered before it reaches the form.";
    c.text(24, 304, cap, "cap");
    c.text(24, 322, "Laravel · Next.js · OpenAI · AWS Bedrock · LangGraph · structured outputs", "foot");
  }

  function monee(c, T) {
    var fail = T >= 6, t = fail ? T - 6 : T;
    var near = function (arrive, hold) {
      hold = hold === undefined ? 0.5 : hold;
      if (t < arrive - 0.1) return 0;
      var d = t - arrive;
      return d >= 0 ? Math.max(0, 1 - Math.max(0, d - hold) / 0.6) : (t - (arrive - 0.1)) / 0.1;
    };
    c.head("FINTECH SUPPORT · MONEE", "Serverless AI support pipeline");
    c.text(24, 88, "INGEST", "lane");
    var r1 = [["webhook", "Helpdesk webhook", "inbound ticket"], ["apigw", "API Gateway", "Go on Lambda"],
      ["streams", "DynamoDB Streams", "+ SQS fan-out"], ["turn", "Turn state machine", "one owner per turn"]];
    var arr = [0.4, 1.0, 1.6, 2.2];
    r1.forEach(function (b, i) {
      c.box(b[0], BX(i), 94, W, H, b[1], b[2], { dark: i === 3, glow: near(arr[i]) });
      if (i) c.arrow(BX(i) - 21, 116, BX(i) - 2, 116);
    });
    c.arrow(BX(3) + 62, 139, BX(3) + 62, 186);
    c.text(24, 180, "GENERATE · GATE · SEND", "lane");
    var drafting = t >= 2.8 && t < 3.9;
    c.box("claude", BX(3), 188, W, H, "Claude + RAG", drafting ? "drafting" + dots(t) : "on Databricks", { glow: drafting ? 1 : near(3.9, 0.1) });
    c.box("policy", BX(2), 188, W, H, "Policy gate", "six-gate check", { dark: true, glow: t >= 4.4 && t < 5.3 ? 1 : 0 });
    for (var g = 0; g < 6; g++) {
      var lit = t >= 4.45 + g * 0.14, bad = fail && g === 4;
      c.push('<circle class="lamp' + (lit ? (bad ? " bad" : " ok") : "") + '" cx="' + (BX(2) + 62 - 35 + g * 14) + '" cy="' + (188 + H + 14) + '" r="4.5"/>');
    }
    var done = t >= 5.8;
    c.box("reply", BX(1), 188, W, H, "Reply or handoff", done ? (fail ? "internal note → human" : "auto-sent ✓") : "auto-send / note",
      { glow: near(5.8, 0.6), sub: done ? (fail ? "warn" : "ok") : "" });
    c.box("replay", BX(0), 188, W, H, "Replay harness", "CI gate on models", { dashed: true });
    c.arrow(BX(3) - 1, 210, BX(3) - 20, 210);
    c.arrow(BX(2) - 1, 210, BX(2) - 20, 210);
    var cap = done ? (fail ? "One gate failed, so the draft becomes an internal note. No guessed answers reach customers."
      : "All six gates passed, so the reply goes out automatically.")
      : "Uncertain replies degrade to an internal note for a human agent, never a guessed answer.";
    c.text(24, 270, cap, "cap" + (done ? (fail ? " warn" : " ok") : " muted"));
    [[0.4, 1.0, [BX(0) + W, 116], [BX(1), 116]], [1.0, 1.6, [BX(1) + W, 116], [BX(2), 116]], [1.6, 2.2, [BX(2) + W, 116], [BX(3), 116]],
      [2.2, 2.8, [BX(3) + 62, 138], [BX(3) + 62, 188]], [3.9, 4.4, [BX(3), 210], [BX(2) + W, 210]], [5.3, 5.8, [BX(2), 210], [BX(1) + W, 210]]
    ].forEach(function (m) { c.trip(t, m[0], m[1], m[2], m[3]); });
    c.text(24, 322, "Go · AWS Lambda · DynamoDB · SQS · SAM · Databricks · Claude · Python", "foot");
  }

  // segments map playback time to scene time; holds freeze the scene on a story ending
  var SCENES = {
    navixscribe: { draw: scribe, brand: "scribe", segs: [[0, 8.6], ["hold", 1.25]] },
    smartfill: { draw: smartfill, brand: "smartfill", segs: [[0, 6.6], ["hold", 1.25]] },
    monee: { draw: monee, brand: "monee", segs: [[0, 6.0], ["hold", 1.0], [6.0, 12.0], ["hold", 1.0]] }
  };
  function totalLen(sc) {
    return sc.segs.reduce(function (a, s) { return a + (s[0] === "hold" ? s[1] : s[1] - s[0]); }, 0) * SLOW;
  }
  function sceneTime(sc, wall) {
    var u = wall / SLOW, last = 0;
    for (var i = 0; i < sc.segs.length; i++) {
      var s = sc.segs[i];
      if (s[0] === "hold") { if (u < s[1]) return last - 0.001; u -= s[1]; continue; }
      var len = s[1] - s[0];
      if (u < len) return s[0] + u;
      u -= len; last = s[1];
    }
    return last - 0.001;
  }

  function render(svg, key, t, sel, hov) {
    var c = new Ctx(sel, hov);
    SCENES[key].draw(c, t);
    svg.querySelector(".dg-layer").innerHTML = c.out.join("");
    return c.rects;
  }

  // node geometry is static per scene, so hit targets are built once and never
  // replaced; the animated layer underneath can redraw every frame without
  // breaking clicks, hover or keyboard focus
  function buildHits(svg, rects) {
    svg.querySelector(".dg-hits").innerHTML = rects.map(function (r) {
      return '<rect class="hit" data-id="' + r.id + '" x="' + (r.x - 2) + '" y="' + (r.y - 2) + '" width="' + (r.w + 4) +
        '" height="' + (r.h + 4) + '" rx="9" tabindex="0" role="button" aria-label="' + esc(r.label) + '"/>';
    }).join("");
  }

  function svgShell() {
    return '<svg class="dg-svg" viewBox="0 0 600 338" role="img" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><marker id="dg-arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path class="arh" d="M0 0L10 5L0 10z"/></marker>' +
      '<radialGradient id="dg-pg"><stop class="pg0" offset="0"/><stop class="pg1" offset="1"/></radialGradient></defs>' +
      '<g class="dg-layer"></g><g class="dg-hits"></g></svg>';
  }

  // ---------- modal ----------
  var modal, stage, svg, panel, btnPlay, bar, fill, current, playing, wall, last, raf, selected, hovered, opener;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function build() {
    modal = document.createElement("div");
    modal.className = "dg-modal";
    modal.setAttribute("hidden", "");
    modal.innerHTML =
      '<div class="dg-backdrop" data-close></div>' +
      '<div class="dg-dialog" role="dialog" aria-modal="true" aria-labelledby="dg-title">' +
      '<button class="dg-close" type="button" aria-label="Close" data-close>&times;</button>' +
      '<div class="dg-main"><div class="dg-stage"></div>' +
      '<div class="dg-controls">' +
      '<button class="dg-play" type="button" aria-label="Pause"></button>' +
      '<button class="dg-restart" type="button" aria-label="Restart">&#8635;</button>' +
      '<div class="dg-bar" role="slider" tabindex="0" aria-label="Timeline" aria-valuemin="0" aria-valuemax="100"><div class="dg-fill"></div></div>' +
      '<span class="dg-hint">Click any component to explore it</span></div></div>' +
      '<aside class="dg-panel" aria-live="polite"></aside></div>';
    document.body.appendChild(modal);
    stage = modal.querySelector(".dg-stage");
    stage.innerHTML = svgShell();
    svg = stage.querySelector("svg");
    panel = modal.querySelector(".dg-panel");
    btnPlay = modal.querySelector(".dg-play");
    bar = modal.querySelector(".dg-bar");
    fill = modal.querySelector(".dg-fill");

    modal.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) close();
    });
    btnPlay.addEventListener("click", function () { setPlaying(!playing); });
    modal.querySelector(".dg-restart").addEventListener("click", function () { wall = 0; setPlaying(true); });
    svg.addEventListener("click", function (e) {
      var n = e.target.closest(".hit");
      if (n) select(n.getAttribute("data-id"));
    });
    svg.addEventListener("keydown", function (e) {
      var n = e.target.closest(".hit");
      if (n && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); select(n.getAttribute("data-id")); }
    });
    svg.addEventListener("pointerover", function (e) {
      var n = e.target.closest(".hit");
      hovered = n ? n.getAttribute("data-id") : null;
      if (!playing) draw();
    });
    svg.addEventListener("pointerleave", function () { hovered = null; if (!playing) draw(); });
    panel.addEventListener("click", function (e) {
      var b = e.target.closest("[data-node]");
      if (b) select(b.getAttribute("data-node") || null);
    });
    var scrub = function (e) {
      var r = bar.getBoundingClientRect();
      wall = clamp((e.clientX - r.left) / r.width) * totalLen(SCENES[current]);
      draw();
    };
    bar.addEventListener("pointerdown", function (e) {
      setPlaying(false); scrub(e);
      bar.setPointerCapture(e.pointerId);
      bar.onpointermove = scrub;
      bar.onpointerup = function () { bar.onpointermove = null; };
    });
    bar.addEventListener("keydown", function (e) {
      var step = totalLen(SCENES[current]) / 40;
      if (e.key === "ArrowRight") wall = Math.min(totalLen(SCENES[current]), wall + step);
      else if (e.key === "ArrowLeft") wall = Math.max(0, wall - step);
      else return;
      e.preventDefault(); setPlaying(false); draw();
    });
    document.addEventListener("keydown", function (e) {
      if (modal.hasAttribute("hidden")) return;
      if (e.key === "Escape") close();
      else if (e.key === " " && !e.target.closest("button, [role=slider]")) { e.preventDefault(); setPlaying(!playing); }
      else if (e.key === "Tab") trap(e);
    });
  }

  function trap(e) {
    var f = modal.querySelectorAll("button, [tabindex='0']");
    if (!f.length) return;
    var first = f[0], lastEl = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
  }

  function setPlaying(p) {
    playing = p;
    btnPlay.classList.toggle("paused", !p);
    btnPlay.setAttribute("aria-label", p ? "Pause" : "Play");
    if (p) { last = null; raf = requestAnimationFrame(tick); } else cancelAnimationFrame(raf);
  }

  function tick(ts) {
    if (!playing) return;
    if (last !== null) wall = (wall + (ts - last) / 1000) % totalLen(SCENES[current]);
    last = ts;
    draw();
    raf = requestAnimationFrame(tick);
  }

  function draw() {
    var sc = SCENES[current];
    var rects = render(svg, current, sceneTime(sc, wall), selected, hovered);
    drawUi();
    return rects;
  }
  function drawUi() {
    var p = wall / totalLen(SCENES[current]);
    fill.style.width = (p * 100).toFixed(2) + "%";
    bar.setAttribute("aria-valuenow", Math.round(p * 100));
  }

  function content() { return (window.DIAGRAM_CONTENT || {})[current] || { nodes: {} }; }

  function nodeList(sel) {
    var nodes = content().nodes || {};
    return '<div class="dg-chips">' + Object.keys(nodes).map(function (id) {
      return '<button type="button" class="dg-chip' + (id === sel ? " on" : "") + '" data-node="' + id + '">' + esc(nodes[id].title) + "</button>";
    }).join("") + "</div>";
  }

  function nested(n) {
    if (!n || !n.steps) return "";
    var steps = n.steps.map(function (s) {
      return '<div class="dg-step"><strong>' + esc(s.label) + "</strong>" + (s.sub ? "<span>" + esc(s.sub) + "</span>" : "") + "</div>";
    }).join('<div class="dg-step-arrow" aria-hidden="true"></div>');
    return '<figure class="dg-nested ' + (n.direction === "col" ? "dg-col" : "dg-row") + '">' +
      (n.caption ? "<figcaption>" + esc(n.caption) + "</figcaption>" : "") + '<div class="dg-steps">' + steps + "</div></figure>";
  }

  function showPanel() {
    var d = content(), html;
    if (!selected || !d.nodes[selected]) {
      html = '<h3 id="dg-title">' + esc(d.title || "") + "</h3>" +
        (d.summary ? "<p>" + esc(d.summary) + "</p>" : "") +
        '<p class="dg-sub">Components</p>' + nodeList(null);
    } else {
      var n = d.nodes[selected];
      html = '<button type="button" class="dg-back" data-node="">&larr; Overview</button>' +
        '<h3 id="dg-title">' + esc(n.title) + "</h3>" +
        (n.tagline ? '<p class="dg-tag">' + esc(n.tagline) + "</p>" : "") +
        (n.body || []).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") +
        (n.points && n.points.length ? "<ul>" + n.points.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>" : "") +
        nested(n.nested) +
        (n.stack && n.stack.length ? '<div class="dg-stack">' + n.stack.map(function (s) { return "<span>" + esc(s) + "</span>"; }).join("") + "</div>" : "") +
        '<p class="dg-sub">Other components</p>' + nodeList(selected);
    }
    panel.innerHTML = html;
    panel.scrollTop = 0;
  }

  function select(id) {
    selected = id || null;
    showPanel();
    draw();
  }

  function open(key, from) {
    if (!SCENES[key]) return;
    if (!modal) build();
    opener = from;
    current = key; selected = null; wall = 0;
    modal.querySelector(".dg-dialog").setAttribute("data-brand", SCENES[key].brand);
    modal.removeAttribute("hidden");
    document.documentElement.classList.add("dg-lock");
    showPanel();
    buildHits(svg, draw());
    setPlaying(!reduceMotion);
    btnPlay.focus();
  }

  function close() {
    setPlaying(false);
    modal.setAttribute("hidden", "");
    document.documentElement.classList.remove("dg-lock");
    if (opener) opener.focus();
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-diagram]");
    if (!t) return;
    e.preventDefault();
    open(t.getAttribute("data-diagram"), t);
  });
  document.addEventListener("keydown", function (e) {
    var t = e.target.closest && e.target.closest("[data-diagram]");
    if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(t.getAttribute("data-diagram"), t); }
  });
})();
