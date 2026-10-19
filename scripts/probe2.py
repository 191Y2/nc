#!/usr/bin/env python3
"""Probe Z.ai API details: vision on free model, web_search shape, thinking toggle, streaming."""
import base64, json, struct, zlib, urllib.request, sys

KEY = "84defeb435fb416e8c19ab99f5e6f71a.7727UW2uFGeraDb5"
URL = "https://api.z.ai/api/paas/v4/chat/completions"

def make_red_png():
    """Create an 8x8 solid red PNG, return base64."""
    w = h = 8
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * w for _ in range(h))
    def chunk(t, d):
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
    return base64.b64encode(png).decode()

RED = make_red_png()
IMG = {"type": "image_url", "image_url": {"url": "data:image/png;base64," + RED}}

def call(payload, label, n=900):
    print(f"\n===== {label} =====")
    req = urllib.request.Request(URL, data=json.dumps(payload).encode(),
                                 headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = r.read().decode()
            print(body[:n])
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, "=>", e.read().decode()[:n])

# A) Does the FREE model accept images?
call({"model": "glm-4.5-flash", "max_tokens": 60,
      "messages": [{"role": "user", "content": [IMG, {"type": "text", "text": "What color is this square? One word."}]}]},
     "A) glm-4.5-flash + image (vision on free model?)")

# B) web_search tool shape on free model
call({"model": "glm-4.5-flash", "max_tokens": 400,
      "messages": [{"role": "user", "content": "What's one notable AI news story from the past week? Cite sources."}],
      "tools": [{"type": "web_search", "web_search": {"search_engine": "search_std", "search_result": True}}]},
     "B) glm-4.5-flash + web_search tool")

# C) thinking disabled on free model
call({"model": "glm-4.5-flash", "max_tokens": 40, "thinking": {"type": "disabled"},
      "messages": [{"role": "user", "content": "Reply with exactly: OK"}]},
     "C) glm-4.5-flash thinking disabled")

# D) extra vision model existence probes
for m in ["glm-4.6v-flash", "glm-4.5v-flash"]:
    call({"model": m, "max_tokens": 20,
          "messages": [{"role": "user", "content": [IMG, {"type": "text", "text": "color?"}]}]},
         f"D) existence probe: {m}", 300)
print("\nDONE")
