// Lesson 2 (first API call) via the internal LLM Gateway Express (OpenAI-compatible,
// NOT the Anthropic SDK). Non-production only; never send customer data.
// Run from platform-101/ with the key typed into your shell, never into a file:
//   export ENG_AI_MODEL_GW_KEY=...   (may need VPN)
//   node 02-first-api-call/review-gateway.mjs            # picks the first "sonnet" model
//   GW_MODEL=<id from the list> node 02-first-api-call/review-gateway.mjs
const BASE = "https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl";
const key = process.env.ENG_AI_MODEL_GW_KEY;
if (!key) {
  console.error("ENG_AI_MODEL_GW_KEY is not set. Export it in your shell (not in a file).");
  process.exit(1);
}

async function call(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const buggyCode = `
function add(a, b) {
  return a - b;
}
`;

try {
  // Use only model IDs the gateway actually returns.
  const listed = await call("/v1/models");
  const ids = Array.isArray(listed?.data) ? listed.data.map((m) => m?.id).filter(Boolean) : [];
  if (ids.length === 0) throw new Error("Gateway returned no models.");

  const model = process.env.GW_MODEL ?? ids.find((id) => /sonnet/i.test(id));
  if (!model || !ids.includes(model)) {
    console.error(`Pick a model with GW_MODEL=<id>. Available:\n${ids.join("\n")}`);
    process.exit(1);
  }

  // OpenAI shape: the system prompt is a message, and text is in choices[0].message.content.
  const data = await call("/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [
        { role: "system", content: "You are a terse senior code reviewer. Give feedback in one paragraph." },
        { role: "user", content: `Review this code:\n${buggyCode}` },
      ],
    }),
  });

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("Unexpected response shape from gateway.");
  console.log(`[${model}]\n${text}`);
} catch (err) {
  console.error(`Gateway call failed: ${err.message}`);
  process.exit(1);
}
