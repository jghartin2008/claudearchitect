// Claude Platform 101, lesson 2: your first API call.
// Run from platform-101/:  node --env-file=.env.local 02-first-api-call/review.mjs
import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Put it in platform-101/.env.local (git-ignored).");
  process.exit(1);
}

const client = new Anthropic();

const buggyCode = `
function add(a, b) {
  return a - b;
}
`;

try {
  const response = await client.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 2048,
    system: "You are a terse senior code reviewer. Give feedback in one paragraph.",
    messages: [{ role: "user", content: `Review this code:\n${buggyCode}` }],
  });

  // content is an array of blocks (text, tool_use, thinking), so check each type.
  for (const block of response.content) {
    if (block.type === "text") console.log(block.text);
  }
} catch (err) {
  console.error(`API call failed: ${err.status ?? ""} ${err.message}`);
  process.exit(1);
}
