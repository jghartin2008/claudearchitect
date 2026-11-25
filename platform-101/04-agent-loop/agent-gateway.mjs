// Lesson 4: the agent loop via the internal LLM Gateway Express (OpenAI-compatible).
// Differences from the Anthropic SDK version in the lesson:
//   tools are { type: "function", function: { name, description, parameters } }
//   stop signal is finish_reason ("stop" = end_turn, "tool_calls" = tool_use)
//   tool results go back as { role: "tool", tool_call_id, content }
// Run from platform-101/ after exporting ENG_AI_MODEL_GW_KEY (may need VPN):
//   node 04-agent-loop/agent-gateway.mjs
import { requireKey, gw, listModelIds } from "../lib/gateway.mjs";

const MAX_TURNS = 10; // guardrail: a misbehaving model must not loop forever

const tools = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get the current weather for a city.",
      parameters: {
        type: "object",
        properties: { city: { type: "string", description: "The city to get weather for" } },
        required: ["city"],
      },
    },
  },
];

// Hardcoded lookup; in a real app this would hit a database or API.
function runTool(name, input) {
  if (name === "get_weather" && typeof input?.city === "string") {
    return `Weather in ${input.city}: 95F, sunny`;
  }
  throw new Error(`Unknown tool or bad input: ${name}`);
}

const key = requireKey();

try {
  const ids = await listModelIds(key);
  const model = process.env.GW_MODEL ?? ids.find((id) => /sonnet/i.test(id));
  if (!model || !ids.includes(model)) {
    console.error(`Pick a model with GW_MODEL=<id>. Available:\n${ids.join("\n")}`);
    process.exit(1);
  }

  const messages = [{ role: "user", content: "What should I wear in Austin today?" }];

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const data = await gw(key, "/chat/completions", { model, max_tokens: 1024, tools, messages });
    const choice = data?.choices?.[0];
    if (!choice?.message) throw new Error("Unexpected response shape from gateway.");
    const { message, finish_reason } = choice;
    console.log(`turn ${turn}: finish_reason=${finish_reason}`);

    if (finish_reason === "tool_calls" && message.tool_calls?.length) {
      messages.push(message); // the assistant turn, including its tool_calls
      for (const call of message.tool_calls) {
        let result;
        try {
          // Arguments arrive as a JSON string from the model: parse at the trust boundary.
          result = runTool(call.function.name, JSON.parse(call.function.arguments));
        } catch (err) {
          result = `Error: ${err.message}`; // let the model see and recover from tool errors
        }
        console.log(`  tool ${call.function.name}(${call.function.arguments}) -> ${result}`);
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
      continue;
    }

    console.log(`\n${message.content}`);
    process.exit(0);
  }
  console.error(`Stopped after ${MAX_TURNS} turns without a final answer.`);
  process.exit(1);
} catch (err) {
  console.error(`Gateway call failed: ${err.message}`);
  process.exit(1);
}
