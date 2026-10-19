(async () => {
  const KEY = "84defeb435fb416e8c19ab99f5e6f71a.7727UW2uFGeraDb5";
  const SYS = Ace.PROMPTS.chat({ webSearch: true });
  const mk = (label, payload) =>
    fetch("/api/zai/chat", {
      method: "POST",
      headers: { "Authorization": "Bearer " + KEY, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(r => r.text())
      .then(t => {
        const cs = [...t.matchAll(/"content":"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]).join("");
        return label + ": " + cs.slice(0, 160);
      })
      .catch(e => label + " ERR: " + e.message);

  const TOOLS = [{ type: "web_search", web_search: { enable: "True", search_engine: "search-prime", search_result: "True", count: 5 } }];
  const q = "Current Bitcoin price today? one line + source name";
  const base = { model: "glm-4.5-flash", stream: true, thinking: { type: "disabled" }, tools: TOOLS };

  const a = await mk("A-realsys-notemp", Object.assign({}, base, {
    max_tokens: 300,
    messages: [{ role: "system", content: SYS }, { role: "user", content: q }]
  }));
  const b = await mk("B-short-temp+maxtok", Object.assign({}, base, {
    max_tokens: 4000, temperature: 0.5,
    messages: [{ role: "system", content: "You are Ace, a helpful student assistant." }, { role: "user", content: q }]
  }));
  const c = await mk("C-realsys-temp+maxtok", Object.assign({}, base, {
    max_tokens: 4000, temperature: 0.5,
    messages: [{ role: "system", content: SYS }, { role: "user", content: q }]
  }));
  return a + "  |||  " + b + "  |||  " + c;
})()
