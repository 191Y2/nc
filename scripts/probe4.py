#!/usr/bin/env python3
"""Final probe: web_search tool with enable flag + standalone web_search API."""
import json, urllib.request, urllib.error

KEY = "84defeb435fb416e8c19ab99f5e6f71a.7727UW2uFGeraDb5"

def post(url, payload, label, n=1600):
    print(f"\n===== {label} =====")
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=150) as r:
            body = r.read().decode()
            print(body[:n])
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, "=>", e.read().decode()[:n])
    except Exception as ex:
        print("ERR", ex)

# A) chat completion + web_search tool with enable:true (boolean form)
post("https://api.z.ai/api/paas/v4/chat/completions",
     {"model": "glm-4.5-flash", "max_tokens": 600, "thinking": {"type": "disabled"},
      "messages": [{"role": "user", "content": "What is today's date? Give one real AI news headline from October 2026 with source link."}],
      "tools": [{"type": "web_search", "web_search": {"enable": True, "search_engine": "search-prime",
                                                      "search_result": True, "count": 5}}]},
     "A) chat + web_search enable:true (boolean)")

# B) standalone web_search API
post("https://api.z.ai/api/paas/v4/web_search",
     {"search_engine": "search-prime", "search_query": "AI news October 2026", "count": 5},
     "B) standalone /web_search API")

# C) enable as string "True" if A failed visually — just try both
post("https://api.z.ai/api/paas/v4/chat/completions",
     {"model": "glm-4.5-flash", "max_tokens": 300, "thinking": {"type": "disabled"},
      "messages": [{"role": "user", "content": "Current Bitcoin price today? One line with source."}],
      "tools": [{"type": "web_search", "web_search": {"enable": "True", "search_engine": "search-prime",
                                                      "search_result": "True", "count": 5}}]},
     "C) chat + web_search enable:'True' (string)")
print("\nDONE")
