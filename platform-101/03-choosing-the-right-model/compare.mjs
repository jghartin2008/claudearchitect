// Lesson 3: same prompt through each model tier, compare latency and token usage.
// Run from platform-101/ after exporting ENG_AI_MODEL_GW_KEY (may need VPN):
//   node 03-choosing-the-right-model/compare.mjs
//   GW_MODELS=id1,id2 node 03-choosing-the-right-model/compare.mjs   # override the picks
import { requireKey, gw, listModelIds } from "../lib/gateway.mjs";

const prompt = "Explain what an API rate limit is, in two sentences.";
const key = requireKey();

try {
  const ids = await listModelIds(key);

  // Default: first gateway model matching each tier, cheapest first. Fable is skipped (highest cost).
  const picked = process.env.GW_MODELS
    ? process.env.GW_MODELS.split(",").map((s) => s.trim())
    : ["haiku", "sonnet", "opus"].map((tier) => ids.find((id) => id.toLowerCase().includes(tier)));

  const missing = picked.filter((id) => !id || !ids.includes(id));
  if (missing.length) {
    console.error(`Some tiers have no match. Set GW_MODELS=<ids>. Available:\n${ids.join("\n")}`);
    process.exit(1);
  }

  for (const model of picked) {
    const start = performance.now();
    const data = await gw(key, "/chat/completions", {
      model,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const secs = ((performance.now() - start) / 1000).toFixed(2);
    const u = data?.usage ?? {};
    console.log(`\n== ${model} | ${secs}s | in ${u.prompt_tokens ?? "?"} / out ${u.completion_tokens ?? "?"} tokens`);
    console.log(data?.choices?.[0]?.message?.content ?? "(unexpected response shape)");
  }
} catch (err) {
  console.error(`Gateway call failed: ${err.message}`);
  process.exit(1);
}
