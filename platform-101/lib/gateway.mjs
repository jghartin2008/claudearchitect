// Shared helpers for the internal LLM Gateway Express (OpenAI-compatible, not the Anthropic SDK).
// Non-production only; never send customer data. Limit: 50 requests/minute/user.
const BASE = "https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl";

export function requireKey() {
  const key = process.env.ENG_AI_MODEL_GW_KEY;
  if (!key) {
    console.error("ENG_AI_MODEL_GW_KEY is not set. Export it in your shell (not in a file).");
    process.exit(1);
  }
  return key;
}

export async function gw(key, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Only IDs the gateway actually returns are ever used.
export async function listModelIds(key) {
  const listed = await gw(key, "/v1/models");
  const ids = Array.isArray(listed?.data) ? listed.data.map((m) => m?.id).filter(Boolean) : [];
  if (ids.length === 0) throw new Error("Gateway returned no models.");
  return ids;
}
