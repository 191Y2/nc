#!/usr/bin/env python3
"""Final checks: web_search + thinking coexistence, streaming with search, vision fast mode, reasoning stream shape."""
import json, urllib.request, urllib.error

KEY = "84defeb435fb416e8c19ab99f5e6f71a.7727UW2uFGeraDb5"
CHAT = "https://api.z.ai/api/paas/v4/chat/completions"

def post(payload, label, n=1200):
    print(f"\n===== {label} =====")
    req = urllib.request.Request(CHAT, data=json.dumps(payload).encode(),
                                 headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=150) as r:
            print(r.read().decode()[:n])
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, "=>", e.read().decode()[:n])

WS = [{"type": "web_search", "web_search": {"enable": "True", "search_engine": "search-prime", "search_result": "True", "count": 5}}]

# 1) web_search + thinking DEFAULT (enabled) — does search still ground it?
post({"model": "glm-4.5-flash", "max_tokens": 400, "tools": WS,
      "messages": [{"role": "user", "content": "Current price of Apple stock? One line + source name."}]},
     "1) web_search + thinking ON")

# 2) streaming + web_search — SSE shape, check delta fields
print("\n===== 2) streaming + web_search =====")
payload = {"model": "glm-4.5-flash", "max_tokens": 300, "stream": True, "thinking": {"type": "disabled"},
           "tools": WS, "messages": [{"role": "user", "content": "Who won the most recent F1 race? One line + source."}]}
req = urllib.request.Request(CHAT, data=json.dumps(payload).encode(),
                             headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=150) as r:
        fields, lines = set(), 0
        for raw in r:
            s = raw.decode().strip()
            if not s.startswith("data:"): continue
            lines += 1
            try:
                j = json.loads(s[5:])
                d = j.get("choices", [{}])[0].get("delta", {})
                for k in d: fields.add(k)
            except Exception: pass
        print("chunks:", lines, "| delta fields seen:", sorted(fields))
except Exception as ex:
    print("ERR", ex)

# 3) vision fast mode: glm-4.6v-flash + thinking disabled + red square image
import base64, struct, zlib
def red_png():
    w = h = 8
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * w for _ in range(h))
    def ch(t, d):
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    return base64.b64encode(b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                            + ch(b"IDAT", zlib.compress(raw)) + ch(b"IEND", b"")).decode()
post({"model": "glm-4.6v-flash", "max_tokens": 60, "thinking": {"type": "disabled"},
      "messages": [{"role": "user", "content": [
          {"type": "image_url", "image_url": {"url": "data:image/png;base64," + red_png()}},
          {"type": "text", "text": "What color is this square? One word."}]}]},
     "3) glm-4.6v-flash thinking disabled")

# 4) glm-4.5-flash default thinking + streaming — reasoning_content delta shape
print("\n===== 4) streaming + thinking ON (reasoning shape) =====")
payload = {"model": "glm-4.5-flash", "max_tokens": 200, "stream": True,
           "messages": [{"role": "user", "content": "What is 17*23? Think briefly."}]}
req = urllib.request.Request(CHAT, data=json.dumps(payload).encode(),
                             headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=120) as r:
        fields, first = set(), None
        for raw in r:
            s = raw.decode().strip()
            if not s.startswith("data:"): continue
            try:
                j = json.loads(s[5:])
                d = j.get("choices", [{}])[0].get("delta", {})
                for k in d: fields.add(k)
                if first is None and d: first = json.dumps(d)[:150]
            except Exception: pass
        print("delta fields seen:", sorted(fields), "| first delta:", first)
except Exception as ex:
    print("ERR", ex)
print("\nDONE")
