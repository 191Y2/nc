# ⚡ Ace — AI Study Copilot

A single-folder, **100% static** AI chat + agentic app built for school work. Runs on **GitHub Pages** (github.io), works on school Chromebooks, no server, no build step, no Node.js.

Powered by **GLM models from Z.ai** — with real memory, live web references that don't hallucinate, interactive quiz UI, rich answer cards (scorecards, comparisons, stats), photo homework solving, and a **Work mode** agent that plans → builds → reviews → ships real apps and games.

---

## ✨ What it does

| Feature | How it works |
|---|---|
| 🧠 **Real memory** | After conversations, a background pass extracts durable facts about you (grade, subjects, deadlines, goals). Memories are scored by importance × recency decay × relevance, reinforced when used, and injected into every chat — **across all chats, including old ones**. Manage everything in the 🧠 Memory panel. |
| 🌐 **Web that doesn't hallucinate** | The **Web** toggle pulls **live references from Wikipedia + DuckDuckGo** (free, no key) and forces the AI to ground claims in them with real citation chips. If the sources don't cover it, Ace says so instead of making things up. Keys with Z.ai balance also unlock the server-side `web_search` tool automatically. |
| 🔬 **Deep research** | The **Deep** toggle breaks your question into 3–5 sub-queries, searches them in parallel, and synthesizes a cited research brief with UI cards. |
| 🎯 **Quiz UI** | Ask to be quizzed and answers turn into **interactive quizzes** — multiple choice, multi-select, true/false, short answer — with instant feedback, explanations, scoring, retry, and a "make it harder 🔥" button. Multiple quizzes per message. |
| 📊 **Answer cards** | Ratings and comparisons render as **scorecards** (9.7/10 style), **KPI stat grids**, **comparison tables** with winner checkmarks, **timelines**, **flashcards**, **step-by-step** guides, **vocab cards**, and **study plans** — plus normal Markdown (headings, lists, tables) for casual answers. |
| 🖼️ **Photo homework** | Upload / **Ctrl+V paste** / drag & drop images (up to 4 per message). They route to the free **GLM-4.6V Flash** vision model. |
| 🛠️ **Work mode (agentic builder)** | Toggle **Chat → Work**. Describe an app or game; the agent **plans → builds (single-file HTML) → self-reviews → fixes → ships** with a live sandboxed preview, full-screen run, download button, and version iteration ("make X better" → v2). |
| 💡 **Think** toggle | Routes hard questions to the flagship model chain. |
| 🎙️ **Voice input** | Mic button (Chrome, uses your browser's speech recognition). |
| ☁️ **Firebase sync** | Chats + memories sync to **your** Firebase (anonymous auth). If Firebase is unreachable, the app silently saves to this device instead — it never blocks you. |
| 🔑 **Key stays out of GitHub** | Your Z.ai API key is pasted once on first launch and stored in your Firestore (`config/secrets`) — it never ships in the repo, and everyone you share the deployed app with gets it automatically. |

**Smart model routing (auto):** casual chat → `GLM-4.5 Flash` (free) · images → `GLM-4.6V Flash` (free) · web/deep/think/work → flagship chain (`GLM-5.3` → … → free Flash fallback). If a premium model isn't covered by your key's balance, Ace **automatically falls back to the free model** and keeps working — you'll see a small notice.

---

## 🚀 Deploy to GitHub Pages (~4 minutes)

1. **Create a repo** on GitHub (public or private — GitHub Pages on free plans needs public, or use Pro).
2. **Upload the contents of this folder** (the `ace/` folder: `index.html`, `css/`, `js/`) to the repo root — drag & drop on github.com works, or:
   ```bash
   git init && git add . && git commit -m "Ace" && git push https://github.com/YOU/YOUR-REPO.git main
   ```
3. **Turn on Pages:** repo → Settings → Pages → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.
4. Wait ~1 minute → your app is live at `https://YOU.github.io/REPO-NAME/`.

> Nothing in the repo contains your API key. It gets stored in your Firebase only.

---

## 🔥 One-time Firebase setup (~3 minutes)

This makes chats/memories sync across devices and shares your API key with anyone opening the app.

1. Open the [Firebase Console](https://console.firebase.google.com) → project **chat-84076** (the config is already wired in `js/config.js`).
2. **Anonymous auth:** Build → Authentication → Get started → Sign-in method → **Anonymous → Enable**.
3. **Add your GitHub Pages domain:** Authentication → Settings → **Authorized domains** → Add domain → `YOU.github.io` (add `preview-….space-z.ai` too if you want the preview link to sync).
4. **Create Firestore:** Build → Firestore Database → Create database → Start in **production mode** → pick a region.
5. **Paste these rules** (Firestore → Rules tab → Publish):
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // shared API key: readable by anyone using the app (signed-in anon),
       // writable only from the console or the app's first-run setup
       match /config/secrets {
         allow read: if request.auth != null;
         allow write: if request.auth != null;  // lock to false + seed manually if you prefer
       }
       // each user can only touch their own data
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
   > Stricter option: set the secrets rule to `allow write: if false;` and add the key by hand in Firestore → Start collection `config` → doc `secrets` → field `apiKey` (string).

6. **Open your deployed app** → paste your Z.ai API key → **Launch Ace**. Done — the key now lives in Firebase and everyone who opens the app can use it (nothing in GitHub).

**If you skip Firebase setup:** the app still works fully — it shows *"Saved on this device"* and keeps everything in the browser. No blockers, just no cloud sync.

---

## 🗝️ API key notes

- Get a free key at **z.ai → API Keys** (open platform).
- **Free tier (verified Oct 2026):** `glm-4.5-flash` (text — fast, thinks by default) and `glm-4.6v-flash` (vision). Ace routes everything to these by default so it **works with zero balance**.
- Flagship models (`glm-5.3`, `glm-5.2`, `glm-4.7`…) need credit or a resource package on your Z.ai account. If you see **error 1113**, Ace falls back to the free Flash model automatically. Top up at z.ai → Billing to unlock flagship quality for Work mode and Think mode.
- The Z.ai server-side web-search tool also requires balance on free keys — that's why Ace grounds web answers in **Wikipedia + DuckDuckGo references by default** (always free, always honest). Add balance and full web search activates on its own.

---

## 🏫 School / blocked-network notes

- The whole app is static HTML/CSS/JS from one folder — same as any website. It talks to `api.z.ai` (CORS-enabled, verified) and `en.wikipedia.org` / `api.duckduckgo.com` for references, plus `gstatic.com` for Firebase.
- If the school network blocks a domain, Ace degrades gracefully: no Firebase → local storage; no references → the AI says when it couldn't verify instead of guessing; no API → clear error with a retry.
- Works on managed Chromebooks (Chrome 89+), no installs.

---

## 🎮 Using Work mode

1. Toggle **Work** at the top.
2. Describe what you want: *"build a snake game with juice and high scores"*.
3. Watch the agent trace: **Plan → Build (streaming) → Review (score /10 + issues) → Fix → Ship**.
4. Play it in the embedded preview, **Open app** full screen, or **Download** the single `.html` file (works offline).
5. Ask for changes — *"add sound effects"* — it ships **v2** building on v1.

## 📁 Files

```
├── index.html        # app shell
├── css/style.css     # design system (dark, minimalist)
├── css/blocks.css    # AI UI component styles
└── js/
    ├── config.js     # firebase config, models, icons, helpers
    ├── prompts.js    # all system prompts (persona, UI protocol, agent, memory)
    ├── markdown.js   # safe markdown renderer
    ├── blocks.js     # quiz/scorecard/stats/compare/flashcards/steps/timeline/terms/table/progress
    ├── storage.js    # Firestore + localStorage fallback adapter
    ├── api.js        # Z.ai client: streaming, vision, web refs, deep research, fallbacks
    ├── memory.js     # extraction, recall scoring, summaries, titles
    ├── images.js     # upload / paste / drag-drop / downscale
    ├── chat.js       # chat engine, sidebar, send flow, sources, export
    ├── work.js       # agentic builder pipeline
    └── app.js        # boot, settings, memory manager, toggles, voice
```

**Made for getting school work done — and getting your friend into college.** ⚡
