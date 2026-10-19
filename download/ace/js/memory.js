/* ============================================================
   Ace — memory.js · long-term memory that actually works
   Techniques borrowed from cognitive science:
   • Salience-gated encoding — a background pass extracts durable
     facts (not chat trivia) after exchanges.
   • Consolidation — duplicates merge; deadlines expire.
   • Recall by cue — memories are scored by importance × recency
     decay × keyword overlap with the current message (top-K only).
   • Reinforcement — every time a memory is actually used it gets
     its access count bumped and recency refreshed (spacing effect).
   Plus rolling episodic summaries per chat, injected into context.
   ============================================================ */
"use strict";
window.Ace = window.Ace || {};
(function () {
  const M = { cache: [] };
  const STOP = new Set("the a an and or of to in for on with is are was were be been i you he she it we they my your his her its our their this that these those what when where who how why do does did have has had will would can could should about me".split(" "));

  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = (s) => norm(s).split(" ").filter(w => w.length > 2 && !STOP.has(w));

  async function reload() {
    try { M.cache = await Ace.Store.listMemories(); } catch (e) { M.cache = []; }
    return M.cache;
  }

  /* ---------- recall scoring ---------- */
  function score(mem, queryToks, now) {
    const days = Math.max(0, (now - (mem.lastAccessed || mem.createdAt || now)) / 86400000);
    const recency = Math.pow(0.965, days);                     // gentle forgetting curve
    const mToks = new Set(tokens(mem.content + " " + (mem.type || "")));
    let hits = 0; queryToks.forEach(t => { if (mToks.has(t)) hits++; });
    const overlap = queryToks.length ? hits / queryToks.length : 0.15;
    return (mem.importance || 3) * 0.55 + recency * 2.0 + overlap * 3.0 + (mem.pinned ? 2.5 : 0);
  }

  M.recall = async (query, k) => {
    if (!M.cache.length) await reload();
    const k2 = k || Ace.MEMORY_TOP_K;
    const qToks = tokens(query);
    const now = Date.now();
    const ranked = M.cache.map(m => ({ m, s: score(m, qToks, now) }))
      .sort((a, b) => b.s - a.s).slice(0, k2).filter(x => x.s > 1.2);
    // reinforce the ones we actually used
    ranked.forEach(({ m }) => {
      m.accessCount = (m.accessCount || 0) + 1;
      m.lastAccessed = Date.now();
      Ace.Store.saveMemory(m).catch(() => {});
    });
    return ranked.map(x => x.m);
  };

  M.all = async () => { if (!M.cache.length) await reload(); return M.cache; };

  /* ---------- consolidation sweep (run at boot) ---------- */
  M.sweep = async () => {
    await reload();
    const now = Date.now();
    let changed = false;
    for (const m of M.cache) {
      // expire stale deadlines (kept 4 days past due for review value)
      if (m.type === "deadline" && m.expiresAt && m.expiresAt < now - 4 * 86400000) {
        await Ace.Store.deleteMemory(m.id); changed = true; continue;
      }
      // decay: memories never accessed in ~6 months and low importance fade out
      const days = (now - (m.lastAccessed || m.createdAt || now)) / 86400000;
      if (!m.pinned && days > 180 && (m.importance || 3) <= 2) {
        await Ace.Store.deleteMemory(m.id); changed = true;
      }
    }
    if (changed) await reload();
    return M.cache;
  };

  /* ---------- salience-gated extraction (after each exchange) ---------- */
  M.extract = async (messages, chatId) => {
    const settings = await Ace.Store.getSettings();
    if (settings.autoMemory === false) return { added: 0, updated: 0, deleted: 0 };
    await reload();
    const recent = messages.slice(-4).map(m =>
      `${m.role === "user" ? "USER" : "ACE"}: ${String(m.content || "").slice(0, 500)}`).join("\n");
    if (!recent.trim()) return { added: 0, updated: 0, deleted: 0 };

    let res;
    try {
      res = await Ace.API.chat({
        model: Ace.ROUTE.memory, fallbackChain: [Ace.ROUTE.memory], taskKey: "memory",
        thinking: "disabled", temperature: 0.2, maxTokens: 600,
        messages: [{ role: "user", content: Ace.PROMPTS.memoryExtract(recent, M.cache) }]
      });
    } catch (e) { return { added: 0, updated: 0, deleted: 0, error: e.message }; }

    let ops = [];
    try {
      const mm = (res.content || "").match(/\{[\s\S]*\}/);
      if (mm) ops = (JSON.parse(mm[0]).ops || []).slice(0, 4);
    } catch (e) { ops = []; }

    let added = 0, updated = 0, deleted = 0;
    for (const op of ops) {
      try {
        if (op.action === "add" && op.content) {
          // merge near-duplicates instead of stacking
          const dup = M.cache.find(x => similarity(x.content, op.content) > 0.72);
          if (dup) {
            dup.content = op.content.length > dup.content.length ? op.content : dup.content;
            dup.importance = Math.max(dup.importance || 1, op.importance || 1);
            dup.lastAccessed = Date.now();
            await Ace.Store.saveMemory(dup); updated++;
          } else {
            const mem = {
              id: Ace.uid(), type: op.type || "fact", content: String(op.content).slice(0, 300),
              importance: Math.min(5, Math.max(1, op.importance || 3)),
              createdAt: Date.now(), lastAccessed: Date.now(), accessCount: 1,
              source: chatId || null, pinned: false,
              expiresAt: op.type === "deadline" ? guessDate(op.content) : null
            };
            await Ace.Store.saveMemory(mem); M.cache.unshift(mem); added++;
          }
        } else if (op.action === "update" && op.id) {
          const ex = M.cache.find(x => x.id === op.id);
          if (ex) { Object.assign(ex, { content: op.content || ex.content, importance: op.importance || ex.importance, lastAccessed: Date.now() });
            await Ace.Store.saveMemory(ex); updated++; }
        } else if (op.action === "delete" && op.id) {
          await Ace.Store.deleteMemory(op.id); updated++;
          M.cache = M.cache.filter(x => x.id !== op.id); deleted++;
        }
      } catch (e) { console.warn("mem op failed", e); }
    }
    if (added || deleted) {
      document.dispatchEvent(new CustomEvent("ace:memory-updated", { detail: { added, updated, deleted } }));
    }
    return { added, updated, deleted };
  };

  function similarity(a, b) {
    const A = new Set(tokens(a)), B = new Set(tokens(b));
    if (!A.size || !B.size) return 0;
    let inter = 0; A.forEach(t => { if (B.has(t)) inter++; });
    return inter / Math.min(A.size, B.size);
  }
  function guessDate(text) {
    const m = String(text).match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/) ||
      String(text).match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* (\d{1,2})\b/i);
    if (!m) return null;
    try {
      if (m[0].includes("-")) return new Date(m[0] + "T23:59:59").getTime();
      return new Date(m[0] + " 20" + (new Date().getFullYear() % 100) + " 23:59:59").getTime();
    } catch (e) { return null; }
  }

  /* ---------- rolling episodic summary per chat ---------- */
  M.summarize = async (chat, messages) => {
    if (!messages || messages.length < Ace.SUMMARIZE_AFTER) return chat.summary || "";
    const transcript = messages.slice(-30).map(m =>
      `${m.role === "user" ? "USER" : "ACE"}: ${String(m.content || "").replace(/```[\s\S]*?```/g, "[UI block]").slice(0, 700)}`).join("\n");
    try {
      const r = await Ace.API.chat({
        model: Ace.ROUTE.memory, fallbackChain: [Ace.ROUTE.memory], taskKey: "memory",
        thinking: "disabled", temperature: 0.3, maxTokens: 500,
        messages: [{ role: "user", content: Ace.PROMPTS.summarize((chat.summary ? "Previous summary:\n" + chat.summary + "\n\n" : "") + transcript) }]
      });
      const sum = (r.content || "").slice(0, 1200);
      await Ace.Store.updateChat(chat.id, { summary: sum });
      return sum;
    } catch (e) { return chat.summary || ""; }
  };

  /* ---------- chat titles ---------- */
  M.genTitle = async (firstMsg, chatId) => {
    try {
      const r = await Ace.API.chat({
        model: Ace.ROUTE.title, fallbackChain: [Ace.ROUTE.title], taskKey: "title",
        thinking: "disabled", temperature: 0.3, maxTokens: 30,
        messages: [{ role: "user", content: Ace.PROMPTS.title(firstMsg) }]
      });
      const t = (r.content || "").replace(/[""'.\n]/g, "").trim().split(/\s+/).slice(0, 6).join(" ") || firstMsg.slice(0, 32);
      await Ace.Store.updateChat(chatId, { title: t });
      return t;
    } catch (e) { return firstMsg.slice(0, 32); }
  };

  Ace.Memory = M;
})();
