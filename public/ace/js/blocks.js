/* ============================================================
   Ace — blocks.js · AI UI component system
   The AI emits ```quiz / ```scorecard / etc. JSON fences; these
   render as polished interactive cards — the "AI UI" layer.
   All user-facing strings are escaped. State is saved per message.
   ============================================================ */
"use strict";
window.Ace = window.Ace || {};
(function () {
  const esc = Ace.esc, el = Ace.el, mdInline = (s) => Ace.MD.inline(s || "");
  const norm = (s) => String(s || "").toLowerCase().trim()
    .replace(/[.,!?;:'"()]+/g, "").replace(/\s+/g, " ");

  function btn(label, cls, icon) {
    const b = el("button", "btn " + (cls || ""), (icon ? Ace.ICON(icon, 14) : "") + label);
    return b;
  }

  /* ============ QUIZ ============ */
  function renderQuiz(d, ctx) {
    const wrap = el("div", "blk blk-quiz");
    const qs = (d.questions || []).filter(q => q && q.q);
    if (!qs.length) return null;
    const state = Object.assign({ screen: "start", i: 0, answers: {}, score: 0 },
      (ctx.state && ctx.state.quiz) || {});
    const save = () => ctx.save && ctx.save({ quiz: state });
    let order = state.order && state.order.length === qs.length ? state.order : qs.map((_, i) => i);

    function startScreen() {
      wrap.innerHTML = "";
      const head = el("div", "blk-quiz-head",
        `<div class="blk-quiz-badge">${Ace.ICON("bulb", 16)}</div>
         <div><div class="blk-quiz-title">${esc(d.title || "Quiz")}</div>
         <div class="blk-quiz-meta">${qs.length} questions${d.difficulty ? ` · ${esc(d.difficulty)}` : ""} · mixed types</div></div>`);
      const go = btn("Start quiz", "btn-primary", "play");
      go.onclick = () => { state.screen = "q"; state.i = 0; state.score = 0; state.answers = {};
        if (state.reshuffle) { order = qs.map((_, i) => i).sort(() => Math.random() - .5); state.order = order; state.reshuffle = false; }
        save(); draw(); };
      const row = el("div", "blk-quiz-actions"); row.append(go); head.append(row);
      wrap.append(head);
    }

    function question(q, qi) {
      const picked = state.answers[qi];
      const isAnswered = picked != null;
      const correct = isAnswered && picked.correct;
      wrap.innerHTML = "";
      const prog = el("div", "blk-prog", `<div class="blk-prog-bar" style="width:${(qi / qs.length) * 100}%"></div>`);
      const head = el("div", "blk-quiz-qhead",
        `<span class="blk-quiz-count">Question ${qi + 1} of ${qs.length}</span>
         <span class="blk-quiz-score">${Ace.ICON("check", 13)} ${state.score} correct</span>`);
      const qEl = el("div", "blk-quiz-q", mdInline(q.q));

      const type = q.type || (q.options ? "mcq" : "short");
      const body = el("div", "blk-quiz-body");
      let chosen = isAnswered ? picked.choice : (type === "mcq" || type === "tf" ? -1 : type === "multi" ? [] : "");
      let choices = type === "tf" ? ["True", "False"] : (q.options || []);

      function submit() {
        let ok = false;
        if (type === "mcq" || type === "tf") ok = chosen === (q.answer ?? (type === "tf" ? 0 : q.answer));
        else if (type === "multi") {
          const want = (q.answers || []).slice().sort().join(",");
          ok = chosen.slice().sort().join(",") === want;
        } else {
          const acc = [q.answer].concat(q.accept || []).map(norm);
          ok = acc.includes(norm(chosen));
        }
        state.answers[qi] = { choice: chosen, correct: ok, text: type === "short" ? chosen : null };
        if (ok) state.score++;
        save(); draw();
      }

      if (type === "mcq" || type === "tf") {
        choices.forEach((opt, oi) => {
          const o = el("button", "blk-opt" + (chosen === oi ? " sel" : ""),
            `<span class="blk-opt-mark"></span><span class="blk-opt-text">${mdInline(opt)}</span>`);
          o.onclick = () => { if (isAnswered) return; chosen = oi; wrap.querySelectorAll(".blk-opt").forEach(x => x.classList.remove("sel")); o.classList.add("sel"); };
          if (isAnswered) {
            const isRight = oi === q.answer;
            if (isRight) o.classList.add("right");
            else if (chosen === oi) o.classList.add("wrong");
            o.disabled = true;
          }
          body.append(o);
        });
      } else if (type === "multi") {
        choices.forEach((opt, oi) => {
          const o = el("button", "blk-opt blk-opt-multi" + (chosen.includes(oi) ? " sel" : ""),
            `<span class="blk-opt-mark"></span><span class="blk-opt-text">${mdInline(opt)}</span>`);
          o.onclick = () => { if (isAnswered) return;
            chosen = chosen.includes(oi) ? chosen.filter(x => x !== oi) : chosen.concat([oi]);
            o.classList.toggle("sel"); };
          if (isAnswered) {
            if ((q.answers || []).includes(oi)) o.classList.add("right");
            else if (chosen.includes(oi)) o.classList.add("wrong");
            o.disabled = true;
          }
          body.append(o);
        });
      } else {
        const inp = el("input", "blk-input");
        inp.type = "text"; inp.placeholder = "Type your answer…"; inp.value = chosen || "";
        inp.oninput = () => chosen = inp.value;
        inp.onkeydown = (e) => { if (e.key === "Enter" && !isAnswered && inp.value.trim()) submit(); };
        if (isAnswered) inp.disabled = true;
        body.append(inp);
      }

      const foot = el("div", "blk-quiz-actions");
      if (!isAnswered) {
        if (q.hint) {
          const hintBtn = btn("Hint", "btn-ghost", "bulb");
          hintBtn.onclick = () => {
            const ex = foot.querySelector(".blk-hint");
            if (ex) ex.remove();
            else foot.append(el("div", "blk-hint", "💡 " + mdInline(q.hint)));
          };
          foot.append(hintBtn);
        }
        const go = btn(type === "short" ? "Check answer" : "Submit", "btn-primary", "check");
        const canSubmit = () => type === "multi" ? chosen.length : type === "short" ? String(chosen).trim() : chosen >= 0;
        go.onclick = () => { if (canSubmit()) submit(); };
        if (type === "mcq" || type === "tf") {
          const tick = () => go.classList.toggle("disabled", !canSubmit());
          body.querySelectorAll(".blk-opt").forEach(o => o.addEventListener("click", tick));
        }
        if (type === "short") inp.addEventListener("input", () => go.classList.toggle("disabled", !canSubmit()));
        go.classList.add("disabled");
        foot.append(go);
      } else {
        const verdict = el("div", "blk-verdict " + (correct ? "ok" : "no"),
          correct ? `${Ace.ICON("check", 15)} Correct!` :
          `${Ace.ICON("close", 15)} Not quite — answer: <b>${esc(type === "short" ? q.answer : type === "multi" ? (q.answers || []).map(i => choices[i]).join(", ") : choices[q.answer])}</b>`);
        foot.append(verdict);
        if (q.explain) foot.append(el("div", "blk-explain", "<b>Why:</b> " + mdInline(q.explain)));
        const next = btn(qi + 1 < qs.length ? "Next question" : "See results", "btn-primary", "chev");
        next.onclick = () => {
          if (qi + 1 < qs.length) { state.i = qi + 1; }
          else state.screen = "done";
          save(); draw();
        };
        foot.append(next);
      }
      wrap.append(prog, head, qEl, body, foot);
    }

    function doneScreen() {
      wrap.innerHTML = "";
      const pct = Math.round((state.score / qs.length) * 100);
      const grade = pct >= 90 ? "🏆 Outstanding" : pct >= 75 ? "🎯 Strong" : pct >= 50 ? "📈 Getting there" : "📚 Keep drilling";
      const card = el("div", "blk-quiz-result",
        `<div class="blk-quiz-score-big">${state.score}<span>/${qs.length}</span></div>
         <div class="blk-quiz-grade">${grade}</div>
         <div class="blk-quiz-pct">${pct}%</div>`);
      const review = el("div", "blk-quiz-review");
      qs.forEach((q, qi2) => {
        const a = state.answers[qi2];
        review.append(el("div", "blk-quiz-revrow " + (a && a.correct ? "ok" : "no"),
          `<span>${a && a.correct ? "✓" : "✗"}</span><span>${mdInline(q.q)}</span>`));
      });
      const foot = el("div", "blk-quiz-actions");
      const retry = btn("Retry", "btn-ghost", "refresh");
      retry.onclick = () => { state.screen = "start"; state.reshuffle = true; save(); draw(); };
      const harder = btn("Make it harder 🔥", "btn-primary");
      harder.onclick = () => wrap.dispatchEvent(new CustomEvent("ace:block-action",
        { bubbles: true, detail: { type: "quiz-harder", topic: d.title || "" } }));
      foot.append(retry, harder);
      wrap.append(card, review, foot);
    }

    function draw() {
      if (state.screen === "start") startScreen();
      else if (state.screen === "done") doneScreen();
      else question(qs[order[state.i]] || qs[state.i], state.i);
    }
    draw();
    return wrap;
  }

  /* ============ FLASHCARDS ============ */
  function renderFlashcards(d, ctx) {
    const cards = (d.cards || []).filter(c => c && (c.front || c.back));
    if (!cards.length) return null;
    const state = Object.assign({ i: 0, flipped: false, known: [] }, (ctx.state && ctx.state.cards) || {});
    const save = () => ctx.save && ctx.save({ cards: state });
    const wrap = el("div", "blk blk-fc");
    const title = el("div", "blk-title", `🗂️ ${esc(d.title || "Flashcards")} <span class="blk-sub">${cards.length} cards</span>`);

    const stage = el("div", "blk-fc-stage");
    const cardEl = el("div", "blk-fc-card");
    const front = el("div", "blk-fc-face blk-fc-front"), back = el("div", "blk-fc-face blk-fc-back");
    cardEl.append(front, back);

    function draw() {
      const c = cards[state.i] || {};
      front.innerHTML = mdInline(c.front);
      back.innerHTML = mdInline(c.back);
      cardEl.classList.toggle("flipped", !!state.flipped);
      stage.innerHTML = "";
      const count = el("div", "blk-fc-count", `Card ${state.i + 1} / ${cards.length} · ${state.known.length} known`);
      cardEl.onclick = () => { state.flipped = !state.flipped; save(); cardEl.classList.toggle("flipped", state.flipped); };
      const nav = el("div", "blk-quiz-actions");
      const prev = btn("‹ Prev", "btn-ghost"); prev.onclick = () => { state.i = Math.max(0, state.i - 1); state.flipped = false; save(); draw(); };
      const know = btn(state.known.includes(state.i) ? "✓ Known" : "Got it", "btn-ok");
      know.onclick = () => {
        if (!state.known.includes(state.i)) state.known.push(state.i); else state.known = state.known.filter(x => x !== state.i);
        save(); draw();
      };
      const next = btn("Next ›", "btn-primary"); next.onclick = () => { state.i = Math.min(cards.length - 1, state.i + 1); state.flipped = false; save(); draw(); };
      const shuffle = btn("", "btn-icon", "refresh");
      shuffle.title = "Shuffle";
      shuffle.onclick = () => { cards.sort(() => Math.random() - .5); state.i = 0; state.flipped = false; save(); draw(); };
      nav.append(prev, shuffle, know, next);
      stage.append(count, cardEl, nav);
    }
    draw();
    wrap.append(title, stage);
    return wrap;
  }

  /* ============ SCORECARD ============ */
  function renderScorecard(d) {
    const wrap = el("div", "blk blk-scorecard");
    const max = d.ratingMax || 10;
    const head = el("div", "blk-sc-head",
      `<div class="blk-sc-rating"><span class="blk-sc-num">${esc(d.rating != null ? d.rating : "–")}</span><span class="blk-sc-max">/${esc(max)}</span></div>
       <div class="blk-sc-titlewrap"><div class="blk-sc-title">${esc(d.title || "Scorecard")}</div>
       ${d.headline ? `<div class="blk-sc-headline">${mdInline(d.headline)}</div>` : ""}</div>`);
    wrap.append(head);
    if (d.rating != null) {
      const bar = el("div", "blk-sc-bar", `<div style="width:${Math.max(0, Math.min(100, (d.rating / max) * 100))}%"></div>`);
      wrap.append(bar);
    }
    if (d.stats && d.stats.length) {
      const grid = el("div", "blk-sc-grid");
      d.stats.forEach(s => grid.append(el("div", "blk-sc-stat",
        `<div class="blk-sc-val">${esc(s.value)}</div><div class="blk-sc-lbl">${esc(s.label)}</div>`)));
      wrap.append(grid);
    }
    if (d.ranked && d.ranked.length) {
      const list = el("div", "blk-sc-ranked");
      d.ranked.forEach((r, i) => list.append(el("div", "blk-sc-rank",
        `<div class="blk-sc-rankn">${i + 1}</div>
         <div class="blk-sc-rankbody"><div class="blk-sc-ranklbl">${mdInline(r.label)}</div>
         ${r.note ? `<div class="blk-sc-ranknote">${mdInline(r.note)}</div>` : ""}</div>
         <div class="blk-sc-rankval">${esc(r.value)}</div>`)));
      wrap.append(list);
    }
    if (d.notes) wrap.append(el("div", "blk-notes", mdInline(d.notes)));
    if (d.best && d.best.length) {
      const best = el("div", "blk-sc-best");
      d.best.forEach(b => best.append(el("div", "blk-sc-brow",
        `<div class="blk-sc-blbl">${esc(b.label)}</div><div class="blk-sc-bval">${mdInline(b.value)}${b.note ? ` <span class="blk-sub">— ${mdInline(b.note)}</span>` : ""}</div>`)));
      wrap.append(best);
    }
    return wrap;
  }

  /* ============ STATS ============ */
  function renderStats(d) {
    const items = d.items || [];
    if (!items.length) return null;
    const wrap = el("div", "blk blk-stats");
    if (d.title) wrap.append(el("div", "blk-title", esc(d.title)));
    const grid = el("div", "blk-stat-grid");
    items.forEach(s => grid.append(el("div", "blk-stat",
      `${s.icon ? `<div class="blk-stat-ic">${esc(s.icon)}</div>` : ""}
       <div class="blk-stat-val">${esc(s.value)}</div>
       <div class="blk-stat-lbl">${esc(s.label)}</div>
       ${s.sub ? `<div class="blk-stat-sub">${esc(s.sub)}</div>` : ""}`)));
    wrap.append(grid);
    return wrap;
  }

  /* ============ COMPARE ============ */
  function renderCompare(d) {
    const cols = d.columns || [];
    const rows = (d.rows || []).filter(r => r && r.values);
    if (!cols.length || !rows.length) return null;
    const wrap = el("div", "blk blk-compare");
    if (d.title) wrap.append(el("div", "blk-title", esc(d.title)));
    const t = el("table", "blk-compare-t");
    t.innerHTML = `<thead><tr><th></th>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead>`;
    const tb = el("tbody");
    rows.forEach(r => {
      const tr = el("tr");
      tr.append(el("td", "blk-compare-lbl", esc(r.label)));
      r.values.forEach((v, i) => {
        tr.append(el("td", r.winner === i ? "win" : "", `${mdInline(v)}${r.winner === i ? `<span class="win-b">✓</span>` : ""}`));
      });
      tb.append(tr);
    });
    t.append(tb); wrap.append(t);
    if (d.verdict) wrap.append(el("div", "blk-notes", "<b>Verdict:</b> " + mdInline(d.verdict)));
    return wrap;
  }

  /* ============ STEPS ============ */
  function renderSteps(d) {
    const steps = d.steps || [];
    if (!steps.length) return null;
    const wrap = el("div", "blk blk-steps");
    if (d.title) wrap.append(el("div", "blk-title", esc(d.title)));
    steps.forEach((s, i) => {
      if (typeof s === "string") s = { detail: s };
      wrap.append(el("div", "blk-step",
        `<div class="blk-step-n">${i + 1}</div>
         <div class="blk-step-body">${s.name ? `<div class="blk-step-name">${mdInline(s.name)}</div>` : ""}
         <div class="blk-step-detail">${mdInline(s.detail || s.text || "")}</div></div>`));
    });
    return wrap;
  }

  /* ============ TIMELINE ============ */
  function renderTimeline(d) {
    const evs = d.events || [];
    if (!evs.length) return null;
    const wrap = el("div", "blk blk-tl");
    if (d.title) wrap.append(el("div", "blk-title", esc(d.title)));
    const rail = el("div", "blk-tl-rail");
    evs.forEach(e => rail.append(el("div", "blk-tl-ev",
      `<div class="blk-tl-dot"></div>
       <div class="blk-tl-when">${esc(e.when || "")}</div>
       <div class="blk-tl-what">${mdInline(e.what || "")}</div>
       ${e.detail ? `<div class="blk-tl-detail">${mdInline(e.detail)}</div>` : ""}`)));
    wrap.append(rail);
    return wrap;
  }

  /* ============ TERMS ============ */
  function renderTerms(d) {
    const terms = (d.terms || []).filter(t => t && t.term);
    if (!terms.length) return null;
    const wrap = el("div", "blk blk-terms");
    if (d.title) wrap.append(el("div", "blk-title", esc(d.title)));
    const grid = el("div", "blk-terms-grid");
    terms.forEach(t => grid.append(el("div", "blk-term",
      `<div class="blk-term-t">${mdInline(t.term)}</div>
       <div class="blk-term-d">${mdInline(t.def || t.definition)}</div>
       ${t.example ? `<div class="blk-term-e"><b>e.g.</b> ${mdInline(t.example)}</div>` : ""}`)));
    wrap.append(grid);
    return wrap;
  }

  /* ============ TABLE ============ */
  function renderTable(d) {
    const cols = d.columns || [];
    const rows = d.rows || [];
    if (!cols.length || !rows.length) return null;
    const wrap = el("div", "blk blk-table");
    if (d.title) wrap.append(el("div", "blk-title", esc(d.title)));
    const tw = el("div", "blk-tablewrap");
    const t = el("table", "blk-table-t");
    const thead = el("thead");
    const hr = el("tr");
    cols.forEach((c, ci) => {
      const th = el("th", "", esc(c) + (d.sortable === false ? "" : ` <span class="sort-ic">⇅</span>`));
      if (d.sortable !== false) th.onclick = () => sortRows(ci, th);
      hr.append(th);
    });
    thead.append(hr); t.append(thead);
    const tb = el("tbody");
    function drawRows(data) {
      tb.innerHTML = "";
      data.forEach(r => tb.append(el("tr", cols.map((_, i) => `<td>${mdInline(r[i])}</td>`).join(""))));
    }
    function sortRows(ci, th) {
      const cur = th.getAttribute("data-dir");
      const dir = cur === "asc" ? -1 : 1;
      t.querySelectorAll("th").forEach(x => x.removeAttribute("data-dir"));
      th.setAttribute("data-dir", dir === 1 ? "asc" : "desc");
      drawRows(rows.slice().sort((a, b) => {
        const x = String(a[ci] ?? ""), y = String(b[ci] ?? "");
        const nx = parseFloat(x.replace(/[^0-9.\-]/g, "")), ny = parseFloat(y.replace(/[^0-9.\-]/g, ""));
        if (!isNaN(nx) && !isNaN(ny) && x.match(/\d/)) return (nx - ny) * dir;
        return x.localeCompare(y) * dir;
      }));
    }
    drawRows(rows);
    t.append(tb); tw.append(t); wrap.append(tw);
    return wrap;
  }

  /* ============ PROGRESS ============ */
  function renderProgress(d, ctx) {
    const tasks = (d.tasks || []).filter(t => t && t.label);
    if (!tasks.length) return null;
    const state = Object.assign({ done: [] }, (ctx.state && ctx.state.progress) || {});
    const save = () => ctx.save && ctx.save({ progress: state });
    const wrap = el("div", "blk blk-progress");
    const totalW = tasks.reduce((a, t) => a + (t.weight || 1), 0);
    const doneW = tasks.reduce((a, t, i) => a + (state.done.includes(i) ? (t.weight || 1) : 0), 0);
    if (d.title) wrap.append(el("div", "blk-title", `${esc(d.title)} ${d.due ? `<span class="blk-sub">· due ${esc(d.due)}</span>` : ""}`));
    wrap.append(el("div", "blk-prog blk-prog-lg", `<div class="blk-prog-bar" style="width:${totalW ? (doneW / totalW) * 100 : 0}%"></div>`));
    wrap.append(el("div", "blk-prog-lbl", `${doneW}/${totalW} points · ${Math.round(totalW ? (doneW / totalW) * 100 : 0)}%`));
    const list = el("div", "blk-progress-list");
    tasks.forEach((t, i) => {
      const on = state.done.includes(i);
      const row = el("div", "blk-prow" + (on ? " on" : ""),
        `<button class="blk-pcheck" aria-label="toggle">${on ? Ace.ICON("check", 13) : ""}</button>
         <span class="blk-plabel">${mdInline(t.label)}</span>
         <span class="blk-pweight">${"●".repeat(Math.min(5, t.weight || 1))}</span>`);
      row.querySelector(".blk-pcheck").onclick = () => {
        state.done = on ? state.done.filter(x => x !== i) : state.done.concat([i]);
        save();
        wrap.replaceWith(renderProgress(d, ctx));
      };
      list.append(row);
    });
    wrap.append(list);
    return wrap;
  }

  /* ============ CODE BLOCK (fallback fence) ============ */
  function renderCode(lang, body) {
    const wrap = el("div", "blk blk-code");
    const head = el("div", "blk-code-head",
      `<span>${esc(lang || "code")}</span>`);
    const cp = btn("Copy", "btn-ghost", "copy");
    cp.onclick = () => {
      navigator.clipboard && navigator.clipboard.writeText(body).then(() => {
        cp.innerHTML = Ace.ICON("check", 14) + "Copied";
        setTimeout(() => cp.innerHTML = Ace.ICON("copy", 14) + "Copy", 1400);
      });
    };
    head.append(cp);
    const pre = el("pre", "", `<code>${esc(body)}</code>`);
    wrap.append(head, pre);
    return wrap;
  }

  /* ============ dispatcher ============ */
  const RENDERERS = { quiz: renderQuiz, flashcards: renderFlashcards, scorecard: renderScorecard,
    stats: renderStats, compare: renderCompare, steps: renderSteps, timeline: renderTimeline,
    terms: renderTerms, table: renderTable, progress: renderProgress };

  /* Shape-based inference: the model sometimes labels blocks ```json (or nothing).
     Detect the intended component from the JSON's fields. */
  function inferType(d) {
    if (!d || typeof d !== "object") return null;
    if (Array.isArray(d)) {
      if (d.length && d[0] && ("front" in d[0] || "back" in d[0])) return "flashcards";
      return null;
    }
    if (Array.isArray(d.questions)) return "quiz";
    if (Array.isArray(d.cards)) return "flashcards";
    if (d.rating != null && (d.stats || d.ranked || d.headline || d.best)) return "scorecard";
    if (Array.isArray(d.items) && d.items[0] && "value" in d.items[0]) return "stats";
    if (Array.isArray(d.rows) && d.rows[0] && typeof d.rows[0] === "object" && "values" in d.rows[0]) return "compare";
    if (Array.isArray(d.steps)) return "steps";
    if (Array.isArray(d.events)) return "timeline";
    if (Array.isArray(d.terms)) return "terms";
    if (Array.isArray(d.tasks)) return "progress";
    if (Array.isArray(d.columns) && Array.isArray(d.rows)) return "table";
    return null;
  }

  Ace.Blocks = {
    isBlock(lang) { return RENDERERS.hasOwnProperty(lang); },
    render(lang, body, ctx) {
      let data;
      try { data = JSON.parse(body); } catch (e) { return renderCode(lang, body); }
      const type = RENDERERS[lang] ? lang : inferType(data);
      if (!type) return renderCode(lang, body);
      try {
        const node = RENDERERS[type](data, ctx || {});
        return node || renderCode(lang, body);
      } catch (e) {
        console.warn("block render failed", type, e);
        return renderCode(lang, body);
      }
    },
    renderCode
  };
})();
