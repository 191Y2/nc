#!/usr/bin/env python3
"""Search engine matrix vs ground truth (BTC ~82k on 2026-10-18)."""
import json, urllib.request, urllib.error

KEY = "84defeb435fb416e8c19ab99f5e6f71a.7727UW2uFGeraDb5"
URL = "https://api.z.ai/api/paas/v4/chat/completions"

def call(tools, label):
    payload = {"model": "glm-4.5-flash", "max_tokens": 300, "thinking": {"type": "disabled"},
               "messages": [{"role": "user", "content": "What is Bitcoin's price in USD right now? Answer with just the number and source, e.g. '$X (source)'."}],
               "tools": tools}
    req = urllib.request.Request(URL, data=json.dumps(payload).encode(),
                                 headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            j = json.loads(r.read().decode())
            content = j["choices"][0]["message"].get("content", "")
            print(f"{label}: {content.strip()[:150]}")
    except urllib.error.HTTPError as e:
        print(f"{label}: HTTP {e.code} => {e.read().decode()[:200]}")
    except Exception as ex:
        print(f"{label}: ERR {ex}")

call([{"type": "web_search", "web_search": {"enable": "True", "search_result": "True", "search_engine": "search-prime", "count": 5}}], "prime")
call([{"type": "web_search", "web_search": {"enable": "True", "search_result": "True", "search_engine": "search_std", "count": 5}}], "search_std")
call([{"type": "web_search", "web_search": {"enable": "True", "search_result": "True", "count": 5}}], "no-engine")
call([{"type": "web_search", "web_search": {"enable": True, "search_result": True, "search_engine": "search-pro", "count": 5}}], "search-pro-bool")
print("TRUTH: ~$82,000 (Yahoo/CMC, 2026-10-18)")
