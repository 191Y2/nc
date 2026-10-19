// Optional same-origin passthrough for the Z.ai API.
// The static Ace app auto-detects this route when it exists (e.g. this
// sandbox preview). On GitHub Pages it doesn't exist, so the app calls
// api.z.ai directly (CORS is supported there).
// The key is always held client-side and forwarded via Authorization —
// nothing is stored server-side.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth) {
    return Response.json({ error: { code: "1001", message: "Missing Authorization header" } }, { status: 401 });
  }
  const body = await req.text();
  const upstream = await fetch("https://api.z.ai/api/paas/v4/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": auth,
      "Content-Type": "application/json",
      "Accept-Language": "en-US,en",
    },
    body,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
