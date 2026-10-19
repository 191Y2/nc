#!/usr/bin/env python3
"""Find the web_search invocation format that actually triggers real search on Z.ai."""
import json, urllib.request, urllib.error

KEY = "84defeb435fb416e8c19ab99f5e6f71a.7727UW2uFGeraDb5"
URL = "https://api.z.ai/api/paas/v4/chat/completions"
Q = "What is today's date, and one real AI news headline from October 2026? Include a source URL."

def call(payload, label, n=1400):
    print(f"\n===== {label} =====")
    payload = dict(payload)
    payload["max_tokens"] = 500
    payload["messages"] = [{"role": "user", "content": Q}]
    payload["model"] = "glm-4.5-flash"
    req = urllib.request.Request(URL, data=json.dumps(payload).encode(),
                                 headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=150) as r:
            body = json.loads(r.read().decode())
            msg = body.get("choices", [{}])[0].get("message", {})
            content = (msg.get("content") or "")[:400]
            print("CONTENT:", content.replace("\n", " | "))
            print("HAS search_result FIELD:", "search_result" in json.dumps(body))
            keys = set(json.dumps(body, indent=1)[:4000].split('"'))
            hits = [k for k in ("search_result", "web_search", "tool_calls", "plugin", "citations", "annotations", "sources") if f'\n  "{k}"' in json.dumps(body, indent=1)]
            print("TOP-KEY HITS:", hits)
            print("USAGE:", body.get("usage"))
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, "=>", e.read().decode()[:400])
    except Exception as ex:
        print("ERR", ex)

# Variant 1: tools web_search, no engine specified
call({"tools": [{"type": "web_search", "web_search": {"search_result": True}}]}, "V1 tools/web_search {search_result}")

# Variant 2: top-level web_search object
call({"web_search": {"enable": True, "search_result": True}}, "V2 top-level web_search{enable}")

# Variant 3: top-level web_search bool
call({"web_search": True}, "V3 top-level web_search true")

# Variant 4: legacy plugins format
call({"plugins": [{"type": "web_search", "web_search": {"search_result": True}}]}, "V4 legacy plugins")

# Variant 5: tools + thinking disabled (maybe thinking mode bypasses tools)
call({"tools": [{"type": "web_search", "web_search": {"search_engine": "search_std", "search_result": True}}],
      "thinking": {"type": "disabled"}}, "V5 tools + thinking disabled")

print("\n=== STREAMING TEST (SSE shape) ===")
import ssl
payload = {"model": "glm-4.5-flash", "stream": True, "max_tokens": 40, "thinking": {"type": "disabled"},
           "messages": [{"role": "user", "content": "Count 1 to 5"}]}
req = urllib.request.Request(URL, data=json.dumps(payload).encode(),
                             headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        n = 0
        for line in r:
            s = line.decode().strip()
            if s.startswith("data:") and n < 8:
                print(s[:200]); n += 1
        print("...stream lines OK")
except Exception as ex:
    print("STREAM ERR", ex)
print("DONE")
