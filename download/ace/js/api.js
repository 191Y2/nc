/* ============================================================
   Ace — api.js · Z.ai API client (browser-direct, CORS-verified)
   • streaming chat with reasoning support
   • automatic free-tier model fallback (error 1113/1211)
   • grounded web search (tool: web_search, string "True" form,
     thinking disabled — empirically verified 2026-10)
   • deep research orchestration (sub-queries → parallel search
     → synthesized brief)
   ============================================================ */
"use strict";
window.Ace = window.Ace || {};
(function () {
  const A = { key: null, sessionWorked: {}, proxy: null };

  /* Same-origin proxy (auto-detected). On GitHub Pages this doesn't
     exist and the app talks to api.z.ai directly (CORS-verified).
     If a host provides /api/zai/ping (e.g. the Next.js preview), we
     route through it — handy behind strict firewalls too. */
  A.detectProxy = async () => {
    if (A.proxy !== null) return A.proxy;
    try {
      const r = await fetch("/api/zai/ping", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      A.proxy = !!(r.ok && j && j.proxy === "zai");
    } catch (e) { A.proxy = false; }
    return A.proxy;
  };
  const endpoint = () => A.proxy ? "/api/zai/chat" : (Ace.API_BASE + Ace.API_PATH_CHAT);

  A.setKey = (k) => {
    A.key = String(k == null ? "" : k).trim()
      .replace(/^\"+/, "").replace(/\"+$/, "")  // strip any JSON quoting
      .replace(/^'+/, "").replace(/'+$/, "")
      .trim() || null;
  };
  A.hasKey = () => !!A.key;

  /* ---------- error normalization ---------- */
  function apiError(status, body) {
    let code = "", msg = "";
    try {
      const j = JSON.parse(body);
      code = (j.error && (j.error.code || j.error.type)) || j.code || "";
      msg = (j.error && j.error.message) || j.message || body.slice(0, 200);
    } catch (e) { msg = body.slice(0, 200) || `HTTP ${status}`; }
    const e = new Error(msg);
    e.code = String(code); e.status = status;
    if (code === "1113" || /balance|recharge/i.test(msg)) e.kind = "balance";
    else if (code === "1211" || /unknown model/i.test(msg)) e.kind = "unknown-model";
    else if (status === 401 || code === "1002" || code === "1001" || /api[ _]?key/i.test(msg)) e.kind = "auth";
    else if (status === 429) e.kind = "rate";
    else if (status === 429 || code === "1302") e.kind = "rate";
    else e.kind = "other";
    return e;
  }

  A.friendlyError = (e) => {
    if (!e) return "Something went wrong.";
    if (e.kind === "balance")
      return "Your Z.ai key needs a resource package or balance for that model (error 1113). Open z.ai → Billing to top up or claim your free quota — Ace automatically fell back to the free model where possible.";
    if (e.kind === "auth") return "That Z.ai API key looks invalid or expired. Update it in Settings.";
    if (e.kind === "rate") return "Rate limited — give it a couple of seconds and try again.";
    if (e.kind === "unknown-model") return "That model isn't available on your key.";
    if (/Failed to fetch|NetworkError|network/i.test(e.message || ""))
      return "Can't reach api.z.ai — check the school wifi/firewall or your connection.";
    return e.message || "Something went wrong.";
  };

  /* ---------- low-level request (with 1 polite retry on 429) ---------- */
  async function rawChat(payload, signal) {
    if (!A.key) { const e = new Error("No API key configured"); e.kind = "auth"; throw e; }
    await A.detectProxy();
    const url = endpoint();
    const doFetch = () => fetch(url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + A.key, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal
    });
    let res;
    try { res = await doFetch(); } catch (err) {
      if (err.name === "AbortError") throw err;
      throw Object.assign(new Error("Can't reach api.z.ai — check your connection."), { kind: "network" });
    }
    if (res.status === 429) { // brief backoff, single retry
      await new Promise(r => setTimeout(r, 2200));
      res = await doFetch().catch(err => { if (err.name === "AbortError") throw err; throw Object.assign(new Error("Can't reach api.z.ai — check your connection."), { kind: "network" }); });
    }
    if (!res.ok) throw apiError(res.status, await res.text());
    return res;
  }

  /* ---------- messages → API format (vision content parts) ---------- */
  A.toAPIMessages = (msgs) => msgs.map(m => {
    if (m.role === "user" && m.images && m.images.length) {
      const parts = [];
      m.images.forEach(im => parts.push({ type: "image_url", image_url: { url: im.dataUrl || im } }));
      parts.push({ type: "text", text: m.content || "What's in this image?" });
      return { role: "user", content: parts };
    }
    const c = String(m.content || "").trim();
    return { role: m.role, content: c || (m.images && m.images.length ? "(image)" : "…") };
  });

  /* ---------- streaming chat ---------- */
  A.stream = async (opts) => {
    opts = opts || {};
    const chain = opts.fallbackChain || [opts.model];
    let lastErr = null;
    for (let ci = 0; ci < chain.length; ci++) {
      const model = chain[ci];
      if (!model) continue;
      try {
        const out = await streamOnce(model, opts, ci > 0);
        A.sessionWorked[opts.taskKey || model] = model;
        return out;
      } catch (e) {
        if (e.name === "AbortError") throw e;
        lastErr = e;
        if (e.kind === "balance" || e.kind === "unknown-model") {
          if (ci < chain.length - 1) {
            document.dispatchEvent(new CustomEvent("ace:model-fallback",
              { detail: { from: model, to: chain[ci + 1], task: opts.taskKey || "chat" } }));
            continue; // try next in chain
          }
        }
        throw e;
      }
    }
    throw lastErr;
  };

  async function streamOnce(model, opts, isFallback) {
    const payload = { model, messages: A.toAPIMessages(opts.messages), stream: true };
    if (opts.maxTokens) payload.max_tokens = opts.maxTokens;
    if (opts.temperature != null) payload.temperature = opts.temperature;
    if (opts.thinking === "disabled" || opts.thinking === "enabled") payload.thinking = { type: opts.thinking };
    if (opts.tools) payload.tools = opts.tools;

    const res = await rawChat(payload, opts.signal);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", content = "", reasoning = "", usage = null, sources = [];
    const emit = throttle(() => opts.onDelta && opts.onDelta(content, reasoning), 60);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let j; try { j = JSON.parse(data); } catch (e) { continue; }
        const ch = j.choices && j.choices[0];
        const d = (ch && (ch.delta || ch.message)) || {};
        if (d.content) { content += d.content; emit(); }
        if (d.reasoning_content) { reasoning += d.reasoning_content; opts.onReasoning && opts.onReasoning(reasoning); }
        // search results can arrive in several shapes depending on model
        const sr = d.web_search || d.search_result || j.web_search || (ch && ch.message && ch.message.web_search);
        if (Array.isArray(sr) && sr.length) sources = sr;
        if (j.usage) usage = j.usage;
      }
    }
    opts.onDelta && opts.onDelta(content, reasoning, true);
    return { content, reasoning, usage, sources, model, fallbackUsed: isFallback };
  }

  /* ---------- non-streaming convenience ---------- */
  A.chat = async (opts) => {
    const r = await A.stream(Object.assign({}, opts, { onDelta: null }));
    return r;
  };

  /* throttle helper for streaming callbacks */
  function throttle(fn, ms) {
    let last = 0, t = null, lastArgs = null;
    return (...args) => {
      lastArgs = args;
      const now = Date.now();
      if (now - last >= ms) { last = now; fn(...lastArgs); }
      else if (!t) t = setTimeout(() => { t = null; last = Date.now(); fn(...lastArgs); }, ms - (now - last));
    };
  }

  /* ---------- grounded web search chat ---------- */
  A.WEB_TOOLS = [{
    type: "web_search",
    web_search: { enable: "True", search_engine: "search-prime", search_result: "True", count: 6 }
  }];

  /* ---------- FREE live references (no key, CORS-open, works on any static host)
     Wikipedia search + DuckDuckGo Instant Answers. These give REAL citations —
     the honesty layer that keeps answers grounded on free Z.ai keys (where the
     server-side web_search tool is silently skipped). ---------- */
  A.freeWebSearch = async (query) => {
    const refs = [];
    const q = String(query || "").trim().slice(0, 300);
    if (!q) return refs;

    // DuckDuckGo Instant Answer
    try {
      const r = await fetch("https://api.duckduckgo.com/?q=" + encodeURIComponent(q) +
        "&format=json&no_html=1&skip_disambig=1", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (j.AbstractText) refs.push({ title: j.Heading || "DuckDuckGo", link: j.AbstractURL || "https://duckduckgo.com", media: "DuckDuckGo", content: j.AbstractText });
        if (j.Answer) refs.push({ title: (j.AnswerType || "Instant answer") + ": " + q, link: "https://duckduckgo.com/?q=" + encodeURIComponent(q), media: "DuckDuckGo", content: String(j.Answer).replace(/<[^>]+>/g, " ") });
        (j.RelatedTopics || []).slice(0, 3).forEach(t => {
          if (t && t.Text && t.FirstURL) refs.push({ title: t.Text.slice(0, 80), link: t.FirstURL, media: "DuckDuckGo", content: t.Text });
        });
      }
    } catch (e) { /* network-blocked: degrade to wiki only */ }

    // Wikipedia search (top 5 with snippets)
    try {
      const r = await fetch("https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
        encodeURIComponent(q) + "&srlimit=5&format=json&origin=*", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        const hits = (((j.query || {}).search) || []);
        hits.forEach(h => {
          refs.push({
            title: h.title,
            link: "https://en.wikipedia.org/wiki/" + encodeURIComponent(String(h.title).replace(/ /g, "_")),
            media: "Wikipedia",
            content: String(h.snippet || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
          });
        });
      }
    } catch (e) { /* degrade */ }

    // dedupe by link
    const seen = new Set();
    return refs.filter(x => x.link && !seen.has(x.link) && seen.add(x.link)).slice(0, 9);
  };

  A.searchChat = (opts) => A.stream(Object.assign({}, opts, {
    tools: A.WEB_TOOLS,
    thinking: "disabled" // required: thinking mode bypasses the search tool
  }));

  /* extract source links from reply content (fallback when API
     doesn't return a web_search array) */
  A.extractSources = (content, existing) => {
    const seen = new Map();
    (existing || []).forEach(s => seen.set(s.link, s));
    const re = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)|<(https?:\/\/[^\s>]+)>|(https?:\/\/[^\s<)\]]+)/g;
    let m;
    while ((m = re.exec(content || ""))) {
      const link = m[2] || m[3] || m[4];
      let host; try { host = new URL(link).hostname.replace(/^www\./, ""); } catch (e) { host = link; }
      if (!seen.has(link)) seen.set(link, { title: m[1] || host, link, media: host });
    }
    return Array.from(seen.values()).slice(0, 12);
  };

  /* ---------- deep research ---------- */
  A.deepResearch = async (opts) => {
    const { query, onStep, signal } = opts;
    const chain = opts.chain || Ace.FALLBACKS.text;
    const say = (label, state) => onStep && onStep(label, state);

    say("Breaking the question down", "run");
    let subq = [query];
    try {
      const r = await A.stream({
        model: chain[0], fallbackChain: chain, taskKey: "deep", signal,
        thinking: "disabled", temperature: 0.3, maxTokens: 300,
        messages: [{ role: "user", content: Ace.PROMPTS.deepSubqueries(query) }]
      });
      const mm = (r.content || "").match(/\[[\s\S]*\]/);
      if (mm) { const arr = JSON.parse(mm[0]); if (Array.isArray(arr) && arr.length) subq = arr.slice(0, 5).map(String); }
    } catch (e) { if (e.name === "AbortError") throw e; }

    say(`Searching — ${subq.length} angles`, "run");
    const searches = await Promise.all(subq.map(async (q, i) => {
      say(`Search ${i + 1}/${subq.length}: ${q.slice(0, 60)}`, "run");
      try {
        // free live references (Wikipedia + DDG) first — always available, real citations
        const refs = await A.freeWebSearch(q).catch(() => []);
        let facts = refs.length ? "Reference material:\n" + refs.map((r, k) => `(${k + 1}) ${r.title} (${r.media}): ${r.content}`).join("\n") : "";
        let sources = refs.slice();
        // tool-grounded pass too (activates when the Z.ai key has search quota)
        try {
          const r = await A.searchChat({
            model: Ace.ROUTE.web, fallbackChain: [Ace.ROUTE.web], taskKey: "web", signal,
            maxTokens: 700, temperature: 0.4,
            messages: [
              { role: "system", content: "You are a research assistant with live web search. Search the web and report ONLY key facts you actually found (with dates/numbers when present) and the exact source URLs. 3-6 tight bullet points. If the search doesn't answer it, say 'not found'. Never invent facts or URLs." },
              { role: "user", content: q }
            ]
          });
          if (r.content && r.content.trim() && !/^\s*not found/i.test(r.content)) facts += "\n\nSearch results:\n" + r.content;
          const srcs = (r.sources && r.sources.length ? r.sources : A.extractSources(r.content));
          sources = sources.concat(srcs || []);
        } catch (e) { if (e.name === "AbortError") throw e; }
        return { q, facts, sources };
      } catch (e) {
        if (e.name === "AbortError") throw e;
        return { q, facts: "", sources: [], error: e.message };
      }
    }));

    say("Reading & synthesizing the brief", "run");
    const findings = searches.map((s, i) =>
      `### Sub-query ${i + 1}: ${s.q}\n${s.facts || "(no results)"}\nSources:\n${(s.sources || []).map(x => `- ${x.title} — ${x.link}`).join("\n") || "(none)"}`).join("\n\n");
    const synth = await A.stream({
      model: chain[0], fallbackChain: chain, taskKey: "deep", signal,
      temperature: 0.5, maxTokens: 4000,
      messages: [{ role: "user", content: Ace.PROMPTS.deepSynthesize(query, findings) }]
    });

    const allSources = [];
    searches.forEach(s => (s.sources || []).forEach(x => { if (!allSources.some(y => y.link === x.link)) allSources.push(x); }));
    say("Done", "done");
    return { report: synth.content, sources: allSources, subqueries: subq };
  };

  /* ---------- key test ---------- */
  A.testKey = async (key) => {
    const saved = A.key; A.key = key.trim();
    try {
      await A.chat({ model: "glm-4.5-flash", thinking: "disabled", maxTokens: 8,
        messages: [{ role: "user", content: "Reply with exactly: OK" }] });
      return { ok: true };
    } catch (e) { return { ok: false, error: e }; }
    finally { A.key = saved; }
  };

  Ace.API = A;
})();
