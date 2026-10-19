/* ============================================================
   Ace — storage.js · unified storage: Firestore cloud sync with
   automatic localStorage fallback. Never blocks the UI: if
   Firebase can't be reached (blocked network / unauthorized
   domain), the app runs fully in local mode.
   ============================================================ */
"use strict";
window.Ace = window.Ace || {};
(function () {
  const LS = {
    KEY: "ace:v1:key", SET: "ace:v1:settings", CHATS: "ace:v1:chats", MEM: "ace:v1:memories"
  };
  const S = {
    mode: "local", uid: null, _db: null, _statusCbs: [], _ready: null
  };

  const status = (txt, kind) => S._statusCbs.forEach(cb => { try { cb(txt, kind); } catch (e) {} });
  S.onStatus = (cb) => { S._statusCbs.push(cb); };

  const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn("quota", e); } };

  function withTimeout(promiseOrFn, ms, tag) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout:" + tag)), ms);
      Promise.resolve(promiseOrFn).then(v => { clearTimeout(t); resolve(v); },
        e => { clearTimeout(t); reject(e); });
    });
  }

  /* ---------- LOCAL BACKEND ---------- */
  const local = {
    getSharedKey: async () => {
      let v = localStorage.getItem(LS.KEY);
      if (v == null) return null;
      v = v.trim();
      try { const p = JSON.parse(v); if (typeof p === "string") v = p; } catch (e) {}
      return v.replace(/^["']|["']$/g, "").trim() || null;
    },
    setSharedKey: async (k) => localStorage.setItem(LS.KEY, String(k).trim()),
    getSettings: async () => jget(LS.SET, {}),
    saveSettings: async (patch) => { const s = Object.assign(jget(LS.SET, {}), patch); jset(LS.SET, s); return s; },
    listChats: async () => jget(LS.CHATS, []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    createChat: async (c) => { const all = jget(LS.CHATS, []); all.push(c); jset(LS.CHATS, all); return c; },
    updateChat: async (id, patch) => {
      const all = jget(LS.CHATS, []); const c = all.find(x => x.id === id);
      if (c) Object.assign(c, patch, { updatedAt: Date.now() });
      jset(LS.CHATS, all); return c;
    },
    deleteChat: async (id) => { jset(LS.CHATS, jget(LS.CHATS, []).filter(c => c.id !== id)); return true; },
    listMessages: async (chatId) => {
      const c = jget(LS.CHATS, []).find(x => x.id === chatId);
      return c ? (c.messages || []) : [];
    },
    addMessage: async (chatId, m) => {
      const all = jget(LS.CHATS, []); const c = all.find(x => x.id === chatId);
      if (!c) return;
      c.messages = (c.messages || []).concat([m]);
      c.updatedAt = Date.now(); c.msgCount = c.messages.length;
      jset(LS.CHATS, all); return m;
    },
    updateMessage: async (chatId, mid, patch) => {
      const all = jget(LS.CHATS, []); const c = all.find(x => x.id === chatId);
      if (!c) return; const m = (c.messages || []).find(x => x.id === mid);
      if (m) Object.assign(m, patch);
      jset(LS.CHATS, all); return m;
    },
    listMemories: async () => jget(LS.MEM, []),
    saveMemory: async (m) => {
      const all = jget(LS.MEM, []);
      const i = all.findIndex(x => x.id === m.id);
      if (i >= 0) all[i] = m; else all.unshift(m);
      jset(LS.MEM, all); return m;
    },
    deleteMemory: async (id) => jset(LS.MEM, jget(LS.MEM, []).filter(m => m.id !== id)),
    clearAll: async () => { [LS.CHATS, LS.MEM, LS.SET].forEach(k => localStorage.removeItem(k)); }
  };

  /* ---------- CLOUD BACKEND (Firestore) ---------- */
  function cloud() {
    const db = S._db, U = () => db.collection("users").doc(S.uid);
    const keep = (m) => {
      // Firestore doc limit ~1MB: drop oversized image payloads
      let size = (m.content || "").length + JSON.stringify(m.uiStates || {}).length;
      const imgs = (m.images || []).map(im => (im.dataUrl || "").length);
      if (size + imgs.reduce((a, b) => a + b, 0) > 750000) m.images = [];
      return m;
    };
    return {
      async getSharedKey() {
        try {
          const snap = await withTimeout(db.collection("config").doc("secrets").get(), 8000, "key");
          return (snap.exists && snap.data().apiKey) || null;
        } catch (e) { return null; }
      },
      async setSharedKey(k) {
        await withTimeout(db.collection("config").doc("secrets").set({ apiKey: k, updatedAt: Date.now() }, { merge: true }), 10000, "setkey");
      },
      async getSettings() {
        const snap = await withTimeout(U().get(), 8000, "settings");
        return (snap.exists && snap.data().settings) || {};
      },
      async saveSettings(patch) {
        const cur = await this.getSettings();
        const next = Object.assign(cur, patch);
        await withTimeout(U().set({ settings: next, updatedAt: Date.now() }, { merge: true }), 8000, "setsettings");
        return next;
      },
      async listChats() {
        const snap = await withTimeout(U().collection("chats")
          .orderBy("updatedAt", "desc").limit(300).get(), 12000, "chats");
        return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      },
      async createChat(c) {
        await withTimeout(U().collection("chats").doc(c.id).set(c), 8000, "newchat");
        return c;
      },
      async updateChat(id, patch) {
        await withTimeout(U().collection("chats").doc(id).set(patch, { merge: true }), 8000, "updchat");
      },
      async deleteChat(id) {
        const msgs = await U().collection("chats").doc(id).collection("messages").get();
        const batch = db.batch();
        msgs.docs.forEach(d => batch.delete(d.ref));
        batch.delete(U().collection("chats").doc(id));
        await withTimeout(batch.commit(), 12000, "delchat");
      },
      async listMessages(chatId) {
        const snap = await withTimeout(U().collection("chats").doc(chatId).collection("messages")
          .orderBy("createdAt", "asc").limit(500).get(), 12000, "msgs");
        return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      },
      async addMessage(chatId, m) {
        await withTimeout(U().collection("chats").doc(chatId).collection("messages")
          .doc(m.id).set(keep(m)), 10000, "addmsg");
        return m;
      },
      async updateMessage(chatId, mid, patch) {
        await withTimeout(U().collection("chats").doc(chatId).collection("messages")
          .doc(mid).set(patch, { merge: true }), 8000, "updmsg");
      },
      async listMemories() {
        const snap = await withTimeout(U().collection("memories")
          .orderBy("createdAt", "desc").limit(500).get(), 12000, "mems");
        return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      },
      async saveMemory(m) {
        await withTimeout(U().collection("memories").doc(m.id).set(m, { merge: true }), 8000, "savemem");
        return m;
      },
      async deleteMemory(id) {
        await withTimeout(U().collection("memories").doc(id).delete(), 8000, "delmem");
      },
      async clearAll() { /* keep cloud data; local wipe handled by caller */ }
    };
  }

  /* ---------- INIT ---------- */
  S.init = () => {
    if (S._ready) return S._ready;
    S._ready = (async () => {
      // migrate any key stored by older versions
      try {
        if (typeof firebase === "undefined") throw new Error("no firebase sdk");
        firebase.initializeApp(Ace.FIREBASE_CONFIG);
        status("Connecting…", "busy");
        const auth = firebase.auth();
        await withTimeout(auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL), 4000, "persist").catch(() => {});
        await withTimeout(auth.signInAnonymously(), 9000, "auth");
        await new Promise(res => {
          const un = auth.onAuthStateChanged(u => { un(); res(u); });
          setTimeout(() => res(auth.currentUser), 5000);
        });
        const u = auth.currentUser;
        if (!u) throw new Error("no anon user");
        S.uid = u.uid; S._db = firebase.firestore();
        // verify write access quickly
        await withTimeout(U0(S._db, u.uid).set({ updatedAt: Date.now() }, { merge: true }), 9000, "probe");
        S.mode = "cloud";
        status("Cloud synced", "ok");
        return S;
      } catch (e) {
        console.warn("Cloud unavailable, using local storage:", e && e.message);
        S.mode = "local"; S.uid = "local-" + (jget("ace:v1:uid", null) || (() => {
          const id = Ace.uid(); localStorage.setItem("ace:v1:uid", JSON.stringify(id)); return id;
        })());
        status("Saved on this device", "local");
        return S;
      }
    })();
    return S._ready;
  };
  function U0(db, uid) { return db.collection("users").doc(uid); }

  /* pick backend per call; cloud failures degrade to local mid-session */
  function backend() {
    if (S.mode !== "cloud" || typeof firebase === "undefined" || !S._db) return local;
    return cloud();
  }
  function guard(fnName, ...args) {
    return backend()[fnName](...args).catch(err => {
      console.warn(`cloud ${fnName} failed → local fallback`, err && err.message);
      return local[fnName](...args);
    });
  }

  ["getSharedKey", "setSharedKey", "getSettings", "saveSettings", "listChats", "createChat",
   "updateChat", "deleteChat", "listMessages", "addMessage", "updateMessage",
   "listMemories", "saveMemory", "deleteMemory", "clearAll"]
    .forEach(fn => { S[fn] = (...a) => guard(fn, ...a); });

  Ace.Store = S;
})();
