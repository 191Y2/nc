/* ============================================================
   Ace — work.js · AGENTIC BUILDER (Work mode)
   Pipeline: PLAN → BUILD → REVIEW → (FIX → BUILD)² → SHIP
   Each phase streams into a live agent trace. Artifacts are
   single-file HTML apps/games previewed in a sandboxed iframe,
   downloadable, and iterable ("make X better").
   ============================================================ */
"use strict";
window.Ace = window.Ace || {};
(function () {
  const $ = (id) => document.getElementById(id);
  const W = { running: false };

  /* ---------- trace rendering (called from chat.js renderMessage) ---------- */
  W.renderTrace = (m) => {
    const t = m.workTrace || {};
    const wrap = Ace.el("div", "work-trace");
    if (t.plan) {
      const p = Ace.el("div", "work-plan");
      p.innerHTML = `
        <div class="work-plan-head">
          <div class="work-plan-title">${Ace.esc(t.plan.title || "Build")}</div>
          <span class="work-plan-type">${Ace.esc(t.plan.type || "")}</span>
        </div>
        <div class="work-plan-liner">${Ace.esc(t.plan.oneLiner || "")}</div>
        ${t.plan.features && t.plan.features.length ? `<div class="work-plan-feats">${t.plan.features.map(f => `<span class="feat">${Ace.ICON("check", 11)}${Ace.esc(f)}</span>`).join("")}</div>` : ""}`;
      wrap.append(p);
    }
    (t.steps || []).forEach(s => {
      const row = Ace.el("div", "work-step " + (s.state || "pending"));
      const icon = s.state === "run" ? '<span class="spin"></span>'
        : s.state === "done" ? Ace.ICON("check", 13)
        : s.state === "fail" ? Ace.ICON("warn", 13) : Ace.ICON("chev", 13);
      const step = Ace.el("details", "work-step-d");
      step.innerHTML = `<summary><span class="ws-ic ${s.state || ""}">${icon}</span><span class="ws-lbl">${Ace.esc(s.label)}</span>${s.note ? `<span class="ws-note">${Ace.esc(s.note)}</span>` : ""}</summary>
        ${s.detail ? `<div class="ws-detail">${s.detail}</div>` : ""}`;
      if (s.state === "run") step.open = true;
      wrap.append(step);
      if (s.live) {
        const live = Ace.el("div", "work-live");
        live.innerHTML = `<div class="work-live-bar"><span class="spin"></span><span class="work-live-lbl">${Ace.esc(s.live.label || "Working…")}</span><span class="work-live-pct">${Ace.esc(s.live.pct || "")}</span></div><pre class="work-live-code"><code>${Ace.esc(s.live.code || "")}</code></pre>`;
        live.querySelector(".work-live-code").dataset.liveFor = s.k;
        wrap.append(live);
      }
    });
    if (m.artifacts && m.artifacts.length) {
      m.artifacts.forEach(a => wrap.append(artifactCard(m, a)));
    }
    return wrap;
  };

  function artifactCard(m, a) {
    const card = Ace.el("div", "artifact");
    const head = Ace.el("div", "artifact-head",
      `<div class="artifact-title">${Ace.ICON("code", 15)} ${Ace.esc(a.title || "App")}</div>
       <div class="artifact-badges"><span class="badge">v${a.v}</span>${a.score ? `<span class="badge ok">review ${a.score}/10</span>` : ""}<span class="badge">${((a.code || "").length / 1024).toFixed(1)} KB</span></div>`);
    const acts = Ace.el("div", "artifact-acts");
    const run = Ace.el("button", "btn btn-primary", Ace.ICON("play", 14) + "Open app");
    run.onclick = () => {
      const blob = new Blob([a.code], { type: "text/html" });
      window.open(URL.createObjectURL(blob), "_blank");
      setTimeout(() => URL.revokeObjectURL(blob.url || ""), 8000);
    };
    const dl = Ace.el("button", "btn btn-ghost", Ace.ICON("download", 14) + "Download");
    dl.onclick = () => {
      const b = document.createElement("a");
      b.href = URL.createObjectURL(new Blob([a.code], { type: "text/html" }));
      b.download = (a.title || "ace-app").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() + ".html";
      b.click();
    };
    const view = Ace.el("button", "btn btn-ghost", Ace.ICON("code", 14) + "Code");
    view.onclick = () => {
      const ex = card.querySelector(".artifact-code");
      if (ex) { ex.remove(); return; }
      const code = Ace.el("div", "artifact-code");
      code.append(Ace.Blocks.renderCode("html", a.code));
      card.append(code);
    };
    acts.append(run, dl, view);
    const frame = Ace.el("div", "artifact-frame");
    const ifr = document.createElement("iframe");
    ifr.setAttribute("sandbox", "allow-scripts allow-modals allow-forms allow-pointer-lock");
    ifr.setAttribute("title", a.title || "preview");
    ifr.srcdoc = a.code;
    frame.append(ifr);
    card.append(head, acts, frame);
    return card;
  }

  /* ---------- helpers ---------- */
  const step = (ai, k, label, patch) => {
    const t = ai.workTrace;
    const s = t.steps.find(x => x.k === k);
    if (!patch) delete s.live;
    Object.assign(s, patch || {}, { label: label || s.label });
    Ace.Chat.rerenderMessage(ai);
    Ace.Chat.scrollBottom();
  };
  const addStep = (ai, k, label) => {
    ai.workTrace.steps.push({ k, label, state: "run" });
    Ace.Chat.rerenderMessage(ai);
    Ace.Chat.scrollBottom();
  };
  const updateLive = (ai, k, label, code) => {
    const node = document.querySelector(`[data-mid="${ai.id}"] .work-live-code`);
    const lbl = document.querySelector(`[data-mid="${ai.id}"] .work-live-lbl`);
    if (node) node.innerHTML = Ace.esc(code.length > 4000 ? code.slice(-4000) : code);
    if (lbl) lbl.textContent = label;
  };

  function extractHTML(text) {
    const segs = Ace.MD.split(text || "");
    const fence = segs.find(s => s.kind === "fence" && (s.lang === "html" || s.lang === "" ) && /<!DOCTYPE|<html/i.test(s.body));
    if (fence) return fence.body.trim();
    const m = (text || "").match(/<!DOCTYPE[\s\S]*<\/html>/i);
    if (m) return m[0].trim();
    return null;
  }

  async function callModel(prompt, sysPrompt, temp, maxTok, signal) {
    const msgs = [];
    if (sysPrompt) msgs.push({ role: "system", content: sysPrompt });
    msgs.push({ role: "user", content: prompt });
    return Ace.API.stream({
      model: Ace.ROUTE.work, fallbackChain: Ace.FALLBACKS.work, taskKey: "work",
      temperature: temp, maxTokens: maxTok, messages: msgs, signal,
      thinking: "disabled" // structured-output tasks: don't burn tokens on reasoning
    });
  }

  function parseJSONLoose(text) {
    const m = (text || "").match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch (e) {
      try { return JSON.parse(m[0].replace(/,\s*([}\]])/g, "$1")); } catch (e2) { return null; }
    }
  }

  /* ---------- main entry (called by Chat.send in work mode) ---------- */
  W.send = async (text, images) => {
    if (W.running) return;
    if (images && images.length) Ace.UI.toast("Work mode is text-first — building from your description", "info");
    const chat = await ensureWorkChat();
    const userMsg = { id: Ace.uid(), role: "user", content: text, createdAt: Date.now() };
    Ace.Chat.messages.push(userMsg);
    Ace.Chat.appendMessage(userMsg);
    await Ace.Store.addMessage(chat.id, userMsg);
    if (!chat.title) {
      chat.title = text.slice(0, 40);
      Ace.Store.updateChat(chat.id, { title: chat.title }).catch(() => {});
      Ace.Memory.genTitle(text, chat.id).then(t => { chat.title = t; Ace.Chat.renderSidebar(); }).catch(() => {});
    }
    Ace.Chat.renderSidebar();
    await W.run(chat, text);
  };

  async function ensureWorkChat() {
    if (Ace.Chat.activeChat && (Ace.Chat.activeChat.mode || "chat") === "work") return Ace.Chat.activeChat;
    const chat = { id: Ace.uid(), title: "", mode: "work",
      createdAt: Date.now(), updatedAt: Date.now(), pinned: false, msgCount: 0, summary: "" };
    await Ace.Store.createChat(chat);
    Ace.Chat.chats.unshift(chat);
    Ace.Chat.activeChat = chat;
    Ace.Chat.renderSidebar();
    return chat;
  }

  W.run = async (chat, request) => {
    W.running = true;
    Ace.Chat.sending = true;
    Ace.App.setSending(true);
    const signal = (Ace.Chat.abort = new AbortController()).signal;

    // prior artifact in this chat? → iterate instead of replanning
    const priorArtifact = [...Ace.Chat.messages].reverse().find(m => m.artifacts && m.artifacts.length);
    const prior = priorArtifact ? priorArtifact.artifacts[priorArtifact.artifacts.length - 1] : null;

    const ai = {
      id: Ace.uid(), role: "assistant", content: "", createdAt: Date.now(), model: "",
      flags: {}, uiStates: {},
      workTrace: { steps: [], versions: [] }, artifacts: null
    };
    Ace.Chat.messages.push(ai);
    Ace.Chat.rerenderMessage(ai);
    Ace.Chat.scrollBottom();

    try {
      let plan = null, prevCode = prior ? prior.code : null, feedback = null, v = prior ? prior.v + 1 : 1;
      ai.content = "Working on it…";

      /* ---- PLAN (skip when iterating) ---- */
      if (!prior) {
        addStep(ai, "plan", "Planning the build");
        const r = await callModel(Ace.PROMPTS.workPlanner(request), null, 0.35, 1200, signal);
        plan = parseJSONLoose(r.content) || { title: "Custom app", type: "app", oneLiner: request.slice(0, 100), features: [request.slice(0, 60)], steps: [{ name: "Build" }] };
        ai.workTrace.plan = plan;
        step(ai, "plan", `Planned: ${plan.title}`, { state: "done", note: plan.type,
          detail: `<b>${Ace.esc(plan.oneLiner || "")}</b><br>` + (plan.features || []).map(f => "• " + Ace.esc(f)).join("<br>") });
        ai.model = r.model; ai.fallbackUsed = r.fallbackUsed;
      } else {
        plan = prior.plan || { title: prior.title, type: "app", oneLiner: request.slice(0, 100), features: [], steps: [] };
        ai.workTrace.plan = plan;
        addStep(ai, "iter", `Iterating on v${prior.v}`);
        step(ai, "iter", `Change request: ${request.slice(0, 60)}`, { state: "done",
          detail: `Building v${v} of <b>${Ace.esc(prior.title || "the app")}</b> with your changes.` });
      }

      /* ---- BUILD loop (build → review → fix, max 2 fixes) ---- */
      let code = null, review = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const buildK = attempt === 0 ? (prior ? "iter" : "build") : "fix";
        if (attempt > 0) addStep(ai, buildK, `Fixing ${review && review.issues && review.issues.length ? review.issues.length + " issue(s)" : "issues"}`);
        ai.workTrace.steps.find(s => s.k === buildK) && step(ai, buildK, attempt === 0 ? `Building v${v}` : `Rebuilding v${v} (pass ${attempt + 1})`, { state: "run" });

        const buildPrompt = Ace.PROMPTS.workBuilder(plan, attempt > 0 ? code : prevCode, feedback);
        let full = "";
        const res = await Ace.API.stream({
          model: Ace.ROUTE.work, fallbackChain: Ace.FALLBACKS.work, taskKey: "work",
          temperature: 0.55, maxTokens: 26000, signal,
          messages: [{ role: "user", content: buildPrompt }],
          onDelta: (content) => {
            full = content;
            updateLive(ai, buildK, `Building v${v} — ${(content.length / 1000).toFixed(1)}k chars`, content);
          }
        });
        code = extractHTML(res.content);
        ai.model = res.model;

        // truncated output? ask the model to continue
        let continues = 0;
        while (!code && continues < 2) {
          continues++;
          step(ai, buildK, `Building v${v} — continuing (part ${continues + 1})`, { state: "run" });
          const c = await callModel("Continue the HTML file EXACTLY where you stopped. Do not repeat any earlier code, do not restart, just continue until </html>.", null, 0.55, 26000, signal);
          res.content += "\n" + c.content;
          code = extractHTML(res.content);
        }
        if (!code) throw new Error("The builder didn't return a complete HTML file — try rephrasing what you want.");

        ai.workTrace.steps.find(s => s.k === buildK) && step(ai, buildK, `Built v${v} — ${(code.length / 1024).toFixed(1)} KB of code`, {
          state: "done", note: `${(code.split("\n") || []).length} lines` });

        /* ---- REVIEW ---- */
        const revK = "review" + attempt;
        addStep(ai, revK, "Reviewing the code");
        const rr = await callModel(Ace.PROMPTS.workReviewer(plan, code), null, 0.25, 900, signal);
        review = parseJSONLoose(rr.content) || { verdict: "pass", score: 7, issues: [], improvements: [] };
        const issueTxt = (review.issues || []).length ? (review.issues || []).map(i => "• " + Ace.esc(String(i).slice(0, 160))).join("<br>") : "No blocking issues.";
        step(ai, revK, `Review — ${review.score != null ? review.score + "/10" : "done"} · ${review.verdict}`, {
          state: "done", note: (review.issues || []).length + " issue(s)",
          detail: issueTxt + ((review.improvements || []).length ? `<div class="ws-sub">Improvements queued:<br>${review.improvements.map(i => "• " + Ace.esc(String(i).slice(0, 140))).join("<br>")}</div>` : "") });

        if (review.verdict !== "fix" || !(review.issues || []).length || attempt >= 2) break;
        feedback = "Fix these issues:\n" + review.issues.map(i => "- " + i).join("\n") +
          "\nAlso apply improvements if trivial:\n" + (review.improvements || []).slice(0, 3).map(i => "- " + i).join("\n");
      }

      /* ---- SHIP ---- */
      ai.artifacts = [{ v, title: plan.title || "App", code, lang: "html", score: review && review.score, verdict: review && review.verdict }];
      ai.content = `Shipped **${plan.title || "the app"}** (v${v}).\n\n${prior ? "Updated with your changes — " : ""}${review && review.score ? `Review score: **${review.score}/10**. ` : ""}Preview it below, open it full-screen, or download the file. Describe any change and I'll ship v${v + 1}.`;
      ai.streaming = false;
      addStep(ai, "ship", `Shipped v${v}`);
      step(ai, "ship", `Shipped v${v}`, { state: "done" });
      Ace.Chat.rerenderMessage(ai);
      await Ace.Store.addMessage(chat.id, ai);
      await Ace.Store.updateChat(chat.id, { msgCount: Ace.Chat.messages.length, updatedAt: Date.now() });
    } catch (e) {
      if (e.name === "AbortError") {
        ai.streaming = false;
        ai.content = ai.content && ai.content !== "Working on it…" ? ai.content : "*(stopped)*";
        (ai.workTrace.steps || []).forEach(s => { if (s.state === "run") s.state = "fail"; delete s.live; });
        Ace.Chat.rerenderMessage(ai);
      } else {
        console.warn(e);
        ai.streaming = false; ai.error = true;
        (ai.workTrace.steps || []).forEach(s => { if (s.state === "run") s.state = "fail"; delete s.live; });
        ai.content = `**Build hit a snag.** ${Ace.esc(Ace.API.friendlyError(e))}`;
        Ace.Chat.rerenderMessage(ai);
      }
    } finally {
      W.running = false;
      Ace.Chat.sending = false;
      Ace.Chat.abort = null;
      Ace.App.setSending(false);
    }
  };

  Ace.Work = W;
})();
