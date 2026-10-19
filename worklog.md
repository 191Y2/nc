---
Task ID: 1
Agent: main (Z.ai GLM)
Task: Build "Ace" — static AI study copilot (chat + agentic Work mode) for GitHub Pages, per user's two-message brief: ChatGPT-style dark UI with Chat/Work toggle, real memory, non-hallucinating web search, image upload/paste/drag-drop, AI UI blocks (quiz, scorecard, stats, compare etc. incl. sales-style cards), Firebase persistence, Z.ai API key stored in Firebase not repo, agentic app/game builder, free-tier GLM models.

Work Log:
- Probed Z.ai API with the user's key: models list (glm-5.3 family live in 2026), CORS matrix (POST echoes ACAO for any origin; browser preflight passes), vision candidates (glm-4.6v-flash exists+works free; glm-4.5-flash text-only), web_search tool formats (string "enable":"True" required; thinking must be disabled), streaming SSE shape (delta.content + delta.reasoning_content), error codes (1113 balance, 1211 unknown model, 1000 auth).
- Verified ground truth via WebSearch: web_search tool silently no-ops on free keys (all "prices" hallucinated vs real ~$82k BTC) → designed honesty layer: Wikipedia + DuckDuckGo CORS-open free references injected into prompt with strict anti-hallucination rules + citation chips.
- Built static app in /home/z/my-project/download/ace/ (index.html, css/style.css, css/blocks.css, 11 js modules ~4.5k lines): config, prompts, markdown renderer, blocks system (10 UI components incl. interactive quiz engine with scoring/retry/harder), storage adapter (Firestore + localStorage fallback), api client (streaming, vision routing, free web refs, deep research orchestration, model fallback chain), memory (salience extraction, importance×recency×overlap recall, reinforcement, deadline expiry, rolling summaries, titles), images (upload/paste/drop/downscale), chat engine, work agent (plan→build→review→fix→ship with live sandboxed preview + versions), app shell (setup screen, settings, memory manager, model popover, voice input).
- Wired Next.js preview: src/app/page.tsx fullscreen iframe → /ace (public/ace), plus optional same-origin proxy routes /api/zai/chat + /api/zai/ping (auto-detected by the app; sandbox egress blocks browser POSTs to the LLM endpoint; GitHub Pages goes direct, CORS-verified).
- E2E tested with agent-browser: setup+key, streaming chat, quiz block full interaction, scorecard/compare/stats blocks, memory extraction+manager, web references (real en.wikipedia.org chips), vision routing (GLM-4.6V Flash), Work mode (cookie clicker: plan→build 19KB→review 7/10→ship with live preview), fallback chain (glm-5.3 1113 → flash + toast), mobile responsive, root iframe page.
- Fixed bugs found during E2E: history[0] clobbering system prompt, API key double-JSON-quoting, match()[1] vs [0] in JSON extraction, Ace.UI not exposed, autoWeb regex matching "scorecard", images in history breaking text models, planner burning max_tokens on reasoning (thinking disabled for structured tasks), ```json fences now shape-inferred to correct block type.
- VLM visual QA on screenshots: "polished, professional, no rendering errors".
- Packaged download/ace.zip (71KB), README.md with full GitHub Pages + Firebase deploy guide (anon auth, authorized domains, Firestore rules, key seeding).

Stage Summary:
- Deliverable: /home/z/my-project/download/ace/ (+ ace.zip) — deploy-and-done static app; live preview at Next.js root page.
- Key decisions: free-tier-first model routing with automatic fallback; honesty-first web grounding (wiki+DDG refs, tool activates with balance); API key stored in Firestore config/secrets, never in repo; sandbox proxy auto-detection for preview.
- All 10 todo items complete; E2E verified in browser.
