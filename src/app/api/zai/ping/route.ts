// Proxy availability probe for the static Ace app.
// If this responds, the app routes Z.ai calls through /api/zai/chat
// (same-origin). Otherwise it goes directly to api.z.ai.

export async function GET() {
  return Response.json({ ok: true, proxy: "zai" });
}
